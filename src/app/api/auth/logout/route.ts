import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  clearSessionCookie,
  getRequestToken,
} from "@/server/auth/request";
import { fail } from "@/server/http";
import { authService } from "@/server/services/auth-service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    authService.logout(getRequestToken(request));
    const response = new NextResponse(null, { status: 204 });
    clearSessionCookie(response, request);
    return response;
  } catch (error) {
    return fail(error);
  }
}
