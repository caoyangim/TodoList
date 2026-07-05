"use client";

import { CheckCircle, Circle, MapPin, Trash2 } from "lucide-react";
import { CalendarEventDto, CalendarReminderDto } from "@/shared/types/calendar";
import { toDateString, toTimeString } from "./calendar-page";

interface TodayEntry {
  type: "reminder" | "stop";
  id: string;
  title: string;
  time?: string;
  color?: string;
  completed?: boolean;
}

interface CalendarTodayRemindersProps {
  events: CalendarEventDto[];
  reminders: CalendarReminderDto[];
  busyId: string | null;
  onToggleReminder: (id: string, isCompleted: boolean) => void;
  onDeleteReminder: (id: string) => void;
}

export function CalendarTodayReminders({
  events,
  reminders,
  busyId,
  onToggleReminder,
  onDeleteReminder,
}: CalendarTodayRemindersProps) {
  const today = toDateString(new Date().toISOString());

  const entries: TodayEntry[] = [];

  // Reminders due today
  for (const r of reminders) {
    if (toDateString(r.dueAt) === today) {
      entries.push({
        type: "reminder",
        id: r.id,
        title: r.title,
        time: toTimeString(r.dueAt),
        completed: r.isCompleted,
      });
    }
  }

  // Stops on today
  for (const e of events) {
    for (const s of e.stops ?? []) {
      if (s.date === today) {
        entries.push({
          type: "stop",
          id: `${e.id}-stop-${s.date}`,
          title: s.title,
          color: e.color,
        });
      }
    }
  }

  if (entries.length === 0) {
    return (
      <div className="calendar-today-panel">
        <div className="calendar-today-panel-title">今日</div>
        <div style={{ fontSize: 13, color: "#9CA3AF" }}>今天没有安排</div>
      </div>
    );
  }

  return (
    <div className="calendar-today-panel">
      <div className="calendar-today-panel-title">今日</div>
      {entries.map((entry) => {
        const isReminder = entry.type === "reminder";
        const busy = isReminder && busyId === `reminder:${entry.id}`;

        return (
          <div
            key={entry.id}
            className={`calendar-today-item ${entry.completed ? "completed" : ""}`}
            onClick={() => {
              if (busy) return;
              if (isReminder) onToggleReminder(entry.id, entry.completed ?? false);
            }}
          >
            {/* Icon */}
            <span className="calendar-today-item-icon">
              {entry.type === "reminder" ? (
                entry.completed ? <CheckCircle size={14} /> : <Circle size={14} />
              ) : (
                <MapPin size={14} color={entry.color} />
              )}
            </span>

            {/* Label */}
            <span className="calendar-today-item-label">
              {entry.type === "reminder" ? "提醒" : "节点"}
            </span>

            {/* Title */}
            <span className="calendar-today-item-text">{entry.title}</span>

            {/* Time (reminders only) */}
            {entry.time && (
              <span className="calendar-today-time">{entry.time}</span>
            )}

            {/* Delete (reminders only) */}
            {isReminder && (
              <button
                type="button"
                className="reminder-tag-delete"
                title="删除提醒"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteReminder(entry.id);
                }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
