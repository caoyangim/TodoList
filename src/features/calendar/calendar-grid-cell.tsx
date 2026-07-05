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
}

const MAX_VISIBLE = 3;

export function CalendarGridCell({
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
}: CalendarGridCellProps) {
  const eventEntries = events.map((e) => ({ type: "event" as const, event: e }));
  const reminderEntries = reminders.map((r) => ({ type: "reminder" as const, reminder: r }));
  const allEntries = [...eventEntries, ...reminderEntries];
  const visible = allEntries.slice(0, MAX_VISIBLE);
  const overflow = allEntries.length - MAX_VISIBLE;

  return (
    <div
      className={`calendar-cell${isToday ? " today" : ""}${!isCurrentMonth ? " other-month" : ""}`}
      style={style}
      onClick={(e) => { if (e.target === e.currentTarget) onCellClick(); }}
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
