import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.cookies.has("todoflow_session")) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/", "/todos/:path*", "/templates/:path*", "/runs/:path*", "/admin/:path*"],
};
