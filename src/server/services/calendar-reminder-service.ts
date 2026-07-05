import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import {
  reminderInputSchema,
  reminderPatchSchema,
  reminderCompletionSchema,
} from "@/shared/schemas/calendar";
import { CalendarReminderDto } from "@/shared/types/calendar";

type ReminderRow = Omit<CalendarReminderDto, "isCompleted"> & {
  userId: string;
  isCompleted: number;
};

function getReminderRow(userId: string, id: string) {
  return db
    .prepare("SELECT * FROM CalendarReminder WHERE id = ? AND userId = ?")
    .get(id, userId) as ReminderRow | undefined;
}

function toReminderDto(row: ReminderRow): CalendarReminderDto {
  const { userId: _userId, ...rest } = row;
  void _userId;
  return { ...rest, isCompleted: Boolean(row.isCompleted) };
}

/** Expand repeating reminders into virtual instances within [fromDate, toDate]. */
function expandReminders(
  reminders: CalendarReminderDto[],
  fromDate: Date,
  toDate: Date,
): CalendarReminderDto[] {
  const result: CalendarReminderDto[] = [];

  for (const reminder of reminders) {
    if (reminder.repeat === "none") {
      const dueDate = new Date(reminder.dueAt);
      if (dueDate >= fromDate && dueDate < toDate) {
        result.push(reminder);
      }
      continue;
    }

    const baseDate = new Date(reminder.dueAt);
    const interval = reminder.repeat === "daily" ? 1 : 7; // days
    let current = new Date(baseDate);

    // Walk forward from base date while current < toDate
    while (current < toDate) {
      if (current >= fromDate) {
        result.push({
          ...reminder,
          dueAt: current.toISOString(),
        });
      }
      current = new Date(current);
      current.setDate(current.getDate() + interval);
    }
  }

  result.sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
  );
  return result;
}

export const calendarReminderService = {
  list(userId: string, from: string, to: string): CalendarReminderDto[] {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Fetch base reminders that could appear in range:
    // - Non-repeating: dueAt within [from, to]
    // - Repeating: dueAt <= to (base date on or before range end)
    const rows = db
      .prepare(
        `SELECT * FROM CalendarReminder
         WHERE userId = ?
           AND (
             (repeat = 'none' AND dueAt >= ? AND dueAt < ?)
             OR
             (repeat != 'none' AND dueAt < ?)
           )
         ORDER BY dueAt ASC`,
      )
      .all(
        userId,
        fromDate.toISOString(),
        toDate.toISOString(),
        toDate.toISOString(),
      ) as ReminderRow[];

    const baseReminders = rows.map(toReminderDto);
    return expandReminders(baseReminders, fromDate, toDate);
  },

  get(userId: string, id: string): CalendarReminderDto {
    const row = getReminderRow(userId, id);
    if (!row) throw new AppError("REMINDER_NOT_FOUND", "提醒不存在", 404);
    return toReminderDto(row);
  },

  create(userId: string, input: unknown): CalendarReminderDto {
    const data = reminderInputSchema.parse(input);
    const now = new Date().toISOString();
    const id = randomUUID();
    const dto: CalendarReminderDto = {
      id,
      title: data.title,
      description: data.description ?? null,
      dueAt: data.dueAt,
      isCompleted: false,
      repeat: data.repeat,
      todoId: data.todoId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    db.transaction(() => {
      if (data.todoId) {
        const todo = db
          .prepare("SELECT id FROM Todo WHERE id = ? AND userId = ?")
          .get(data.todoId, userId) as { id: string } | undefined;
        if (!todo) throw new AppError("TODO_NOT_FOUND", "关联的 Todo 不存在", 404);
        const existing = db
          .prepare("SELECT id FROM CalendarReminder WHERE todoId = ? AND userId = ?")
          .get(data.todoId, userId);
        if (existing) {
          throw new AppError("TODO_ALREADY_BOUND", "该 Todo 已绑定其他提醒", 409);
        }
      }

      db.prepare(
        `INSERT INTO CalendarReminder (
          id, userId, title, description, dueAt, isCompleted, repeat, todoId, createdAt, updatedAt
        ) VALUES (
          @id, @userId, @title, @description, @dueAt, @isCompleted, @repeat, @todoId, @createdAt, @updatedAt
        )`,
      ).run({ ...dto, isCompleted: 0, userId });
    })();

    return dto;
  },

  update(userId: string, id: string, input: unknown): CalendarReminderDto {
    const current = this.get(userId, id);
    const data = reminderPatchSchema.parse(input);
    const now = new Date().toISOString();
    const next: CalendarReminderDto = {
      ...current,
      ...data,
      updatedAt: now,
    };

    db.prepare(
      `UPDATE CalendarReminder
       SET title = @title, description = @description,
           dueAt = @dueAt, repeat = @repeat,
           todoId = @todoId, updatedAt = @updatedAt
       WHERE id = @id AND userId = @userId`,
    ).run({ ...next, userId });

    return next;
  },

  setCompletion(
    userId: string,
    id: string,
    input: unknown,
  ): CalendarReminderDto {
    const current = this.get(userId, id);
    const data = reminderCompletionSchema.parse(input);
    if (current.isCompleted === data.isCompleted) return current;

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE CalendarReminder
       SET isCompleted = @isCompleted, updatedAt = @updatedAt
       WHERE id = @id AND userId = @userId`,
    ).run({ isCompleted: data.isCompleted ? 1 : 0, updatedAt: now, id, userId });

    return { ...current, isCompleted: data.isCompleted, updatedAt: now };
  },

  remove(userId: string, id: string): void {
    this.get(userId, id);
    db.transaction(() => {
      const result = db
        .prepare("DELETE FROM CalendarReminder WHERE id = ? AND userId = ?")
        .run(id, userId);
      if (result.changes === 0) {
        throw new AppError("REMINDER_NOT_FOUND", "提醒不存在", 404);
      }
    })();
  },
};
