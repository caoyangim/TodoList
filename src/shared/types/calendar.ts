// Frontend view types (used in calendar UI rendering)

export const EVENT_COLORS = [
  { value: "#3B82F6", label: "蓝色" },
  { value: "#10B981", label: "绿色" },
  { value: "#8B5CF6", label: "紫色" },
  { value: "#F59E0B", label: "橙色" },
  { value: "#EC4899", label: "粉色" },
  { value: "#14B8A6", label: "青色" },
  { value: "#EF4444", label: "红色" },
  { value: "#6B7280", label: "灰色" },
] as const;

export type EventColor = (typeof EVENT_COLORS)[number]["value"];

export interface EventStop {
  date: string; // YYYY-MM-DD
  title: string;
}

export interface EventItem {
  id: string;
  title: string;
  description?: string;
  startDate: string; // YYYY-MM-DD
  startTime?: string; // HH:MM, undefined if all-day
  endDate: string; // YYYY-MM-DD
  endTime?: string; // HH:MM
  isAllDay: boolean;
  color: EventColor;
  todoId?: string;
}

export interface ReminderItem {
  id: string;
  title: string;
  description?: string;
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // HH:MM
  isCompleted: boolean;
  repeat: "none" | "daily" | "weekly";
  todoId?: string;
}

// API DTOs (returned from server, ISO 8601 UTC timestamps)

export type CalendarEventDto = {
  id: string;
  title: string;
  description: string | null;
  startAt: string; // ISO 8601 UTC
  endAt: string; // ISO 8601 UTC
  isAllDay: boolean;
  color: EventColor;
  todoId: string | null;
  stops: EventStop[];
  createdAt: string;
  updatedAt: string;
};

export type CalendarReminderDto = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string; // ISO 8601 UTC
  isCompleted: boolean;
  repeat: "none" | "daily" | "weekly";
  todoId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarQueryResult = {
  events: CalendarEventDto[];
  reminders: CalendarReminderDto[];
};
