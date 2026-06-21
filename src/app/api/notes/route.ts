import { assertSameOrigin, getRequestUser } from "@/server/auth/request";
import { fail, ok, readJson } from "@/server/http";
import { noteService } from "@/server/services/note-service";

export async function GET(request: Request) {
  try {
    const user = getRequestUser(request);
    return ok(await noteService.list(user.id));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    return ok(await noteService.create(user.id, await readJson(request)), 201);
  } catch (error) {
    return fail(error);
  }
}
