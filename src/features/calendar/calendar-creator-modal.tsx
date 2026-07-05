"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { apiRequest } from "@/shared/api-client";
import {
  CalendarEventDto,
  CalendarReminderDto,
  EventStop,
  EVENT_COLORS,
  EventColor,
} from "@/shared/types/calendar";
import { toDateString, toTimeString } from "./calendar-page";

interface CalendarCreatorModalProps {
  initialStartDate?: string | null;
  initialDate?: string | null;
  initialTime?: string | null;
  editEvent: CalendarEventDto | null;
  usedColors?: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}

type CreatorMode = "event" | "reminder";

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function laterTime(minutesAhead: number): string {
  const d = new Date(Date.now() + minutesAhead * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toIso(dateStr: string, timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const parts = dateStr.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], h, m).toISOString();
}

/** Darken a hex color by factor (0 = unchanged, 1 = black) */
function shadeColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const d = (c: number) => Math.round(c * (1 - factor));
  return `#${d(r).toString(16).padStart(2, "0")}${d(g).toString(16).padStart(2, "0")}${d(b).toString(16).padStart(2, "0")}`;
}

export function CalendarCreatorModal({
  initialStartDate,
  initialDate,
  initialTime,
  editEvent,
  usedColors,
  onClose,
  onSaved,
}: CalendarCreatorModalProps) {
  const isEditing = editEvent !== null;
  const today = dateInput(new Date());
  // When creating new, use initialStartDate if provided, otherwise today.
  // When editing, use the event's date.
  const seedDate = isEditing
    ? toDateString(editEvent!.startAt)
    : (initialStartDate ?? today);
  // End date defaults to the clicked/specified end date, falling back to today
  const defaultEndDate = initialDate ?? today;

  // Edit prefill
  const evEndDate = editEvent ? toDateString(editEvent.endAt) : null;
  const evStartTime = editEvent && !editEvent.isAllDay ? toTimeString(editEvent.startAt) : null;
  const evEndTime = editEvent && !editEvent.isAllDay ? toTimeString(editEvent.endAt) : null;

  const [mode, setMode] = useState<CreatorMode>("event");
  const [title, setTitle] = useState(editEvent?.title ?? "");
  const [startDate, setStartDate] = useState(seedDate);
  // Event: use current system time. Reminder: use clicked slot time or current time.
  const [startTime, setStartTime] = useState(
    evStartTime ?? initialTime ?? nowTime(),
  );
  const [endDate, setEndDate] = useState(evEndDate ?? defaultEndDate);
  const [endTime, setEndTime] = useState(
    evEndTime ?? laterTime(60),
  );
  const [isAllDay, setIsAllDay] = useState(editEvent?.isAllDay ?? true);
  // Pick the first unused color in the selected range, fallback to blue
  const defaultColor: EventColor = (editEvent?.color as EventColor)
    ?? (EVENT_COLORS.find((c) => !usedColors?.has(c.value))?.value as EventColor)
    ?? "#3B82F6";
  const [color, setColor] = useState<EventColor>(defaultColor);

  // --- Intermediate stops ---
  const [stops, setStops] = useState<EventStop[]>(
    editEvent?.stops ?? [],
  );
  const dayDiff = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000,
  );
  const maxStops = Math.max(0, dayDiff - 1);
  // Available dates between start and end (exclusive)
  const stopDates = Array.from({ length: Math.max(0, dayDiff - 1) }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i + 1);
    return dateInput(d);
  });
  const usedStopDates = new Set(stops.map((s) => s.date));

  // Clean up stops when date range shrinks
  useEffect(() => {
    setStops((prev) => {
      const valid = prev.filter(
        (s) => s.date > startDate && s.date < endDate,
      );
      return valid.slice(0, maxStops);
    });
  }, [startDate, endDate, maxStops]);

  function addStop() {
    const available = stopDates.find((d) => !usedStopDates.has(d));
    if (!available || stops.length >= maxStops) return;
    setStops((prev) =>
      [...prev, { date: available, title: "" }].sort(
        (a, b) => a.date.localeCompare(b.date),
      ),
    );
  }

  function updateStop(index: number, field: "date" | "title", value: string) {
    setStops((prev) => {
      const next = prev.map((s, i) => (i === index ? { ...s, [field]: value } : s));
      return next.sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  function removeStop(index: number) {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  const [reminderDate, setReminderDate] = useState(initialDate ?? seedDate);
  // Reminder defaults to the clicked slot time, or current time
  const [reminderTime, setReminderTime] = useState(initialTime ?? nowTime());
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly">("none");
  const [description, setDescription] = useState(editEvent?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    if (saving || deleting) return;
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError("请输入标题"); return; }
    setSaving(true);
    try {
      if (mode === "event" || isEditing) {
        const sAt = isAllDay ? toIso(startDate, "00:00") : toIso(startDate, startTime);
        const eAt = isAllDay ? toIso(endDate, "23:59") : toIso(endDate, endTime);
        if (new Date(eAt) <= new Date(sAt)) { setError("结束时间必须晚于开始时间"); setSaving(false); return; }
        const body = { title: title.trim(), description: description.trim() || null, startAt: sAt, endAt: eAt, isAllDay, color, stops };
        if (isEditing) {
          await apiRequest<CalendarEventDto>(`/api/calendar/events/${editEvent!.id}`, { method: "PATCH", body: JSON.stringify(body) });
        } else {
          await apiRequest<CalendarEventDto>("/api/calendar/events", { method: "POST", body: JSON.stringify(body) });
        }
      } else {
        const dueAt = toIso(reminderDate, reminderTime);
        await apiRequest<CalendarReminderDto>("/api/calendar/reminders", {
          method: "POST", body: JSON.stringify({ title: title.trim(), description: description.trim() || null, dueAt, repeat }),
        });
      }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "保存失败"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!editEvent) return;
    setDeleting(true); setError("");
    try { await apiRequest(`/api/calendar/events/${editEvent.id}`, { method: "DELETE" }); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "删除失败"); setDeleting(false); }
  }

  return (
    <Modal title={isEditing ? "编辑日程" : "新建事项"} onClose={reset}>
      <form className="form-stack" onSubmit={handleSubmit}>
        {error && <div className="error-banner">{error}</div>}

        {!isEditing && (
          <div className="segment-control">
            <button type="button" className={`segment-btn${mode === "event" ? " active" : ""}`} onClick={() => setMode("event")}>日程</button>
            <button type="button" className={`segment-btn${mode === "reminder" ? " active" : ""}`} onClick={() => setMode("reminder")}>提醒</button>
          </div>
        )}

        <div className="field">
          <label htmlFor="cal-title">标题</label>
          <input id="cal-title" autoFocus className="input" maxLength={200} required value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={mode === "event" || isEditing ? "例如：项目评审会" : "例如：提交周报"} />
        </div>

        {(mode === "event" || isEditing) && (
          <>
            <div className="form-row">
              <div className="field">
                <label htmlFor="cal-start-date">开始日期</label>
                <input id="cal-start-date" className="input" type="date" value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />
              </div>
              {!isAllDay && (
                <div className="field">
                  <label htmlFor="cal-start-time">开始时间</label>
                  <input id="cal-start-time" className="input" type="time" value={startTime}
                    onChange={(e) => setStartTime(e.target.value)} />
                </div>
              )}
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="cal-end-date">结束日期</label>
                <input id="cal-end-date" className="input" type="date" value={endDate} min={startDate}
                  onChange={(e) => setEndDate(e.target.value)} />
              </div>
              {!isAllDay && (
                <div className="field">
                  <label htmlFor="cal-end-time">结束时间</label>
                  <input id="cal-end-time" className="input" type="time" value={endTime}
                    onChange={(e) => setEndTime(e.target.value)} />
                </div>
              )}
            </div>

            <label className="calendar-legend-item" style={{ fontSize: 14 }}>
              <input type="checkbox" checked={isAllDay} onChange={(e) => setIsAllDay(e.target.checked)} />
              全天
            </label>

            <div className="field">
              <label>颜色</label>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {EVENT_COLORS.map((c) => (
                  <button key={c.value} type="button" title={c.label}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", backgroundColor: c.value,
                      border: color === c.value ? "2px solid var(--text)" : "2px solid transparent",
                      cursor: "pointer", outline: "none",
                    }}
                    onClick={() => setColor(c.value as EventColor)} />
                ))}
              </div>
            </div>

            {/* Intermediate stops */}
            {dayDiff > 1 && (
              <div className="field">
                <label>中间节点</label>
                <div className="event-stops-list">
                  {stops.map((stop, i) => (
                    <div key={i} className="event-stop-item">
                      <span
                        className="event-stop-dot"
                        style={{
                          backgroundColor: shadeColor(color, (i + 1) * 0.2),
                        }}
                      />
                      <input
                        className="input"
                        type="date"
                        min={stopDates[0]}
                        max={stopDates[stopDates.length - 1]}
                        value={stop.date}
                        onChange={(e) => updateStop(i, "date", e.target.value)}
                        style={{ flex: "0 0 140px" }}
                      />
                      <input
                        className="input"
                        placeholder="节点标题"
                        maxLength={100}
                        value={stop.title}
                        onChange={(e) => updateStop(i, "title", e.target.value)}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <button
                        type="button"
                        className="event-stop-remove"
                        title="移除节点"
                        onClick={() => removeStop(i)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {stops.length < maxStops && (
                    <button
                      type="button"
                      className="event-stop-add"
                      onClick={addStop}
                    >
                      <Plus size={14} />
                      添加节点（{stops.length}/{maxStops}）
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {mode === "reminder" && !isEditing && (
          <>
            <div className="form-row">
              <div className="field">
                <label htmlFor="cal-rem-date">提醒日期</label>
                <input id="cal-rem-date" className="input" type="date" value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cal-rem-time">提醒时间</label>
                <input id="cal-rem-time" className="input" type="time" value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="cal-repeat">重复</label>
              <select id="cal-repeat" className="select" value={repeat}
                onChange={(e) => setRepeat(e.target.value as "none" | "daily" | "weekly")}>
                <option value="none">不重复</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
              </select>
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="cal-desc">备注</label>
          <textarea id="cal-desc" className="textarea" value={description}
            onChange={(e) => setDescription(e.target.value)} placeholder="可选备注说明" />
        </div>

        <div className="form-actions">
          {isEditing && (
            <button className="button danger" type="button" disabled={deleting || saving}
              onClick={handleDelete} style={{ marginRight: "auto" }}>
              {deleting ? "删除中..." : "删除"}
            </button>
          )}
          <button className="button" type="button" disabled={saving || deleting} onClick={reset}>取消</button>
          <button className="button primary" type="submit" disabled={saving || deleting}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
