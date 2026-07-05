import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { eventInputSchema, eventPatchSchema } from "@/shared/schemas/calendar";
import { CalendarEventDto } from "@/shared/types/calendar";

type EventRow = CalendarEventDto & {
  userId: string;
};

function getEventRow(userId: string, id: string) {
  return db
    .prepare("SELECT * FROM CalendarEvent WHERE id = ? AND userId = ?")
    .get(id, userId) as EventRow | undefined;
}

function toEventDto(row: EventRow): CalendarEventDto {
  const { userId: _userId, ...dto } = row;
  void _userId;
  return { ...dto, isAllDay: Boolean(row.isAllDay) };
}

export const calendarEventService = {
  list(userId: string, from: string, to: string): CalendarEventDto[] {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    // Events that overlap with [from, to]: event starts before 'to' AND event ends after 'from'
    const rows = db
      .prepare(
        `SELECT * FROM CalendarEvent
         WHERE userId = ?
           AND startAt < ?
           AND endAt > ?
         ORDER BY startAt ASC`,
      )
      .all(userId, toDate.toISOString(), fromDate.toISOString()) as EventRow[];
    return rows.map(toEventDto);
  },

  get(userId: string, id: string): CalendarEventDto {
    const row = getEventRow(userId, id);
    if (!row) throw new AppError("EVENT_NOT_FOUND", "日程不存在", 404);
    return toEventDto(row);
  },

  create(userId: string, input: unknown): CalendarEventDto {
    const data = eventInputSchema.parse(input);
    const now = new Date().toISOString();
    const id = randomUUID();
    const dto: CalendarEventDto = {
      id,
      title: data.title,
      description: data.description ?? null,
      startAt: data.startAt,
      endAt: data.endAt,
      isAllDay: data.isAllDay,
      color: data.color,
      todoId: data.todoId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    db.transaction(() => {
      if (data.todoId) {
        const todo = db
          .prepare("SELECT id, runId FROM Todo WHERE id = ? AND userId = ?")
          .get(data.todoId, userId) as { id: string; runId: string | null } | undefined;
        if (!todo) throw new AppError("TODO_NOT_FOUND", "关联的 Todo 不存在", 404);
        if (todo.runId) {
          // Check if this todo is already bound to another event
          const existing = db
            .prepare("SELECT id FROM CalendarEvent WHERE todoId = ? AND userId = ?")
            .get(data.todoId, userId);
          if (existing) {
            throw new AppError("TODO_ALREADY_BOUND", "该 Todo 已绑定其他日程", 409);
          }
        }
      }

      db.prepare(
        `INSERT INTO CalendarEvent (
          id, userId, title, description, startAt, endAt, isAllDay, color, todoId, createdAt, updatedAt
        ) VALUES (
          @id, @userId, @title, @description, @startAt, @endAt, @isAllDay, @color, @todoId, @createdAt, @updatedAt
        )`,
      ).run({ ...dto, isAllDay: data.isAllDay ? 1 : 0, userId });
    })();

    return dto;
  },

  update(userId: string, id: string, input: unknown): CalendarEventDto {
    const current = this.get(userId, id);
    const data = eventPatchSchema.parse(input);
    const now = new Date().toISOString();
    const next: CalendarEventDto = {
      ...current,
      ...data,
      isAllDay: data.isAllDay ?? current.isAllDay,
      updatedAt: now,
    };

    db.prepare(
      `UPDATE CalendarEvent
       SET title = @title, description = @description,
           startAt = @startAt, endAt = @endAt, isAllDay = @isAllDay,
           color = @color,
           todoId = @todoId, updatedAt = @updatedAt
       WHERE id = @id AND userId = @userId`,
    ).run({ ...next, isAllDay: next.isAllDay ? 1 : 0, userId });

    return next;
  },

  remove(userId: string, id: string): void {
    this.get(userId, id);
    db.transaction(() => {
      const result = db
        .prepare("DELETE FROM CalendarEvent WHERE id = ? AND userId = ?")
        .run(id, userId);
      if (result.changes === 0) {
        throw new AppError("EVENT_NOT_FOUND", "日程不存在", 404);
      }
    })();
  },
};
