import { fail, ok } from "@/server/http";
import { calendarEventService } from "@/server/services/calendar-event-service";
import { calendarReminderService } from "@/server/services/calendar-reminder-service";
import { calendarQuerySchema } from "@/shared/schemas/calendar";
import { getRequestUser } from "@/server/auth/request";

export async function GET(request: Request) {
  try {
    const user = getRequestUser(request);
    const url = new URL(request.url);
    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toISOString()
      .slice(0, 10);

    const query = calendarQuerySchema.parse({
      from: url.searchParams.get("from") ?? defaultFrom,
      to: url.searchParams.get("to") ?? defaultTo,
    });

    const events = calendarEventService.list(user.id, query.from, query.to);
    const reminders = calendarReminderService.list(user.id, query.from, query.to);

    return ok({ events, reminders });
  } catch (error) {
    return fail(error);
  }
}
