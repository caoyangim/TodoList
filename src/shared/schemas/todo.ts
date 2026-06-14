import { z } from "zod";
import { optionalText } from "./common";

export const todoPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const todoStateSchema = z.enum(["pending", "resolved", "completed", "all"]);
export const todoStatusSchema = z.enum(["PENDING", "RESOLVED", "COMPLETED"]);
const todoRichContentSchema = z.object({
  html: z.string().max(20000, "备注富文本内容过长"),
  fileIds: z.array(z.string().uuid()).max(10, "每条备注最多包含 10 个文件"),
});

export const todoInputSchema = z.object({
  title: z.string().trim().min(1, "请输入 Todo 标题").max(200),
  description: optionalText(2000),
  timePriority: todoPrioritySchema.default("MEDIUM"),
  importancePriority: todoPrioritySchema.default("MEDIUM"),
  dueAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((value) => (value ? new Date(value) : null)),
});

export const todoPatchSchema = todoInputSchema.partial();

export const todoNoteSchema = z.object({
  note: todoRichContentSchema.nullable(),
});

export const todoTransitionSchema = z.object({
  status: todoStatusSchema,
  verificationReport: todoRichContentSchema.nullable().optional(),
});

export const todoListStatusSchema = todoStateSchema.default("pending");
