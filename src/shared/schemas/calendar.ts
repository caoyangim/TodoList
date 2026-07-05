import { z } from "zod";
import { optionalText } from "./common";

const repeatSchema = z.enum(["none", "daily", "weekly"]);

// --- Event schemas ---

export const eventColorSchema = z.enum([
  "#3B82F6",
  "#10B981",
  "#8B5CF6",
  "#F59E0B",
  "#EC4899",
  "#14B8A6",
  "#EF4444",
  "#6B7280",
]);

const eventBaseSchema = z.object({
  title: z.string().trim().min(1, "请输入日程标题").max(200),
  description: optionalText(2000),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  isAllDay: z.boolean().default(false),
  color: eventColorSchema.default("#3B82F6"),
  todoId: z.string().uuid().optional().nullable(),
});

export const eventInputSchema = eventBaseSchema.refine(
  (data) => new Date(data.endAt).getTime() > new Date(data.startAt).getTime(),
  { message: "结束时间必须晚于开始时间", path: ["endAt"] },
);

function refineEventPatch(
  data: Partial<z.infer<typeof eventBaseSchema>>,
  ctx: z.RefinementCtx,
) {
  if (data.startAt && data.endAt) {
    if (new Date(data.endAt).getTime() <= new Date(data.startAt).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "结束时间必须晚于开始时间",
        path: ["endAt"],
      });
    }
  }
}

export const eventPatchSchema = eventBaseSchema.partial().superRefine(refineEventPatch);

// --- Reminder schemas ---

export const reminderInputSchema = z.object({
  title: z.string().trim().min(1, "请输入提醒标题").max(200),
  description: optionalText(2000),
  dueAt: z.string().datetime(),
  repeat: repeatSchema.default("none"),
  todoId: z.string().uuid().optional().nullable(),
});

export const reminderPatchSchema = reminderInputSchema.partial();

export const reminderCompletionSchema = z.object({
  isCompleted: z.boolean(),
});

// --- Query schema ---

export const calendarQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from 格式必须为 YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to 格式必须为 YYYY-MM-DD"),
});
