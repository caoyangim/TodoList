"use client";

import { CSSProperties } from "react";
import { CalendarEventDto } from "@/shared/types/calendar";
import { toTimeString } from "./calendar-page";

interface CalendarEventBarProps {
  event: CalendarEventDto;
  position: "start" | "middle" | "end" | "single";
  style?: CSSProperties;
  onClick?: () => void;
}

function eventBarStyle(event: CalendarEventDto): CSSProperties {
  const color = event.color ?? "#3B82F6";
  return {
    backgroundColor: `${color}28`,
    color,
    borderLeft: `3px solid ${color}`,
  };
}

export function CalendarEventBar({ event, position, style, onClick }: CalendarEventBarProps) {
  const timeLabel = event.isAllDay ? null : `${toTimeString(event.startAt)} `;

  const classNames = [
    "event-bar",
    position,
    event.isAllDay ? "all-day" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classNames}
      title={event.title}
      style={{ ...eventBarStyle(event), ...style }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {timeLabel}
      {event.title}
    </span>
  );
}
