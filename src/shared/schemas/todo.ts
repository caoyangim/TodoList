import { z } from "zod";
import { optionalText } from "./common";

export const todoPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const todoInputSchema = z.object({
  title: z.string().trim().min(1, "请输入 Todo 标题").max(200),
  description: optionalText(2000),
  priority: todoPrioritySchema.default("MEDIUM"),
  dueAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((value) => (value ? new Date(value) : null)),
});

export const todoPatchSchema = todoInputSchema.partial();

export const todoStatusSchema = z.enum(["pending", "completed", "all"]).default("pending");
