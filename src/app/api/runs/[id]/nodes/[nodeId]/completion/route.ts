import { fail, ok, readJson } from "@/server/http";
import { runService } from "@/server/services/run-service";
import { completionSchema } from "@/shared/schemas/common";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

type Context = { params: Promise<{ id: string; nodeId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    const body = completionSchema.parse(await readJson(request));
    const { id, nodeId } = await context.params;
    return ok(await runService.setNodeCompletion(user.id, id, nodeId, body.completed));
  } catch (error) {
    return fail(error);
  }
}
