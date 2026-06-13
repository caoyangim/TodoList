import { NextResponse } from "next/server";
import { toAppError } from "./errors";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function fail(error: unknown) {
  const appError = toAppError(error);
  return NextResponse.json(
    {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.fields ? { fields: appError.fields } : {}),
      },
    },
    { status: appError.status },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
