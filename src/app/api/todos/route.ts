import { fail, ok, readJson } from "@/server/http";
import { todoService } from "@/server/services/todo-service";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

export async function GET(request: Request) {
  try {
    const user = getRequestUser(request);
    const status = new URL(request.url).searchParams.get("status") ?? "pending";
    return ok(await todoService.list(user.id, status));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    return ok(await todoService.create(user.id, await readJson(request)), 201);
  } catch (error) {
    return fail(error);
  }
}
