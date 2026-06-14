import { assertSameOrigin, getRequestUser } from "@/server/auth/request";
import { fail, ok, readJson } from "@/server/http";
import { authService } from "@/server/services/auth-service";

export async function GET(request: Request) {
  try {
    return ok(authService.listUsers(getRequestUser(request)));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return ok(authService.createUser(getRequestUser(request), await readJson(request)), 201);
  } catch (error) {
    return fail(error);
  }
}
