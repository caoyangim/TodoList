import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  clearSessionCookie,
  getRequestUser,
} from "@/server/auth/request";
import { fail, readJson } from "@/server/http";
import { authService } from "@/server/services/auth-service";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request, true);
    authService.changePassword(user.id, await readJson(request));
    const response = new NextResponse(null, { status: 204 });
    clearSessionCookie(response, request);
    return response;
  } catch (error) {
    return fail(error);
  }
}
