"use client";

import {
  CalendarEventDto,
  CalendarReminderDto,
} from "@/shared/types/calendar";
import { CalendarGridCell } from "./calendar-grid-cell";
import { CalendarEventBar } from "./calendar-event-bar";
import { toDateString } from "./calendar-page";
import { assignDateRangeRows } from "./calendar-event-layout";

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
  // Selection
  selecting: boolean;
  selectStart: string | null;
  selectEnd: string | null;
  dateStyle: "centered" | "corner";
  onCellPointerDown: (date: string, e: React.PointerEvent) => void;
  onCellPointerEnter: () => void;
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
  selecting,
  selectStart,
  selectEnd,
  dateStyle,
  onCellPointerDown,
  onCellPointerEnter,
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
      const map = assignDateRangeRows(
        crossDayEvents.map((event) => ({
          id: event.id,
          start: toDateString(event.startAt),
          end: toDateString(event.endAt),
        })),
        days[0].date,
        days[days.length - 1].date,
      );
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
        // Date offset varies by style: centered ~50px, corner ~30px
        const dateOffset = dateStyle === "centered" ? 50 : 30;
        const cellPadTop = dateOffset + crossRows * 30;
        const barTop = dateOffset + 5; // cell padding compensation

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

              // Selection range (normalized: start ≤ end)
              const selStart = selectStart && selectEnd
                ? (selectStart < selectEnd ? selectStart : selectEnd)
                : null;
              const selEnd = selectStart && selectEnd
                ? (selectStart < selectEnd ? selectEnd : selectStart)
                : null;
              const isSelectStart = date === selectStart;
              const isSelectEnd = date === selectEnd;
              const isInSelectRange = selStart && selEnd
                ? date >= selStart && date <= selEnd && date !== selectStart && date !== selectEnd
                : false;

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
                  selecting={selecting}
                  isSelectStart={isSelectStart}
                  isSelectEnd={isSelectEnd}
                  isInSelectRange={isInSelectRange}
                  dateStyle={dateStyle}
                  onPointerDown={onCellPointerDown}
                  onPointerEnter={onCellPointerEnter}
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

              // Compute stop label positions for this week's bar segment
              const effStart = startIdx >= 0 ? startIdx : 0;
              const effEnd = endIdx >= 0 ? endIdx : 6;

              // Highlight only stop days, not segments between them
              const barColors: string[] = [];
              const allStops = (event.stops ?? []).filter((s) => {
                const si = weekDates.indexOf(s.date);
                return si >= effStart && si <= effEnd;
              });
              if (allStops.length > 0) {
                const hexToRgb = (h: string) => [
                  parseInt(h.slice(1, 3), 16),
                  parseInt(h.slice(3, 5), 16),
                  parseInt(h.slice(5, 7), 16),
                ];
                const rgba = (rgb: number[], a: number) =>
                  `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
                const baseRgb = hexToRgb(event.color);
                const stopColor = rgba(baseRgb, 0.35);
                const colW = 100 / span; // width of one column in %
                allStops.forEach((s) => {
                  const si = weekDates.indexOf(s.date);
                  const left = ((si - effStart) / span) * 100;
                  const right = left + colW;
                  barColors.push(
                    `transparent ${left}%`,
                    `${stopColor} ${left}%`,
                    `${stopColor} ${right}%`,
                    `transparent ${right}%`,
                  );
                });
              }

              const stopLabels = allStops.map((s) => {
                const idx = weekDates.indexOf(s.date);
                const leftPercent = ((idx - effStart) / span) * 100;
                const maxWidth = 100 / span;
                return { title: s.title, leftPercent, maxWidth, color: event.color };
              });

              return (
                <CalendarEventBar
                  key={`cross-${event.id}-w${wi}`}
                  event={event}
                  position={position}
                  onClick={() => onEventClick(event)}
                  stopLabels={stopLabels.length > 0 ? stopLabels : undefined}
                  style={{
                    gridRow: 1,
                    gridColumn: `${colStart} / span ${span}`,
                    marginTop: row * 30 + barTop,
                    ...(barColors.length > 0 ? { backgroundImage: `linear-gradient(to right, ${barColors.join(", ")})` } : {}),
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
