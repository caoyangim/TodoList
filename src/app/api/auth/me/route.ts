import { NextResponse } from "next/server";
import {
  getRequestToken,
  getRequestUser,
  setSessionCookie,
} from "@/server/auth/request";
import { fail } from "@/server/http";

export async function GET(request: Request) {
  try {
    const user = getRequestUser(request, true);
    const response = NextResponse.json({ data: user });
    const token = getRequestToken(request);
    if (token) setSessionCookie(response, token);
    return response;
  } catch (error) {
    return fail(error);
  }
}
