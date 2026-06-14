import { assertSameOrigin, getRequestUser } from "@/server/auth/request";
import { fail, ok, readJson } from "@/server/http";
import { authService } from "@/server/services/auth-service";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    return ok(
      authService.updateUser(
        getRequestUser(request),
        (await context.params).id,
        await readJson(request),
      ),
    );
  } catch (error) {
    return fail(error);
  }
}
