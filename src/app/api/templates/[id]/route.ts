import { fail, noContent, ok, readJson } from "@/server/http";
import { templateService } from "@/server/services/template-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    return ok(await templateService.get((await context.params).id));
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    return ok(await templateService.update((await context.params).id, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    await templateService.remove((await context.params).id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}
