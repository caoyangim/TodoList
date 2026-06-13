import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { todoInputSchema, todoPatchSchema, todoStatusSchema } from "@/shared/schemas/todo";
import { TodoDto } from "@/shared/types/models";

type TodoRow = Omit<TodoDto, "priority"> & { priority: TodoDto["priority"] };

function getTodoRow(id: string) {
  return db.prepare("SELECT * FROM Todo WHERE id = ?").get(id) as TodoRow | undefined;
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
    return db
      .prepare(`SELECT * FROM Todo ${where} ORDER BY completedAt ASC, createdAt DESC`)
      .all() as TodoDto[];
  },

  async get(id: string) {
    const todo = getTodoRow(id);
    if (!todo) throw new AppError("TODO_NOT_FOUND", "Todo 不存在", 404);
    return todo;
  },

  async create(input: unknown) {
    const data = todoInputSchema.parse(input);
    const now = new Date().toISOString();
    const todo: TodoDto = {
      id: randomUUID(),
      title: data.title,
      description: data.description,
      priority: data.priority,
      dueAt: data.dueAt?.toISOString() ?? null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.prepare(`
      INSERT INTO Todo (id, title, description, priority, dueAt, completedAt, createdAt, updatedAt)
      VALUES (@id, @title, @description, @priority, @dueAt, @completedAt, @createdAt, @updatedAt)
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
      UPDATE Todo SET title=@title, description=@description, priority=@priority,
      dueAt=@dueAt, updatedAt=@updatedAt WHERE id=@id
    `).run(next);
    return next;
  },

  async remove(id: string) {
    if (db.prepare("DELETE FROM Todo WHERE id = ?").run(id).changes === 0) {
      throw new AppError("TODO_NOT_FOUND", "Todo 不存在", 404);
    }
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
