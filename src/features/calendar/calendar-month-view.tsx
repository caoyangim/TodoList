"use client";

import {
  CalendarEventDto,
  CalendarReminderDto,
} from "@/shared/types/calendar";
import { CalendarGridCell } from "./calendar-grid-cell";
import { CalendarEventBar } from "./calendar-event-bar";
import { toDateString } from "./calendar-page";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

interface CalendarMonthViewProps {
  year: number;
  month: number;
  events: CalendarEventDto[];
  reminders: CalendarReminderDto[];
  showEvents: boolean;
  showReminders: boolean;
  onCellClick: (date: string) => void;
  onEventClick: (event: CalendarEventDto) => void;
  onToggleReminder: (id: string, isCompleted: boolean) => void;
  onDeleteReminder: (id: string) => void;
  busyId: string | null;
}

function buildCalendarDays(
  year: number,
  month: number,
): { date: string; isCurrentMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days: { date: string; isCurrentMonth: boolean }[] = [];

  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = month === 0 ? 12 : month;
    const y = month === 0 ? year - 1 : year;
    days.push({
      date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      isCurrentMonth: false,
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      isCurrentMonth: true,
    });
  }

  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 1 : month + 2;
    const y = month === 11 ? year + 1 : year;
    days.push({
      date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      isCurrentMonth: false,
    });
  }

  return days.slice(0, 42);
}

/**
 * Global row assignment for cross-day events using interval-graph coloring.
 *
 * Each event is an interval [startIdx, endIdx] across the day-index space.
 * Two events overlap if their intervals intersect (including sharing an
 * endpoint — "A: 1–2" and "B: 2–3" both occupy day 2).
 *
 * Greedy algorithm (optimal for interval graphs):
 * 1. Sort by start index ascending, then by span descending.
 * 2. For each event, pick the first row whose last event ended strictly before
 *    this event starts — i.e. `rowEnd < startIdx`.
 * 3. Assign to that row; update rowEnd.
 *
 * Result: same event → same row across all cells; no overlaps; minimal rows.
 */
function assignCrossDayRows(
  crossDayEvents: CalendarEventDto[],
  days: { date: string }[],
): Map<string, number> {
  const indexOf = new Map<string, number>();
  for (let i = 0; i < days.length; i++) indexOf.set(days[i].date, i);

  const annotated = crossDayEvents
    .map((e) => ({
      event: e,
      start: indexOf.get(toDateString(e.startAt)) ?? -1,
      end: indexOf.get(toDateString(e.endAt)) ?? -1,
    }))
    .filter((a) => a.start >= 0 && a.end >= 0);

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

export function CalendarMonthView({
  year,
  month,
  events,
  reminders,
  showEvents,
  showReminders,
  onCellClick,
  onEventClick,
  onToggleReminder,
  onDeleteReminder,
  busyId,
}: CalendarMonthViewProps) {
  const days = buildCalendarDays(year, month);
  const todayStr = toDateString(new Date().toISOString());

  // --- Partition events ---
  const crossDayEvents: CalendarEventDto[] = [];
  const crossDayRowMap = new Map<string, number>();

  const singleByDate = new Map<string, CalendarEventDto[]>();
  const crossByWeek = new Map<number, CalendarEventDto[]>();

  if (showEvents) {
    for (const e of events) {
      const es = toDateString(e.startAt);
      const ee = toDateString(e.endAt);
      if (es === ee) {
        const arr = singleByDate.get(es);
        if (arr) arr.push(e);
        else singleByDate.set(es, [e]);
      } else {
        crossDayEvents.push(e);
      }
    }

    if (crossDayEvents.length > 0) {
      const map = assignCrossDayRows(crossDayEvents, days);
      for (const [id, row] of map) crossDayRowMap.set(id, row);

      for (const e of crossDayEvents) {
        const es = toDateString(e.startAt);
        const ee = toDateString(e.endAt);
        for (let w = 0; w < 6; w++) {
          const weekStart = days[w * 7].date;
          const weekEnd = days[w * 7 + 6].date;
          if (es <= weekEnd && ee >= weekStart) {
            const arr = crossByWeek.get(w);
            if (arr) arr.push(e);
            else crossByWeek.set(w, [e]);
          }
        }
      }
    }
  }

  const remindersByDate = new Map<string, CalendarReminderDto[]>();
  if (showReminders) {
    for (const r of reminders) {
      const key = toDateString(r.dueAt);
      const arr = remindersByDate.get(key);
      if (arr) arr.push(r);
      else remindersByDate.set(key, [r]);
    }
  }

  // Chunk days into 6 weeks
  const weeks: { date: string; isCurrentMonth: boolean }[][] = [];
  for (let w = 0; w < 6; w++) {
    weeks.push(days.slice(w * 7, w * 7 + 7));
  }

  return (
    <div>
      {/* Weekday headers */}
      <div className="calendar-grid" style={{ borderBottom: "none" }}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">{w}</div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => {
        const weekDates = week.map((d) => d.date);
        const weekCross = crossByWeek.get(wi) ?? [];

        const sortedCross = [...weekCross].sort((a, b) => {
          const ra = crossDayRowMap.get(a.id) ?? 0;
          const rb = crossDayRowMap.get(b.id) ?? 0;
          return ra - rb;
        });

        const maxRow = sortedCross.reduce((m, e) => Math.max(m, crossDayRowMap.get(e.id) ?? 0), -1);
        const crossRows = maxRow >= 0 ? maxRow + 1 : 0;
        // Cells get extra top padding so content (date + events) starts below the bars
        const cellPadTop = crossRows > 0 ? crossRows * 22 + 8 : undefined;

        return (
          <div
            key={wi}
            className="calendar-grid"
            style={{ borderTop: wi > 0 ? "none" : undefined }}
          >
            {/* Cells — placed first, then bars overlay on top */}
            {week.map(({ date, isCurrentMonth }, colIdx) => {
              const cellSingle = singleByDate.get(date) ?? [];
              const cellReminders = remindersByDate.get(date) ?? [];
              const isToday = date === todayStr;
              const dayNum = parseInt(date.split("-")[2], 10);

              return (
                <CalendarGridCell
                  key={date}
                  date={date}
                  dayNum={dayNum}
                  isCurrentMonth={isCurrentMonth}
                  isToday={isToday}
                  events={cellSingle}
                  reminders={cellReminders}
                  onCellClick={() => onCellClick(date)}
                  onEventClick={onEventClick}
                  onToggleReminder={onToggleReminder}
                  onDeleteReminder={onDeleteReminder}
                  busyId={busyId}
                  style={{
                    gridRow: 1,
                    gridColumn: colIdx + 1,
                    paddingTop: cellPadTop,
                  }}
                />
              );
            })}

            {/* Cross-day bars — same grid row, overlaying the cell padding area */}
            {sortedCross.map((event) => {
              const es = toDateString(event.startAt);
              const ee = toDateString(event.endAt);
              const startIdx = weekDates.indexOf(es);
              const endIdx = weekDates.indexOf(ee);

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

              const row = crossDayRowMap.get(event.id) ?? 0;

              return (
                <CalendarEventBar
                  key={`cross-${event.id}-w${wi}`}
                  event={event}
                  position={position}
                  onClick={() => onEventClick(event)}
                  style={{
                    gridRow: 1,
                    gridColumn: `${colStart} / span ${span}`,
                    marginTop: row * 22 + 5,
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
