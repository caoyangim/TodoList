import { fail, ok, readJson } from "@/server/http";
import { runService } from "@/server/services/run-service";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

type Context = { params: Promise<{ id: string; nodeId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    const { id, nodeId } = await context.params;
    return ok(await runService.setNodeNote(user.id, id, nodeId, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}
