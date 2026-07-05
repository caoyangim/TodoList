"use client";

import { CheckCircle, Circle, Trash2 } from "lucide-react";
import { CalendarReminderDto } from "@/shared/types/calendar";
import { toTimeString } from "./calendar-page";

interface CalendarReminderTagProps {
  reminder: CalendarReminderDto;
  disabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

export function CalendarReminderTag({
  reminder,
  disabled,
  onToggle,
  onDelete,
}: CalendarReminderTagProps) {
  return (
    <div
      className={`reminder-tag ${reminder.isCompleted ? "completed" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onToggle();
      }}
      title={reminder.title}
    >
      <span className="reminder-tag-icon">
        {reminder.isCompleted ? (
          <CheckCircle size={12} />
        ) : (
          <Circle size={12} />
        )}
      </span>
      <span className="reminder-tag-text">
        {toTimeString(reminder.dueAt)} {reminder.title}
      </span>
      <button
        type="button"
        className="reminder-tag-delete"
        title="删除提醒"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
