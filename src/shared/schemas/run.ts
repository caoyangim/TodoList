import { z } from "zod";

export const runInputSchema = z.object({
  templateId: z.string().min(1, "请选择模板"),
  version: z.string().trim().min(1, "请输入版本号").max(50),
});
