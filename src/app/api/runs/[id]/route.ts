import { fail, noContent, ok, readJson } from "@/server/http";
import { runService } from "@/server/services/run-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    return ok(await runService.get((await context.params).id));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    return ok(await runService.update((await context.params).id, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    await runService.remove((await context.params).id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}
