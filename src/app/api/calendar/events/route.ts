import { fail, ok, readJson } from "@/server/http";
import { calendarEventService } from "@/server/services/calendar-event-service";
import { assertSameOrigin, getRequestUser } from "@/server/auth/request";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = getRequestUser(request);
    return ok(await calendarEventService.create(user.id, await readJson(request)), 201);
  } catch (error) {
    return fail(error);
  }
}
