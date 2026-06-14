import { fail, noContent, ok, readJson } from "@/server/http";
import { todoService } from "@/server/services/todo-service";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = getRequestUser(request);
    return ok(await todoService.get(user.id, (await context.params).id));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    return ok(await todoService.update(user.id, (await context.params).id, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    await todoService.remove(user.id, (await context.params).id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}
