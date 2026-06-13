import { fail, ok } from "@/server/http";
import { runService } from "@/server/services/run-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    return ok(await runService.get((await context.params).id));
  } catch (error) {
    return fail(error);
  }
}
