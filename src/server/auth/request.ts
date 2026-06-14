import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authConstants, authService } from "@/server/services/auth-service";
import { AppError } from "@/server/errors";
import { CurrentUserDto } from "@/shared/types/models";

export const sessionCookieName = "todoflow_session";

function readCookieHeader(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const prefix = `${sessionCookieName}=`;
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export function assertSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    throw new AppError("FORBIDDEN", "请求来源无效", 403);
  }
}

export function getRequestUser(request: Request, allowPasswordChange = false) {
  const user = authService.authenticate(readCookieHeader(request));
  if (!user) throw new AppError("AUTH_REQUIRED", "请先登录", 401);
  if (user.mustChangePassword && !allowPasswordChange) {
    throw new AppError("PASSWORD_CHANGE_REQUIRED", "请先修改临时密码", 403);
  }
  return user;
}

export function getRequestToken(request: Request) {
  return readCookieHeader(request);
}

export async function getCurrentUser(): Promise<CurrentUserDto | null> {
  const store = await cookies();
  return authService.authenticate(store.get(sessionCookieName)?.value);
}

function isSecureRequest(request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProtocol ? forwardedProtocol === "https" : new URL(request.url).protocol === "https:";
}

export function setSessionCookie(response: NextResponse, request: Request, token: string) {
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: authConstants.sessionDurationSeconds,
  });
}

export function clearSessionCookie(response: NextResponse, request: Request) {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 0,
  });
}
