import { fail, ok, readJson } from "@/server/http";
import { todoService } from "@/server/services/todo-service";
import { completionSchema } from "@/shared/schemas/common";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const body = completionSchema.parse(await readJson(request));
    return ok(await todoService.setCompletion((await context.params).id, body.completed));
  } catch (error) {
    return fail(error);
  }
}
