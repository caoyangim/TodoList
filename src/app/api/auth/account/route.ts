import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  clearSessionCookie,
  getRequestUser,
} from "@/server/auth/request";
import { fail } from "@/server/http";
import { authService } from "@/server/services/auth-service";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    authService.deleteAccount(user);
    const response = new NextResponse(null, { status: 204 });
    clearSessionCookie(response, request);
    return response;
  } catch (error) {
    return fail(error);
  }
}
