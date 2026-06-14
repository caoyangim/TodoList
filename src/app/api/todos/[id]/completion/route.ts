import { fail, ok, readJson } from "@/server/http";
import { todoService } from "@/server/services/todo-service";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    return ok(await todoService.setStatus(user.id, (await context.params).id, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}
