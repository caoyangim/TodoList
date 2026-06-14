import { NextResponse } from "next/server";
import { assertSameOrigin, setSessionCookie } from "@/server/auth/request";
import { fail, readJson } from "@/server/http";
import { authService } from "@/server/services/auth-service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const clientKey =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const result = await authService.login(await readJson(request), clientKey);
    const response = NextResponse.json({ data: result.user });
    setSessionCookie(response, result.token);
    return response;
  } catch (error) {
    return fail(error);
  }
}
