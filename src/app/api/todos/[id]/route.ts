import { fail, noContent, ok, readJson } from "@/server/http";
import { todoService } from "@/server/services/todo-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    return ok(await todoService.get((await context.params).id));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    return ok(await todoService.update((await context.params).id, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    await todoService.remove((await context.params).id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}
