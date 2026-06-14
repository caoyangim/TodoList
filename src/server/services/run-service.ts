import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { noteFileService } from "@/server/services/note-file-service";
import {
  plainTextToNoteHtml,
  sanitizeNoteHtml,
} from "@/server/services/note-content-service";
import {
  runArchiveSchema,
  runInputSchema,
  runNodeNoteSchema,
  runTitleSchema,
  runUpdateSchema,
} from "@/shared/schemas/run";
import { calculateRunStatus } from "@/shared/run-status";
import { NoteContentDto, RunDto, RunNodeDto } from "@/shared/types/models";

type RunRow = {
  id: string;
  templateId: string;
  templateNameSnapshot: string;
  templateDescriptionSnapshot: string | null;
  title: string;
  version: string | null;
  startedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RunNodeRow = Omit<RunNodeDto, "isRequired" | "isParent" | "note"> & {
  note: string | null;
  isRequired: number;
};

function parseNote(value: string | null): NoteContentDto | null {
  if (!value) return null;

  let parsed: { html?: string; text?: string; fileIds?: string[]; imageIds?: string[] };
  try {
    parsed = JSON.parse(value) as {
      html?: string;
      text?: string;
      fileIds?: string[];
      imageIds?: string[];
    };
  } catch {
    return { html: plainTextToNoteHtml(value), files: [] };
  }

  const ids = parsed.fileIds ?? parsed.imageIds ?? [];
  return {
    html: parsed.html
      ? sanitizeNoteHtml(parsed.html).html
      : plainTextToNoteHtml(parsed.text ?? ""),
    files: noteFileService.getMany(ids),
  };
}

function getRun(id: string): RunDto | null {
  const run = db.prepare("SELECT * FROM SopRun WHERE id = ?").get(id) as RunRow | undefined;
  if (!run) return null;

  const rows = db.prepare(`
    SELECT id, nameSnapshot AS name, descriptionSnapshot AS description,
           note, sortOrder, isRequired, parentId, completedAt, firstCompletedAt, lastModifiedAt
    FROM SopRunNode WHERE runId = ? ORDER BY sortOrder
  `).all(id) as RunNodeRow[];
  const parentIds = new Set(rows.map((node) => node.parentId).filter(Boolean));
  const nodes: RunNodeDto[] = rows.map((node) => ({
    ...node,
    note: parseNote(node.note),
    isRequired: Boolean(node.isRequired),
    isParent: parentIds.has(node.id),
  }));
  const leaves = nodes.filter((node) => !node.isParent);
  const requiredLeaves = leaves.filter((node) => node.isRequired);
  const completedCount = leaves.filter((node) => node.completedAt).length;
  const requiredCompletedCount = requiredLeaves.filter((node) => node.completedAt).length;
  const progressLeaves = requiredLeaves.length > 0 ? requiredLeaves : leaves;
  const progressCompletedCount = progressLeaves.filter((node) => node.completedAt).length;

  return {
    id: run.id,
    templateId: run.templateId,
    templateName: run.templateNameSnapshot,
    templateDescription: run.templateDescriptionSnapshot,
    title: run.title,
    version: run.version,
    status: calculateRunStatus(run.startedAt, run.completedAt),
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    archivedAt: run.archivedAt,
    completedCount,
    totalCount: leaves.length,
    requiredCompletedCount,
    requiredTotalCount: requiredLeaves.length,
    progressPercent: progressLeaves.length
      ? Math.round((progressCompletedCount / progressLeaves.length) * 100)
      : 0,
    nodes,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function recalculateRun(run: RunDto, now: string) {
  const leaves = run.nodes.filter((node) => !node.isParent);
  const requiredLeaves = leaves.filter((node) => node.isRequired);
  const completionTargets = requiredLeaves.length > 0 ? requiredLeaves : leaves;
  const anyCompleted = leaves.some((node) => node.completedAt);
  const allTargetsCompleted =
    completionTargets.length > 0 && completionTargets.every((node) => node.completedAt);

  db.prepare("UPDATE SopRun SET startedAt = ?, completedAt = ?, updatedAt = ? WHERE id = ?")
    .run(
      anyCompleted ? run.startedAt ?? now : null,
      allTargetsCompleted ? run.completedAt ?? now : null,
      now,
      run.id,
    );
}

function recalculateParents(runId: string, now: string) {
  const parents = db.prepare(`
    SELECT DISTINCT p.id
    FROM SopRunNode p
    INNER JOIN SopRunNode c ON c.parentId = p.id
    WHERE p.runId = ?
  `).all(runId) as { id: string }[];

  const getChildren = db.prepare("SELECT completedAt FROM SopRunNode WHERE parentId = ?");
  const updateParent = db.prepare(`
    UPDATE SopRunNode
    SET completedAt = ?, firstCompletedAt = ?, lastModifiedAt = ?, updatedAt = ?
    WHERE id = ?
  `);
  parents.forEach((parent) => {
    const children = getChildren.all(parent.id) as { completedAt: string | null }[];
    const allCompleted = children.length > 0 && children.every((child) => child.completedAt);
    const current = db.prepare(
      "SELECT completedAt, firstCompletedAt, lastModifiedAt FROM SopRunNode WHERE id = ?",
    ).get(parent.id) as {
      completedAt: string | null;
      firstCompletedAt: string | null;
      lastModifiedAt: string | null;
    };
    const statusChanged = Boolean(current.completedAt) !== allCompleted;
    updateParent.run(
      allCompleted ? current.completedAt ?? now : null,
      allCompleted ? current.firstCompletedAt ?? now : current.firstCompletedAt,
      statusChanged ? now : current.lastModifiedAt,
      statusChanged ? now : current.lastModifiedAt ?? now,
      parent.id,
    );
  });
}

export const runService = {
  async list() {
    const rows = db.prepare("SELECT id FROM SopRun ORDER BY updatedAt DESC").all() as { id: string }[];
    return rows.map((row) => getRun(row.id) as RunDto);
  },

  async get(id: string) {
    const run = getRun(id);
    if (!run) throw new AppError("RUN_NOT_FOUND", "执行实例不存在", 404);
    return run;
  },

  async create(input: unknown) {
    const data = runInputSchema.parse(input);
    const template = db.prepare("SELECT * FROM SopTemplate WHERE id = ?").get(data.templateId) as
      | { id: string; name: string; description: string | null }
      | undefined;
    if (!template) throw new AppError("TEMPLATE_NOT_FOUND", "SOP 模板不存在", 404);
    const templateNodes = db.prepare(`
      SELECT id, name, description, sortOrder, isRequired, parentId
      FROM SopTemplateNode WHERE templateId = ? ORDER BY sortOrder
    `).all(template.id) as {
      id: string;
      name: string;
      description: string | null;
      sortOrder: number;
      isRequired: number;
      parentId: string | null;
    }[];
    if (!templateNodes.length) throw new AppError("TEMPLATE_EMPTY", "模板至少需要一个节点", 409);

    const id = randomUUID();
    const now = new Date().toISOString();
    const nodeIdMap = new Map(templateNodes.map((node) => [node.id, randomUUID()]));
    db.transaction(() => {
      db.prepare(`
        INSERT INTO SopRun (
          id, templateId, templateNameSnapshot, templateDescriptionSnapshot,
          title, version, startedAt, completedAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      `).run(id, template.id, template.name, template.description, data.title, data.version, now, now);
      const insert = db.prepare(`
        INSERT INTO SopRunNode (
          id, runId, nameSnapshot, descriptionSnapshot, note, sortOrder,
          isRequired, parentId, completedAt, firstCompletedAt, lastModifiedAt,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, ?)
      `);
      templateNodes.forEach((node) =>
        insert.run(
          nodeIdMap.get(node.id),
          id,
          node.name,
          node.description,
          node.sortOrder,
          node.isRequired,
          node.parentId ? nodeIdMap.get(node.parentId) ?? null : null,
          now,
          now,
        ),
      );
    })();
    return this.get(id);
  },

  async setNodeCompletion(runId: string, nodeId: string, completed: boolean) {
    const run = await this.get(runId);
    const node = run.nodes.find((item) => item.id === nodeId);
    if (!node) throw new AppError("RUN_NODE_NOT_FOUND", "执行节点不存在", 404);
    if (node.isParent) {
      throw new AppError("PARENT_NODE_READ_ONLY", "父节点由子节点自动完成，不能手动操作", 409);
    }
    const now = new Date().toISOString();

    db.transaction(() => {
      if (Boolean(node.completedAt) !== completed) {
        db.prepare(`
          UPDATE SopRunNode
          SET completedAt = ?,
              firstCompletedAt = CASE
                WHEN ? = 1 AND firstCompletedAt IS NULL THEN ?
                ELSE firstCompletedAt
              END,
              lastModifiedAt = ?,
              updatedAt = ?
          WHERE id = ?
        `).run(completed ? now : null, completed ? 1 : 0, now, now, now, nodeId);
      }
      recalculateParents(runId, now);
      recalculateRun(getRun(runId) as RunDto, now);
    })();
    return this.get(runId);
  },

  async setNodeNote(runId: string, nodeId: string, input: unknown) {
    const data = runNodeNoteSchema.parse(input);
    const run = await this.get(runId);
    if (!run.nodes.some((node) => node.id === nodeId)) {
      throw new AppError("RUN_NODE_NOT_FOUND", "执行节点不存在", 404);
    }
    const content = data.note ? sanitizeNoteHtml(data.note.html) : null;
    if (content && content.textLength > 2000) {
      throw new AppError("NOTE_TOO_LONG", "备注文字不能超过 2000 个字符", 400);
    }
    const note =
      data.note && content && (!content.isEmpty || data.note.fileIds.length > 0)
        ? JSON.stringify({
            html: content.html,
            fileIds: noteFileService.getMany(data.note.fileIds).map((f) => f.id),
          })
        : null;
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE SopRunNode SET note = ?, updatedAt = ? WHERE id = ? AND runId = ?").run(
        note,
        now,
        nodeId,
        runId,
      );
      db.prepare("UPDATE SopRun SET updatedAt = ? WHERE id = ?").run(now, runId);
    })();
    return this.get(runId);
  },

  async setArchived(id: string, input: unknown) {
    const data = runArchiveSchema.parse(input);
    await this.get(id);
    const now = new Date().toISOString();
    db.prepare("UPDATE SopRun SET archivedAt = ?, updatedAt = ? WHERE id = ?").run(
      data.archived ? now : null,
      now,
      id,
    );
    return this.get(id);
  },

  async setTitle(id: string, input: unknown) {
    const data = runTitleSchema.parse(input);
    await this.get(id);
    const now = new Date().toISOString();
    db.prepare("UPDATE SopRun SET title = ?, updatedAt = ? WHERE id = ?").run(data.title, now, id);
    return this.get(id);
  },

  async update(id: string, input: unknown) {
    const data = runUpdateSchema.parse(input);
    return "archived" in data ? this.setArchived(id, data) : this.setTitle(id, data);
  },

  async remove(id: string) {
    await this.get(id);
    db.transaction(() => {
      db.prepare("DELETE FROM SopRun WHERE id = ?").run(id);
    })();
  },
};
