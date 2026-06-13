import { z } from "zod";

export const idSchema = z.string().min(1);

export const completionSchema = z.object({
  completed: z.boolean(),
});

export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);
}
