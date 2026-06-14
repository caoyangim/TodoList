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
  todoNoteSchema,
  todoPatchSchema,
  todoStatusSchema,
} from "@/shared/schemas/todo";
import { NoteContentDto, TodoDto } from "@/shared/types/models";

type TodoRow = Omit<TodoDto, "note"> & {
  note: string | null;
};

function getTodoRow(id: string) {
  return db.prepare("SELECT * FROM Todo WHERE id = ?").get(id) as TodoRow | undefined;
}

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

function toTodoDto(row: TodoRow): TodoDto {
  return { ...row, note: parseNote(row.note) };
}

export const todoService = {
  async list(status: unknown) {
    const parsedStatus = todoStatusSchema.parse(status ?? "pending");
    const where =
      parsedStatus === "completed"
        ? "WHERE completedAt IS NOT NULL"
        : parsedStatus === "pending"
          ? "WHERE completedAt IS NULL"
          : "";
    return (
      db
      .prepare(`SELECT * FROM Todo ${where} ORDER BY completedAt ASC, createdAt DESC`)
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
      timePriority: data.timePriority,
      importancePriority: data.importancePriority,
      dueAt: data.dueAt?.toISOString() ?? null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.prepare(`
      INSERT INTO Todo (
        id, title, description, note, priority, timePriority, importancePriority, dueAt, completedAt, createdAt, updatedAt
      )
      VALUES (
        @id, @title, @description, @note, @importancePriority, @timePriority, @importancePriority, @dueAt, @completedAt, @createdAt, @updatedAt
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
    const updatedAt = new Date().toISOString();
    db.prepare("UPDATE Todo SET note = ?, updatedAt = ? WHERE id = ?").run(note, updatedAt, id);
    return this.get(id);
  },

  async setCompletion(id: string, completed: boolean) {
    const current = await this.get(id);
    if (Boolean(current.completedAt) === completed) return current;
    const completedAt = completed ? new Date().toISOString() : null;
    const updatedAt = new Date().toISOString();
    db.prepare("UPDATE Todo SET completedAt = ?, updatedAt = ? WHERE id = ?").run(
      completedAt,
      updatedAt,
      id,
    );
    return { ...current, completedAt, updatedAt };
  },
};
