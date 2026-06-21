import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { noteFileService } from "@/server/services/note-file-service";
import { fileReferenceService } from "@/server/services/file-reference-service";
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
import { templateInputSchema } from "@/shared/schemas/template";
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

type RunNodeRow = Omit<
  RunNodeDto,
  "isRequired" | "noteRequired" | "isParent" | "note"
> & {
  note: string | null;
  isRequired: number;
  noteRequired: number;
};

function parseNote(
  userId: string,
  value: string | null,
): NoteContentDto | null {
  if (!value) return null;

  let parsed: {
    html?: string;
    text?: string;
    fileIds?: string[];
    imageIds?: string[];
  };
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
    files: noteFileService.getMany(userId, ids),
  };
}

function getRun(userId: string, id: string): RunDto | null {
  const run = db
    .prepare("SELECT * FROM SopRun WHERE id = ? AND userId = ?")
    .get(id, userId) as RunRow | undefined;
  if (!run) return null;

  const rows = db
    .prepare(
      `
    SELECT id, nameSnapshot AS name, descriptionSnapshot AS description,
           note, sortOrder, isRequired, noteRequired, parentId, completedAt, firstCompletedAt, lastModifiedAt
    FROM SopRunNode WHERE runId = ? ORDER BY sortOrder
  `,
    )
    .all(id) as RunNodeRow[];
  const parentIds = new Set(rows.map((node) => node.parentId).filter(Boolean));
  const nodes: RunNodeDto[] = rows.map((node) => ({
    ...node,
    note: parseNote(userId, node.note),
    isRequired: Boolean(node.isRequired),
    noteRequired: Boolean(node.noteRequired),
    isParent: parentIds.has(node.id),
  }));
  const leaves = nodes.filter((node) => !node.isParent);
  const requiredLeaves = leaves.filter((node) => node.isRequired);
  const completedCount = leaves.filter((node) => node.completedAt).length;
  const requiredCompletedCount = requiredLeaves.filter(
    (node) => node.completedAt,
  ).length;
  const progressLeaves = requiredLeaves.length > 0 ? requiredLeaves : leaves;
  const progressCompletedCount = progressLeaves.filter(
    (node) => node.completedAt,
  ).length;

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

function recalculateRun(userId: string, run: RunDto, now: string) {
  const leaves = run.nodes.filter((node) => !node.isParent);
  const requiredLeaves = leaves.filter((node) => node.isRequired);
  const completionTargets = requiredLeaves.length > 0 ? requiredLeaves : leaves;
  const anyCompleted = leaves.some((node) => node.completedAt);
  const allTargetsCompleted =
    completionTargets.length > 0 &&
    completionTargets.every((node) => node.completedAt);

  db.prepare(
    "UPDATE SopRun SET startedAt = ?, completedAt = ?, updatedAt = ? WHERE id = ? AND userId = ?",
  ).run(
    anyCompleted ? (run.startedAt ?? now) : null,
    allTargetsCompleted ? (run.completedAt ?? now) : null,
    now,
    run.id,
    userId,
  );
}

function recalculateParents(runId: string, now: string) {
  const parents = db
    .prepare(
      `
    SELECT DISTINCT p.id
    FROM SopRunNode p
    INNER JOIN SopRunNode c ON c.parentId = p.id
    WHERE p.runId = ?
  `,
    )
    .all(runId) as { id: string }[];

  const getChildren = db.prepare(
    "SELECT completedAt FROM SopRunNode WHERE parentId = ?",
  );
  const updateParent = db.prepare(`
    UPDATE SopRunNode
    SET completedAt = ?, firstCompletedAt = ?, lastModifiedAt = ?, updatedAt = ?
    WHERE id = ?
  `);
  parents.forEach((parent) => {
    const children = getChildren.all(parent.id) as {
      completedAt: string | null;
    }[];
    const allCompleted =
      children.length > 0 && children.every((child) => child.completedAt);
    const current = db
      .prepare(
        "SELECT completedAt, firstCompletedAt, lastModifiedAt FROM SopRunNode WHERE id = ?",
      )
      .get(parent.id) as {
      completedAt: string | null;
      firstCompletedAt: string | null;
      lastModifiedAt: string | null;
    };
    const statusChanged = Boolean(current.completedAt) !== allCompleted;
    updateParent.run(
      allCompleted ? (current.completedAt ?? now) : null,
      allCompleted
        ? (current.firstCompletedAt ?? now)
        : current.firstCompletedAt,
      statusChanged ? now : current.lastModifiedAt,
      statusChanged ? now : (current.lastModifiedAt ?? now),
      parent.id,
    );
  });
}

export const runService = {
  async list(userId: string) {
    const rows = db
      .prepare("SELECT id FROM SopRun WHERE userId = ? ORDER BY updatedAt DESC")
      .all(userId) as { id: string }[];
    return rows.map((row) => getRun(userId, row.id) as RunDto);
  },

  async get(userId: string, id: string) {
    const run = getRun(userId, id);
    if (!run) throw new AppError("RUN_NOT_FOUND", "执行实例不存在", 404);
    return run;
  },

  async create(userId: string, input: unknown) {
    const data = runInputSchema.parse(input);
    const todo = data.todoId
      ? (db
          .prepare("SELECT id, runId FROM Todo WHERE id = ? AND userId = ?")
          .get(data.todoId, userId) as
          | { id: string; runId: string | null }
          | undefined)
      : undefined;
    if (data.todoId && !todo)
      throw new AppError("TODO_NOT_FOUND", "Todo 不存在", 404);
    if (todo?.runId) {
      throw new AppError(
        "TODO_RUN_ALREADY_BOUND",
        "该 Todo 已绑定 SOP 执行",
        409,
      );
    }

    type TemplateNode = {
      id: string;
      name: string;
      description: string | null;
      sortOrder: number;
      isRequired: number;
      noteRequired: number;
      parentId: string | null;
    };

    const id = randomUUID();
    const now = new Date().toISOString();
    let templateId = "";
    db.transaction(() => {
      if ("template" in data) {
        const template = templateInputSchema.parse(data.template);
        templateId = randomUUID();
        db.prepare(
          `
          INSERT INTO SopTemplate (id, userId, name, description, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).run(
          templateId,
          userId,
          template.name,
          template.description,
          now,
          now,
        );
        const assignedIds = template.nodes.map(() => randomUUID());
        const clientIdMap = new Map(
          template.nodes.flatMap((node, index) =>
            node.id ? [[node.id, assignedIds[index]] as const] : [],
          ),
        );
        const insertTemplateNode = db.prepare(`
          INSERT INTO SopTemplateNode (
            id, templateId, name, description, sortOrder, isRequired, noteRequired, parentId, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        template.nodes.forEach((node, index) => {
          insertTemplateNode.run(
            assignedIds[index],
            templateId,
            node.name,
            node.description,
            index + 1,
            node.isRequired ? 1 : 0,
            node.noteRequired ? 1 : 0,
            node.parentId ? (clientIdMap.get(node.parentId) ?? null) : null,
            now,
            now,
          );
        });
      } else {
        templateId = data.templateId;
      }

      const template = db
        .prepare(
          "SELECT id, name, description FROM SopTemplate WHERE id = ? AND userId = ?",
        )
        .get(templateId, userId) as
        | { id: string; name: string; description: string | null }
        | undefined;
      if (!template)
        throw new AppError("TEMPLATE_NOT_FOUND", "SOP 模板不存在", 404);
      const templateNodes = db
        .prepare(
          `
        SELECT id, name, description, sortOrder, isRequired, noteRequired, parentId
        FROM SopTemplateNode WHERE templateId = ? ORDER BY sortOrder
      `,
        )
        .all(template.id) as TemplateNode[];
      if (!templateNodes.length) {
        throw new AppError("TEMPLATE_EMPTY", "模板至少需要一个节点", 409);
      }
      const nodeIdMap = new Map(
        templateNodes.map((node) => [node.id, randomUUID()]),
      );

      db.prepare(
        `
        INSERT INTO SopRun (
          id, userId, templateId, templateNameSnapshot, templateDescriptionSnapshot,
          title, version, startedAt, completedAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      `,
      ).run(
        id,
        userId,
        template.id,
        template.name,
        template.description,
        data.title,
        data.version,
        now,
        now,
      );
      const insert = db.prepare(`
        INSERT INTO SopRunNode (
          id, runId, nameSnapshot, descriptionSnapshot, note, sortOrder,
          isRequired, noteRequired, parentId, completedAt, firstCompletedAt, lastModifiedAt,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
      `);
      templateNodes.forEach((node) =>
        insert.run(
          nodeIdMap.get(node.id),
          id,
          node.name,
          node.description,
          node.sortOrder,
          node.isRequired,
          node.noteRequired,
          node.parentId ? (nodeIdMap.get(node.parentId) ?? null) : null,
          now,
          now,
        ),
      );
      if (data.todoId) {
        const result = db
          .prepare(
            `
          UPDATE Todo SET runId = ?, updatedAt = ?
          WHERE id = ? AND userId = ? AND runId IS NULL
        `,
          )
          .run(id, now, data.todoId, userId);
        if (result.changes === 0) {
          throw new AppError(
            "TODO_RUN_ALREADY_BOUND",
            "该 Todo 已绑定 SOP 执行",
            409,
          );
        }
      }
    })();
    return this.get(userId, id);
  },

  async setNodeCompletion(
    userId: string,
    runId: string,
    nodeId: string,
    completed: boolean,
  ) {
    const run = await this.get(userId, runId);
    const node = run.nodes.find((item) => item.id === nodeId);
    if (!node) throw new AppError("RUN_NODE_NOT_FOUND", "执行节点不存在", 404);
    if (node.isParent) {
      throw new AppError(
        "PARENT_NODE_READ_ONLY",
        "父节点由子节点自动完成，不能手动操作",
        409,
      );
    }
    if (completed && node.noteRequired) {
      const hasContent =
        node.note &&
        (node.note.html.trim().length > 0 || node.note.files.length > 0);
      if (!hasContent) {
        throw new AppError(
          "NOTE_REQUIRED",
          "该节点要求必填备注才能完成，请先添加备注",
          409,
        );
      }
    }
    const now = new Date().toISOString();

    db.transaction(() => {
      if (Boolean(node.completedAt) !== completed) {
        db.prepare(
          `
          UPDATE SopRunNode
          SET completedAt = ?,
              firstCompletedAt = CASE
                WHEN ? = 1 AND firstCompletedAt IS NULL THEN ?
                ELSE firstCompletedAt
              END,
              lastModifiedAt = ?,
              updatedAt = ?
          WHERE id = ?
        `,
        ).run(completed ? now : null, completed ? 1 : 0, now, now, now, nodeId);
      }
      recalculateParents(runId, now);
      recalculateRun(userId, getRun(userId, runId) as RunDto, now);
    })();
    return this.get(userId, runId);
  },

  async setNodeNote(
    userId: string,
    runId: string,
    nodeId: string,
    input: unknown,
  ) {
    const data = runNodeNoteSchema.parse(input);
    const run = await this.get(userId, runId);
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
            fileIds: noteFileService
              .getMany(userId, data.note.fileIds)
              .map((f) => f.id),
          })
        : null;
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(
        "UPDATE SopRunNode SET note = ?, updatedAt = ? WHERE id = ? AND runId = ?",
      ).run(note, now, nodeId, runId);
      db.prepare("UPDATE SopRun SET updatedAt = ? WHERE id = ?").run(
        now,
        runId,
      );
    })();
    return this.get(userId, runId);
  },

  async setArchived(userId: string, id: string, input: unknown) {
    const data = runArchiveSchema.parse(input);
    await this.get(userId, id);
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE SopRun SET archivedAt = ?, updatedAt = ? WHERE id = ? AND userId = ?",
    ).run(data.archived ? now : null, now, id, userId);
    return this.get(userId, id);
  },

  async setTitle(userId: string, id: string, input: unknown) {
    const data = runTitleSchema.parse(input);
    await this.get(userId, id);
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE SopRun SET title = ?, updatedAt = ? WHERE id = ? AND userId = ?",
    ).run(data.title, now, id, userId);
    return this.get(userId, id);
  },

  async update(userId: string, id: string, input: unknown) {
    const data = runUpdateSchema.parse(input);
    return "archived" in data
      ? this.setArchived(userId, id, data)
      : this.setTitle(userId, id, data);
  },

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    let allFileIds: string[] = [];

    db.transaction(() => {
      allFileIds = fileReferenceService.getRunFileIds(id);

      db.prepare("UPDATE Todo SET runId = NULL WHERE runId = ? AND userId = ?").run(
        id,
        userId,
      );

      db.prepare("DELETE FROM SopRun WHERE id = ? AND userId = ?").run(id, userId);
    })();

    for (const fileId of allFileIds) {
      if (!fileReferenceService.isFileReferenced(userId, fileId)) {
        void noteFileService.remove(userId, fileId).catch(() => {
          // 忽略清理失败的错误
        });
      }
    }
  },
};
