import { fail, ok, readJson } from "@/server/http";
import { todoService } from "@/server/services/todo-service";

export async function GET(request: Request) {
  try {
    const status = new URL(request.url).searchParams.get("status") ?? "pending";
    return ok(await todoService.list(status));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    return ok(await todoService.create(await readJson(request)), 201);
  } catch (error) {
    return fail(error);
  }
}
