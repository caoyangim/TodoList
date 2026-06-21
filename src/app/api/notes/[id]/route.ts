import { assertSameOrigin, getRequestUser } from "@/server/auth/request";
import { fail, noContent, ok, readJson } from "@/server/http";
import { noteService } from "@/server/services/note-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = getRequestUser(request);
    return ok(await noteService.get(user.id, (await context.params).id));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    return ok(await noteService.update(user.id, (await context.params).id, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    await noteService.remove(user.id, (await context.params).id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}
