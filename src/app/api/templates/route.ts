import { fail, ok, readJson } from "@/server/http";
import { templateService } from "@/server/services/template-service";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

export async function GET(request: Request) {
  try {
    const user = getRequestUser(request);
    return ok(await templateService.list(user.id));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    return ok(await templateService.create(user.id, await readJson(request)), 201);
  } catch (error) {
    return fail(error);
  }
}
