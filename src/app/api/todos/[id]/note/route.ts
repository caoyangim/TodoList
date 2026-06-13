import { fail, ok, readJson } from "@/server/http";
import { todoService } from "@/server/services/todo-service";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    return ok(await todoService.setNote((await context.params).id, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}
