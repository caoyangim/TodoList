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
  userId: string;
  note: string | null;
  verificationReport: string | null;
};

function getTodoRow(userId: string, id: string) {
  return db.prepare("SELECT * FROM Todo WHERE id = ? AND userId = ?").get(id, userId) as TodoRow | undefined;
}

function parseRichContent(userId: string, value: string | null): NoteContentDto | null {
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
    files: noteFileService.getMany(userId, ids),
  };
}

function toTodoDto(userId: string, row: TodoRow): TodoDto {
  const { userId: ownerId, ...todo } = row;
  void ownerId;
  return {
    ...todo,
    note: parseRichContent(userId, row.note),
    verificationReport: parseRichContent(userId, row.verificationReport),
  };
}

function serializeRichContent(userId: string, input: { html: string; fileIds: string[] } | null) {
  if (!input) return null;
  const content = sanitizeNoteHtml(input.html);
  if (content.textLength > 2000) {
    throw new AppError("NOTE_TOO_LONG", "备注文字不能超过 2000 个字符", 400);
  }
  return !content.isEmpty || input.fileIds.length > 0
    ? JSON.stringify({
        html: content.html,
        fileIds: noteFileService.getMany(userId, input.fileIds).map((file) => file.id),
      })
    : null;
}

export const todoService = {
  async list(userId: string, status: unknown) {
    const parsedStatus = todoListStatusSchema.parse(status ?? "pending");
    const where =
      parsedStatus === "resolved"
        ? "AND status = 'RESOLVED'"
        : parsedStatus === "completed"
          ? "AND status = 'COMPLETED'"
          : parsedStatus === "pending"
            ? "AND status = 'PENDING'"
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
      .prepare(`SELECT * FROM Todo WHERE userId = ? ${where} ${orderBy}`)
        .all(userId) as TodoRow[]
    ).map((row) => toTodoDto(userId, row));
  },

  async get(userId: string, id: string) {
    const todo = getTodoRow(userId, id);
    if (!todo) throw new AppError("TODO_NOT_FOUND", "Todo 不存在", 404);
    return toTodoDto(userId, todo);
  },

  async create(userId: string, input: unknown) {
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
        id, userId, title, description, note, verificationReport, status, priority, timePriority, importancePriority, dueAt, completedAt, createdAt, updatedAt
      )
      VALUES (
        @id, @userId, @title, @description, @note, @verificationReport, @status, @importancePriority, @timePriority, @importancePriority, @dueAt, @completedAt, @createdAt, @updatedAt
      )
    `).run({ ...todo, userId });
    return todo;
  },

  async update(userId: string, id: string, input: unknown) {
    const current = await this.get(userId, id);
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
      dueAt=@dueAt, updatedAt=@updatedAt WHERE id=@id AND userId=@userId
    `).run({ ...next, userId });
    return next;
  },

  async remove(userId: string, id: string) {
    if (db.prepare("DELETE FROM Todo WHERE id = ? AND userId = ?").run(id, userId).changes === 0) {
      throw new AppError("TODO_NOT_FOUND", "Todo 不存在", 404);
    }
  },

  async setNote(userId: string, id: string, input: unknown) {
    await this.get(userId, id);
    const data = todoNoteSchema.parse(input);
    const note = serializeRichContent(userId, data.note);
    const updatedAt = new Date().toISOString();
    db.prepare("UPDATE Todo SET note = ?, updatedAt = ? WHERE id = ? AND userId = ?").run(note, updatedAt, id, userId);
    return this.get(userId, id);
  },

  async setStatus(userId: string, id: string, input: unknown) {
    const current = await this.get(userId, id);
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
      data.status === "COMPLETED" ? serializeRichContent(userId, data.verificationReport ?? null) : null;
    const completedAt = data.status === "COMPLETED" ? new Date().toISOString() : null;
    const updatedAt = new Date().toISOString();
    db.prepare("UPDATE Todo SET status = ?, verificationReport = ?, completedAt = ?, updatedAt = ? WHERE id = ? AND userId = ?").run(
      data.status,
      verificationReport,
      completedAt,
      updatedAt,
      id,
      userId,
    );
    return {
      ...current,
      status: data.status,
      verificationReport: data.status === "COMPLETED" ? parseRichContent(userId, verificationReport) : null,
      completedAt,
      updatedAt,
    };
  },
};
