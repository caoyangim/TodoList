import { z } from "zod";
import { optionalText } from "./common";

export const templateNodeInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "请输入节点名称").max(100),
  description: optionalText(1000),
  sortOrder: z.number().int().positive(),
  isRequired: z.boolean().default(true),
  noteRequired: z.boolean().default(false),
  parentId: z.string().min(1).optional().nullable(),
});

export const templateInputSchema = z
  .object({
    name: z.string().trim().min(1, "请输入模板名称").max(100),
    description: optionalText(2000),
    nodes: z.array(templateNodeInputSchema).min(1, "模板至少需要一个节点"),
  })
  .superRefine((data, context) => {
    const ids = new Set(data.nodes.map((node) => node.id).filter(Boolean));
    const parentIds = new Set(data.nodes.map((node) => node.parentId).filter(Boolean));

    data.nodes.forEach((node, index) => {
      if (node.parentId && (!node.id || node.parentId === node.id || !ids.has(node.parentId))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "父节点设置无效",
          path: ["nodes", index, "parentId"],
        });
      }
      if (node.parentId && parentIds.has(node.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "当前版本只支持两层父子结构",
          path: ["nodes", index, "parentId"],
        });
      }
    });
  });
