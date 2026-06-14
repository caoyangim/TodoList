import { fail, noContent, ok, readJson } from "@/server/http";
import { runService } from "@/server/services/run-service";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = getRequestUser(request);
    return ok(await runService.get(user.id, (await context.params).id));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    return ok(await runService.update(user.id, (await context.params).id, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    await runService.remove(user.id, (await context.params).id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}
