"use client";

import { CalendarEventDto, CalendarReminderDto } from "@/shared/types/calendar";
import { CalendarEventBar } from "./calendar-event-bar";
import { CalendarReminderTag } from "./calendar-reminder-tag";
import { toDateString, toTimeString } from "./calendar-page";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface CalendarWeekViewProps {
  weekStart: Date;
  events: CalendarEventDto[];
  reminders: CalendarReminderDto[];
  showEvents: boolean;
  showReminders: boolean;
  onSlotClick: (date: string, time: string) => void;
  onEventClick: (event: CalendarEventDto) => void;
  onToggleReminder: (id: string, isCompleted: boolean) => void;
  onDeleteReminder: (id: string) => void;
  busyId: string | null;
}

function getWeekDays(weekStart: Date): Date[] {
  const start = new Date(weekStart);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minutesSinceMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Row assignment for cross-day/all-day events within a single week */
function assignWeekRows(events: CalendarEventDto[], dayKeys: string[]): Map<string, number> {
  const annotated = events.map((e) => ({
    event: e,
    start: dayKeys.indexOf(toDateString(e.startAt)),
    end: dayKeys.indexOf(toDateString(e.endAt)),
  }));

  annotated.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  });

  const rowMap = new Map<string, number>();
  const rowEnds: number[] = [];

  for (const { event, start, end } of annotated) {
    let row = 0;
    while (row < rowEnds.length && rowEnds[row] >= start) row++;
    rowMap.set(event.id, row);
    if (row < rowEnds.length) rowEnds[row] = end;
    else rowEnds.push(end);
  }

  return rowMap;
}

export function CalendarWeekView({
  weekStart,
  events,
  reminders,
  showEvents,
  showReminders,
  onSlotClick,
  onEventClick,
  onToggleReminder,
  onDeleteReminder,
  busyId,
}: CalendarWeekViewProps) {
  const days = getWeekDays(weekStart);
  const dayKeys = days.map(dateKey);
  const todayStr = dateKey(new Date());
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const nowLineTop = (nowMinutes / 60) * HOUR_HEIGHT;
  const isCurrentWeek = days.some((d) => dateKey(d) === todayStr);

  // --- Partition events ---
  const allDayEvents: CalendarEventDto[] = [];
  const timedByDay = new Map<string, { event: CalendarEventDto; top: number; height: number }[]>();
  const remindersByDay = new Map<string, CalendarReminderDto[]>();

  const seenAllDay = new Set<string>();

  for (const day of days) {
    const key = dateKey(day);
    const dayTimed: { event: CalendarEventDto; top: number; height: number }[] = [];
    const dayReminders: CalendarReminderDto[] = [];

    if (showEvents) {
      for (const event of events) {
        const evStart = toDateString(event.startAt);
        const evEnd = toDateString(event.endAt);

        if (key < evStart || key > evEnd) continue;

        if (event.isAllDay || evStart !== evEnd) {
          // Cross-day or all-day: collect unique events for the all-day strip
          if (!seenAllDay.has(event.id)) {
            seenAllDay.add(event.id);
            allDayEvents.push(event);
          }
        } else {
          const startMin = minutesSinceMidnight(event.startAt);
          const endMin = minutesSinceMidnight(event.endAt);
          const top = (startMin / 60) * HOUR_HEIGHT;
          const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 20);
          dayTimed.push({ event, top, height });
        }
      }
    }

    if (showReminders) {
      for (const r of reminders) {
        if (toDateString(r.dueAt) === key) {
          dayReminders.push(r);
        }
      }
    }

    timedByDay.set(key, dayTimed);
    remindersByDay.set(key, dayReminders);
  }

  // --- Row assignment for all-day bars ---
  const rowMap = assignWeekRows(allDayEvents, dayKeys);
  const maxRow = allDayEvents.reduce((m, e) => Math.max(m, rowMap.get(e.id) ?? 0), -1);
  const allDayRows = maxRow >= 0 ? maxRow + 1 : 0;
  const allDayHeight = allDayRows > 0 ? allDayRows * 32 + 4 : 0;

  return (
    <div className="calendar-week-view">
      {/* Day headers */}
      <div className="week-header-row">
        <div className="week-time-gutter" />
        {days.map((day) => {
          const key = dateKey(day);
          const isToday = key === todayStr;
          return (
            <div
              key={key}
              className={`week-day-header ${isToday ? "today" : ""}`}
            >
              <span className="week-day-name">{WEEKDAYS[day.getDay()]}</span>
              <span className={`week-day-date ${isToday ? "today" : ""}`}>
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* All-day events — continuous bars, one per event */}
      {allDayRows > 0 && (
        <div
          className="week-all-day-row"
          style={{
            minHeight: allDayHeight,
            display: "grid",
            gridTemplateColumns: "48px repeat(7, 1fr)",
          }}
        >
          <div className="week-time-gutter">
            <span className="week-gutter-label">全天</span>
          </div>
          {/* Transparent overlay grid for bar placement (columns 2-8) */}
          <div
            style={{
              gridColumn: "2 / 9",
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
            }}
          >
            {allDayEvents.map((event) => {
              const es = toDateString(event.startAt);
              const ee = toDateString(event.endAt);
              const startIdx = dayKeys.indexOf(es);
              const endIdx = dayKeys.indexOf(ee);

              const colStart = startIdx >= 0 ? startIdx + 1 : 1;
              const colEnd = endIdx >= 0 ? endIdx + 1 : 7;
              const span = colEnd - colStart + 1;

              const startsInWeek = startIdx >= 0;
              const endsInWeek = endIdx >= 0;
              let position: "start" | "middle" | "end" | "single";
              if (startsInWeek && endsInWeek) position = "single";
              else if (startsInWeek) position = "start";
              else if (endsInWeek) position = "end";
              else position = "middle";

              const row = rowMap.get(event.id) ?? 0;

              return (
                <CalendarEventBar
                  key={`allday-${event.id}`}
                  event={event}
                  position={position}
                  onClick={() => onEventClick(event)}
                  style={{
                    gridColumn: `${colStart} / span ${span}`,
                    marginTop: row * 32 + 2,
                    height: 28,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="week-time-grid" style={{ position: "relative" }}>
        {isCurrentWeek && (
          <div className="week-now-line" style={{ top: nowLineTop }}>
            <div className="week-now-dot" />
          </div>
        )}

        <div className="week-time-gutter">
          {HOURS.map((h) => (
            <div key={h} className="week-hour-label" style={{ height: HOUR_HEIGHT }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {days.map((day) => {
          const key = dateKey(day);
          const dayEvents = timedByDay.get(key) ?? [];
          const dayReminders = remindersByDay.get(key) ?? [];
          const isToday = key === todayStr;

          return (
            <div
              key={key}
              className={`week-day-column ${isToday ? "today" : ""}`}
            >
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="week-hour-slot"
                  style={{ height: HOUR_HEIGHT }}
                  onClick={() =>
                    onSlotClick(
                      key,
                      `${String(h).padStart(2, "0")}:00`,
                    )
                  }
                />
              ))}

              {dayEvents.map(({ event, top, height }) => (
                <div
                  key={event.id}
                  className="week-event-block"
                  style={{
                    top,
                    height,
                    backgroundColor: `${event.color ?? "#3B82F6"}28`,
                    color: event.color ?? "#3B82F6",
                    borderLeft: `3px solid ${event.color ?? "#3B82F6"}`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(event);
                  }}
                >
                  <span className="week-event-time">
                    {toTimeString(event.startAt)}
                  </span>
                  <span className="week-event-title">{event.title}</span>
                </div>
              ))}

              {dayReminders.map((r) => {
                const min = minutesSinceMidnight(r.dueAt);
                const top = (min / 60) * HOUR_HEIGHT;
                return (
                  <div
                    key={r.id}
                    className="week-reminder-marker"
                    style={{ top: top - 4 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (busyId !== `reminder:${r.id}`) {
                        onToggleReminder(r.id, r.isCompleted);
                      }
                    }}
                  >
                    <CalendarReminderTag
                      reminder={r}
                      disabled={busyId === `reminder:${r.id}`}
                      onToggle={() => onToggleReminder(r.id, r.isCompleted)}
                      onDelete={() => onDeleteReminder(r.id)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
