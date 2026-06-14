import { fail, noContent, ok, readJson } from "@/server/http";
import { templateService } from "@/server/services/template-service";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = getRequestUser(request);
    return ok(await templateService.get(user.id, (await context.params).id));
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    return ok(await templateService.update(user.id, (await context.params).id, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    await templateService.remove(user.id, (await context.params).id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}
