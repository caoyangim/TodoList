import { fail, ok, readJson } from "@/server/http";
import { runService } from "@/server/services/run-service";
import { completionSchema } from "@/shared/schemas/common";

type Context = { params: Promise<{ id: string; nodeId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const body = completionSchema.parse(await readJson(request));
    const { id, nodeId } = await context.params;
    return ok(await runService.setNodeCompletion(id, nodeId, body.completed));
  } catch (error) {
    return fail(error);
  }
}
