import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "用户名至少需要 3 个字符")
  .max(32, "用户名不能超过 32 个字符")
  .regex(/^[a-z0-9._-]+$/, "用户名只能包含小写字母、数字、点、下划线和连字符");

export const passwordSchema = z
  .string()
  .min(6, "密码至少需要 6 个字符")
  .max(32, "密码不能超过 32 个字符");

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: passwordSchema,
});

export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const updateUserSchema = z
  .object({
    password: passwordSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.password !== undefined || value.isActive !== undefined, {
    message: "没有需要更新的内容",
  });
