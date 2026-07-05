"use client";

import { Plus } from "lucide-react";
import { CalendarReminderDto } from "@/shared/types/calendar";
import { CalendarTodayReminders } from "./calendar-today-reminders";

interface CalendarSidebarProps {
  showEvents: boolean;
  showReminders: boolean;
  onToggleEvents: () => void;
  onToggleReminders: () => void;
  reminders: CalendarReminderDto[];
  busyId: string | null;
  onToggleReminder: (id: string, isCompleted: boolean) => void;
  onDeleteReminder: (id: string) => void;
  onCreateClick: () => void;
}

export function CalendarSidebar({
  showEvents, showReminders, onToggleEvents, onToggleReminders,
  reminders, busyId, onToggleReminder, onDeleteReminder, onCreateClick,
}: CalendarSidebarProps) {
  return (
    <aside className="workspace-sidebar" aria-label="日程列表">
      <div className="workspace-sidebar-header">
        <div>
          <h1 className="workspace-title">日程</h1>
          <p className="workspace-subtitle">日历工作区</p>
        </div>
        <button
          className="button icon-only"
          type="button"
          aria-label="新建事项"
          onClick={onCreateClick}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="calendar-legend">
        <div className="calendar-legend-title">显示</div>
        <label className="calendar-legend-item">
          <input type="checkbox" checked={showEvents} onChange={onToggleEvents} />
          <span className="calendar-legend-swatch event" />
          我的日程
        </label>
        <label className="calendar-legend-item">
          <input type="checkbox" checked={showReminders} onChange={onToggleReminders} />
          <span className="calendar-legend-swatch reminder" />
          我的提醒
        </label>
      </div>

      <CalendarTodayReminders reminders={reminders} busyId={busyId} onToggle={onToggleReminder} onDelete={onDeleteReminder} />
    </aside>
  );
}
