"use client";

import { CheckCircle, Circle, Trash2 } from "lucide-react";
import { CalendarReminderDto } from "@/shared/types/calendar";
import { toDateString, toTimeString } from "./calendar-page";

interface CalendarTodayRemindersProps {
  reminders: CalendarReminderDto[];
  busyId: string | null;
  onToggle: (id: string, isCompleted: boolean) => void;
  onDelete: (id: string) => void;
}

export function CalendarTodayReminders({
  reminders,
  busyId,
  onToggle,
  onDelete,
}: CalendarTodayRemindersProps) {
  const today = toDateString(new Date().toISOString());
  const todayReminders = reminders.filter(
    (r) => toDateString(r.dueAt) === today,
  );

  return (
    <div className="calendar-today-panel">
      <div className="calendar-today-panel-title">今日提醒</div>
      {todayReminders.length === 0 && (
        <div style={{ fontSize: 13, color: "#9CA3AF" }}>今天没有提醒</div>
      )}
      {todayReminders.map((r) => {
        const busy = busyId === `reminder:${r.id}`;
        return (
          <div
            key={r.id}
            className={`calendar-today-item ${r.isCompleted ? "completed" : ""}`}
            onClick={() => {
              if (busy) return;
              onToggle(r.id, r.isCompleted);
            }}
          >
            <span
              className={`calendar-today-check ${r.isCompleted ? "checked" : ""}`}
            >
              {r.isCompleted ? <CheckCircle size={14} /> : <Circle size={14} />}
            </span>
            <span className="calendar-today-item-text">{r.title}</span>
            <span className="calendar-today-time">
              {toTimeString(r.dueAt)}
            </span>
            <button
              type="button"
              className="reminder-tag-delete"
              title="删除提醒"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(r.id);
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
