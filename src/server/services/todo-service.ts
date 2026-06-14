import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import {
  plainTextToNoteHtml,
  sanitizeNoteHtml,
} from "@/server/services/note-content-service";
import { noteFileService } from "@/server/services/note-file-service";
import {
  todoInputSchema,
  todoListStatusSchema,
  todoNoteSchema,
  todoPatchSchema,
  todoTransitionSchema,
} from "@/shared/schemas/todo";
import { NoteContentDto, TodoDto } from "@/shared/types/models";

type TodoRow = Omit<TodoDto, "note" | "verificationReport"> & {
  note: string | null;
  verificationReport: string | null;
};

function getTodoRow(id: string) {
  return db.prepare("SELECT * FROM Todo WHERE id = ?").get(id) as TodoRow | undefined;
}

function parseRichContent(value: string | null): NoteContentDto | null {
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

function toTodoDto(row: TodoRow): TodoDto {
  return {
    ...row,
    note: parseRichContent(row.note),
    verificationReport: parseRichContent(row.verificationReport),
  };
}

function serializeRichContent(input: { html: string; fileIds: string[] } | null) {
  if (!input) return null;
  const content = sanitizeNoteHtml(input.html);
  if (content.textLength > 2000) {
    throw new AppError("NOTE_TOO_LONG", "备注文字不能超过 2000 个字符", 400);
  }
  return !content.isEmpty || input.fileIds.length > 0
    ? JSON.stringify({
        html: content.html,
        fileIds: noteFileService.getMany(input.fileIds).map((file) => file.id),
      })
    : null;
}

export const todoService = {
  async list(status: unknown) {
    const parsedStatus = todoListStatusSchema.parse(status ?? "pending");
    const where =
      parsedStatus === "resolved"
        ? "WHERE status = 'RESOLVED'"
        : parsedStatus === "completed"
          ? "WHERE status = 'COMPLETED'"
          : parsedStatus === "pending"
            ? "WHERE status = 'PENDING'"
            : "";
    const orderBy = `
      ORDER BY
        CASE status
          WHEN 'PENDING' THEN 0
          WHEN 'RESOLVED' THEN 1
          ELSE 2
        END ASC,
        completedAt DESC,
        createdAt DESC
    `;
    return (
      db
      .prepare(`SELECT * FROM Todo ${where} ${orderBy}`)
        .all() as TodoRow[]
    ).map(toTodoDto);
  },

  async get(id: string) {
    const todo = getTodoRow(id);
    if (!todo) throw new AppError("TODO_NOT_FOUND", "Todo 不存在", 404);
    return toTodoDto(todo);
  },

  async create(input: unknown) {
    const data = todoInputSchema.parse(input);
    const now = new Date().toISOString();
    const todo: TodoDto = {
      id: randomUUID(),
      title: data.title,
      description: data.description,
      note: null,
      verificationReport: null,
      status: "PENDING",
      timePriority: data.timePriority,
      importancePriority: data.importancePriority,
      dueAt: data.dueAt?.toISOString() ?? null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.prepare(`
      INSERT INTO Todo (
        id, title, description, note, verificationReport, status, priority, timePriority, importancePriority, dueAt, completedAt, createdAt, updatedAt
      )
      VALUES (
        @id, @title, @description, @note, @verificationReport, @status, @importancePriority, @timePriority, @importancePriority, @dueAt, @completedAt, @createdAt, @updatedAt
      )
    `).run(todo);
    return todo;
  },

  async update(id: string, input: unknown) {
    const current = await this.get(id);
    const data = todoPatchSchema.parse(input);
    const next: TodoDto = {
      ...current,
      ...data,
      dueAt: data.dueAt === undefined ? current.dueAt : data.dueAt?.toISOString() ?? null,
      updatedAt: new Date().toISOString(),
    };
    db.prepare(`
      UPDATE Todo SET title=@title, description=@description, priority=@importancePriority,
      timePriority=@timePriority, importancePriority=@importancePriority,
      dueAt=@dueAt, updatedAt=@updatedAt WHERE id=@id
    `).run(next);
    return next;
  },

  async remove(id: string) {
    if (db.prepare("DELETE FROM Todo WHERE id = ?").run(id).changes === 0) {
      throw new AppError("TODO_NOT_FOUND", "Todo 不存在", 404);
    }
  },

  async setNote(id: string, input: unknown) {
    await this.get(id);
    const data = todoNoteSchema.parse(input);
    const note = serializeRichContent(data.note);
    const updatedAt = new Date().toISOString();
    db.prepare("UPDATE Todo SET note = ?, updatedAt = ? WHERE id = ?").run(note, updatedAt, id);
    return this.get(id);
  },

  async setStatus(id: string, input: unknown) {
    const current = await this.get(id);
    const data = todoTransitionSchema.parse(input);
    if (current.status === data.status) return current;
    if (current.status === "PENDING" && data.status !== "RESOLVED") {
      throw new AppError("TODO_STATUS_TRANSITION_INVALID", "待处理 Todo 只能标记为已解决", 409);
    }
    if (current.status === "RESOLVED" && !["PENDING", "COMPLETED"].includes(data.status)) {
      throw new AppError("TODO_STATUS_TRANSITION_INVALID", "已解决 Todo 只能退回待处理或标记为已完成", 409);
    }
    if (current.status === "COMPLETED" && !["PENDING", "RESOLVED"].includes(data.status)) {
      throw new AppError("TODO_STATUS_TRANSITION_INVALID", "已完成 Todo 只能退回待处理或已解决", 409);
    }
    if (data.status !== "COMPLETED" && data.verificationReport !== undefined) {
      throw new AppError("TODO_VERIFICATION_REPORT_INVALID", "只有标记为已完成时才能提交验证报告", 409);
    }

    const verificationReport =
      data.status === "COMPLETED" ? serializeRichContent(data.verificationReport ?? null) : null;
    const completedAt = data.status === "COMPLETED" ? new Date().toISOString() : null;
    const updatedAt = new Date().toISOString();
    db.prepare("UPDATE Todo SET status = ?, verificationReport = ?, completedAt = ?, updatedAt = ? WHERE id = ?").run(
      data.status,
      verificationReport,
      completedAt,
      updatedAt,
      id,
    );
    return {
      ...current,
      status: data.status,
      verificationReport: data.status === "COMPLETED" ? parseRichContent(verificationReport) : null,
      completedAt,
      updatedAt,
    };
  },
};
