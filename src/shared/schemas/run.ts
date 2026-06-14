import { z } from "zod";

export const runInputSchema = z.object({
  templateId: z.string().min(1, "请选择模板"),
  title: z.string().trim().min(1, "请输入执行标题").max(100),
  version: z
    .string()
    .trim()
    .max(50, "版本号不能超过 50 个字符")
    .optional()
    .nullable()
    .transform((value) => value || null),
});

export const runArchiveSchema = z.object({
  archived: z.boolean(),
});

export const runTitleSchema = z.object({
  title: z.string().trim().min(1, "请输入执行标题").max(100, "执行标题不能超过 100 个字符"),
});

export const runUpdateSchema = z.union([runArchiveSchema, runTitleSchema]);

export const runNodeNoteSchema = z.object({
  note: z
    .object({
      html: z.string().max(20000, "备注富文本内容过长"),
      fileIds: z.array(z.string().uuid()).max(10, "每条备注最多包含 10 个文件"),
    })
    .nullable(),
});
