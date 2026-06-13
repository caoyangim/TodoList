import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new AppError(
      "VALIDATION_ERROR",
      "输入内容不正确",
      400,
      error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
    return new AppError("CONFLICT", "数据已存在", 409);
  }

  console.error(error);
  return new AppError("INTERNAL_ERROR", "服务器处理请求时出现错误", 500);
}
