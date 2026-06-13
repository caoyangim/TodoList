import { fail, ok, readJson } from "@/server/http";
import { runService } from "@/server/services/run-service";

type Context = { params: Promise<{ id: string; nodeId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { id, nodeId } = await context.params;
    return ok(await runService.setNodeNote(id, nodeId, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}
