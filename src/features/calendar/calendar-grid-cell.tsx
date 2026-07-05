"use client";

import { CSSProperties } from "react";
import { CalendarEventDto, CalendarReminderDto } from "@/shared/types/calendar";
import { CalendarEventBar } from "./calendar-event-bar";
import { CalendarReminderTag } from "./calendar-reminder-tag";

interface CalendarGridCellProps {
  date: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEventDto[];
  reminders: CalendarReminderDto[];
  onCellClick: () => void;
  onEventClick: (event: CalendarEventDto) => void;
  onToggleReminder: (id: string, isCompleted: boolean) => void;
  onDeleteReminder: (id: string) => void;
  busyId: string | null;
  style?: CSSProperties;
  // Selection
  selecting: boolean;
  isSelectStart: boolean;
  isSelectEnd: boolean;
  isInSelectRange: boolean;
  dateStyle: "centered" | "corner";
  onPointerDown: (date: string, e: React.PointerEvent) => void;
  onPointerEnter: (date: string) => void;
}

const MAX_VISIBLE = 3;

export function CalendarGridCell({
  date,
  dayNum,
  isCurrentMonth,
  isToday,
  events,
  reminders,
  onCellClick,
  onEventClick,
  onToggleReminder,
  onDeleteReminder,
  busyId,
  style,
  selecting,
  isSelectStart,
  isSelectEnd,
  isInSelectRange,
  dateStyle,
  onPointerDown,
  onPointerEnter,
}: CalendarGridCellProps) {
  const eventEntries = events.map((e) => ({ type: "event" as const, event: e }));
  const reminderEntries = reminders.map((r) => ({ type: "reminder" as const, reminder: r }));
  const allEntries = [...eventEntries, ...reminderEntries];
  const visible = allEntries.slice(0, MAX_VISIBLE);
  const overflow = allEntries.length - MAX_VISIBLE;

  const classNames = [
    "calendar-cell",
    isToday ? "today" : "",
    !isCurrentMonth ? "other-month" : "",
    selecting ? "selecting" : "",
    isSelectStart ? "select-start" : "",
    isSelectEnd ? "select-end" : "",
    isInSelectRange && !isSelectStart && !isSelectEnd ? "in-range" : "",
    `date-${dateStyle}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classNames}
      style={style}
      onClick={(e) => {
        if (selecting) return;
        if (e.target === e.currentTarget) onCellClick();
      }}
      onPointerDown={(e) => {
        onPointerDown(date, e);
      }}
      onPointerEnter={() => {
        if (selecting) onPointerEnter(date);
      }}
    >
      <span className="calendar-cell-date">{dayNum}</span>

      {visible.map((entry) => {
        if (entry.type === "event") {
          return (
            <CalendarEventBar
              key={`evt-${entry.event.id}`}
              event={entry.event}
              position="single"
              onClick={() => onEventClick(entry.event)}
            />
          );
        }
        return (
          <CalendarReminderTag
            key={`rem-${entry.reminder.id}`}
            reminder={entry.reminder}
            disabled={busyId === `reminder:${entry.reminder.id}`}
            onToggle={() => onToggleReminder(entry.reminder.id, entry.reminder.isCompleted)}
            onDelete={() => onDeleteReminder(entry.reminder.id)}
          />
        );
      })}

      {overflow > 0 && <div className="calendar-cell-more">+{overflow} 更多</div>}
    </div>
  );
}
