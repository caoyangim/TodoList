"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/shared/api-client";
import {
  CalendarEventDto,
  CalendarQueryResult,
  CalendarReminderDto,
} from "@/shared/types/calendar";
import { CalendarSidebar } from "./calendar-sidebar";
import { CalendarMonthView } from "./calendar-month-view";
import { CalendarWeekView } from "./calendar-week-view";
import { Columns2, Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { LoadingSpinner } from "@/components/loading";
import { CalendarCreatorModal } from "./calendar-creator-modal";

export function toDateString(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function toTimeString(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type CalendarView = "month" | "week";

function monthStart(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

function monthEnd(year: number, month: number): string {
  const d = new Date(year, month + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Get Sunday of the week containing `date` */
function weekSunday(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a date range like "7月6日 – 12日, 2026" */
function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const year = start.getFullYear();
  const sMonth = start.getMonth() + 1;
  const eMonth = end.getMonth() + 1;
  if (sMonth === eMonth) {
    return `${sMonth}月${start.getDate()}日 – ${end.getDate()}日, ${year}`;
  }
  return `${sMonth}月${start.getDate()}日 – ${eMonth}月${end.getDate()}日, ${year}`;
}

export function CalendarPage() {
  const [view, setView] = useState<CalendarView>("month");
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [reminders, setReminders] = useState<CalendarReminderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showEvents, setShowEvents] = useState(true);
  const [showReminders, setShowReminders] = useState(true);
  const [dateStyle, setDateStyle] = useState<"centered" | "corner">("corner");

  // Month view state
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Week view state
  const [weekStart, setWeekStart] = useState(() => weekSunday(new Date()));

  // Determine query range
  const from = view === "month"
    ? monthStart(currentMonth.year, currentMonth.month)
    : toDateString(weekStart.toISOString());
  const to = view === "month"
    ? monthEnd(currentMonth.year, currentMonth.month)
    : toDateString(new Date(weekStart.getTime() + 7 * 86400000).toISOString());

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorDate, setCreatorDate] = useState<string | null>(null);
  const [creatorEndDate, setCreatorEndDate] = useState<string | null>(null);
  const [creatorTime, setCreatorTime] = useState<string | null>(null);
  const [creatorUsedColors, setCreatorUsedColors] = useState<Set<string>>(new Set());
  const [editingEvent, setEditingEvent] = useState<CalendarEventDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // --- Selection ---
  const [selecting, setSelecting] = useState(false);
  const [selectStart, setSelectStart] = useState<string | null>(null);
  const [selectEnd, setSelectEnd] = useState<string | null>(null);
  const [selectMenuPos, setSelectMenuPos] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const result = await apiRequest<CalendarQueryResult>(
        `/api/calendar?from=${from}&to=${to}`,
      );
      setEvents(result.events);
      setReminders(result.reminders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "日历数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // --- Navigation ---
  function goPrev() {
    if (view === "month") {
      setCurrentMonth((prev) => {
        const d = new Date(prev.year, prev.month - 1, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
      });
    } else {
      setWeekStart((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() - 7);
        return d;
      });
    }
  }

  function goNext() {
    if (view === "month") {
      setCurrentMonth((prev) => {
        const d = new Date(prev.year, prev.month + 1, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
      });
    } else {
      setWeekStart((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() + 7);
        return d;
      });
    }
  }

  function goToToday() {
    const now = new Date();
    setCurrentMonth({ year: now.getFullYear(), month: now.getMonth() });
    setWeekStart(weekSunday(now));
  }

  // --- Header label ---
  const headerLabel = view === "month"
    ? `${currentMonth.year}年 ${currentMonth.month + 1}月`
    : formatWeekRange(weekStart);

  // --- Creator ---
  function openCreator(startDate?: string, endDate?: string, time?: string) {
    setEditingEvent(null);
    setCreatorDate(startDate ?? null);
    setCreatorEndDate(endDate ?? null);
    setCreatorTime(time ?? null);
    // Collect colors used by events overlapping the selected date range
    const rangeStart = startDate ?? endDate;
    const rangeEnd = endDate ?? startDate;
    const used = new Set<string>();
    if (rangeStart) {
      for (const e of events) {
        const es = toDateString(e.startAt);
        const ee = toDateString(e.endAt);
        if ((rangeEnd ? es <= rangeEnd : true) && (rangeEnd ? ee >= rangeStart : es === rangeStart)) {
          used.add(e.color);
        }
      }
    }
    setCreatorUsedColors(used);
    setCreatorOpen(true);
  }

  function openEditor(event: CalendarEventDto) {
    setEditingEvent(event);
    setCreatorTime(null);
    setCreatorOpen(true);
  }

  function closeCreator() {
    if (busyId === "creator") return;
    setCreatorOpen(false);
    setCreatorDate(null);
    setCreatorEndDate(null);
    setCreatorTime(null);
    setEditingEvent(null);
  }

  // --- Selection ---
  function handleCellPointerDown(date: string, e: React.PointerEvent) {
    if (selecting) {
      // Second tap after long-press: set end date and show popup
      setSelectEnd(date);
      setSelectMenuPos({ x: e.clientX, y: e.clientY });
      return;
    }
    longPressTimer.current = setTimeout(() => {
      setSelecting(true);
      setSelectStart(date);
      setSelectEnd(null);
      setSelectMenuPos(null);
    }, 400);
  }

  function handleCellPointerEnter() {
    // Cancel long-press if pointer moved before timer fires
    if (!selecting && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handlePointerUp() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  // Close popup and exit selection mode on outside click
  useEffect(() => {
    if (!selectMenuPos) return;
    function onPointerDown(e: PointerEvent) {
      // Ignore clicks inside the popup itself
      const target = e.target as HTMLElement;
      if (target.closest(".calendar-select-popup")) return;
      setSelectMenuPos(null);
      setSelecting(false);
      setSelectStart(null);
      setSelectEnd(null);
    }
    const id = setTimeout(() => {
      window.addEventListener("pointerdown", onPointerDown, { once: true });
    }, 100);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [selectMenuPos]);

  function handleSelectCreate() {
    const start = selectStart && selectEnd
      ? (selectStart < selectEnd ? selectStart : selectEnd)
      : selectStart;
    const end = selectStart && selectEnd
      ? (selectStart < selectEnd ? selectEnd : selectStart)
      : selectEnd;
    setSelectMenuPos(null);
    setSelecting(false);
    setSelectStart(null);
    setSelectEnd(null);
    openCreator(start ?? undefined, end ?? undefined);
  }

  // --- Reminder toggle ---
  async function handleToggleReminder(reminderId: string, isCompleted: boolean) {
    setBusyId(`reminder:${reminderId}`);
    try {
      await apiRequest(`/api/calendar/reminders/${reminderId}/completion`, {
        method: "PATCH",
        body: JSON.stringify({ isCompleted: !isCompleted }),
      });
      await loadData();
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  }

  // --- Reminder delete ---
  const [pendingDeleteReminder, setPendingDeleteReminder] = useState<CalendarReminderDto | null>(null);

  function handleDeleteReminder(reminderId: string) {
    const r = reminders.find((x) => x.id === reminderId);
    if (r) setPendingDeleteReminder(r);
  }

  async function handleConfirmDeleteReminder() {
    if (!pendingDeleteReminder) return;
    setBusyId(`reminder:${pendingDeleteReminder.id}`);
    try {
      await apiRequest(`/api/calendar/reminders/${pendingDeleteReminder.id}`, {
        method: "DELETE",
      });
      setPendingDeleteReminder(null);
      await loadData();
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="workspace calendar-workspace">
      <CalendarSidebar
        showEvents={showEvents}
        showReminders={showReminders}
        onToggleEvents={() => setShowEvents((v) => !v)}
        onToggleReminders={() => setShowReminders((v) => !v)}
        events={events}
        reminders={reminders}
        busyId={busyId}
        onToggleReminder={handleToggleReminder}
        onDeleteReminder={handleDeleteReminder}
        onCreateClick={() => openCreator()}
      />

      <div
        className="calendar-main"
        onPointerUp={handlePointerUp}
      >
        {/* Header */}
        <div className="calendar-header">
          <div className="calendar-nav">
            <button
              className="calendar-nav-btn"
              type="button"
              onClick={goPrev}
              aria-label={view === "month" ? "上个月" : "上一周"}
            >
              ‹
            </button>
            <span className="calendar-month-label">{headerLabel}</span>
            <button
              className="calendar-nav-btn"
              type="button"
              onClick={goNext}
              aria-label={view === "month" ? "下个月" : "下一周"}
            >
              ›
            </button>
          </div>

          <div className="calendar-header-right">
            <div className="calendar-view-tabs">
              <button
                className={`calendar-view-tab ${view === "month" ? "active" : ""}`}
                type="button"
                onClick={() => setView("month")}
              >
                月
              </button>
              <button
                className={`calendar-view-tab ${view === "week" ? "active" : ""}`}
                type="button"
                onClick={() => setView("week")}
              >
                周
              </button>
            </div>

            <button className="calendar-today-btn" type="button" onClick={goToToday}>
              今天
            </button>

            <button
              className={`calendar-icon-btn${dateStyle === "centered" ? " active" : ""}`}
              type="button"
              onClick={() => setDateStyle((s) => (s === "centered" ? "corner" : "centered"))}
              title="切换日期显示样式"
            >
              <Columns2 size={16} />
            </button>
          </div>
        </div>

        {/* Error / Loading */}
        {error && <div className="error-banner">{error}</div>}
        {loading && (
          <div className="loading">
            <div className="loading-indicator" />
            <span>加载中...</span>
          </div>
        )}

        {/* Views */}
        {!loading && view === "month" && (
          <CalendarMonthView
            year={currentMonth.year}
            month={currentMonth.month}
            events={events}
            reminders={reminders}
            showEvents={showEvents}
            showReminders={showReminders}
            onCellClick={(date) => openCreator(undefined, date)}
            onEventClick={(event) => openEditor(event)}
            onToggleReminder={handleToggleReminder}
            onDeleteReminder={handleDeleteReminder}
            busyId={busyId}
            selecting={selecting}
            selectStart={selectStart}
            selectEnd={selectEnd}
            dateStyle={dateStyle}
            onCellPointerDown={handleCellPointerDown}
            onCellPointerEnter={handleCellPointerEnter}
          />
        )}

        {!loading && view === "week" && (
          <CalendarWeekView
            weekStart={weekStart}
            events={events}
            reminders={reminders}
            showEvents={showEvents}
            showReminders={showReminders}
            onSlotClick={(date, time) => openCreator(date, undefined, time)}
            onEventClick={(event) => openEditor(event)}
            onToggleReminder={handleToggleReminder}
            onDeleteReminder={handleDeleteReminder}
            busyId={busyId}
          />
        )}
      </div>

      {/* Creator/Editor Modal */}
      {creatorOpen && (
        <CalendarCreatorModal
          initialStartDate={creatorDate}
          initialDate={creatorEndDate}
          initialTime={creatorTime}
          editEvent={editingEvent}
          usedColors={creatorUsedColors}
          onClose={closeCreator}
          onSaved={() => {
            closeCreator();
            void loadData();
          }}
        />
      )}

      {/* Selection Popup Menu */}
      {selectMenuPos && (
        <div
          className="calendar-select-popup"
          style={{ left: selectMenuPos.x, top: selectMenuPos.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            className="calendar-select-popup-btn"
            type="button"
            onClick={() => handleSelectCreate()}
          >
            <Plus size={15} />
            创建日程
          </button>
        </div>
      )}

      {/* Delete Reminder Confirmation Modal */}
      {pendingDeleteReminder && (
        <Modal
          title="确认删除提醒？"
          onClose={() => {
            if (busyId !== `reminder:${pendingDeleteReminder.id}`) {
              setPendingDeleteReminder(null);
            }
          }}
        >
          <div className="form-stack">
            <p className="modal-description">
              将永久删除&ldquo;{pendingDeleteReminder.title}&rdquo;，此操作无法撤销。
            </p>
            <div className="form-actions">
              <button
                className="button"
                disabled={busyId === `reminder:${pendingDeleteReminder.id}`}
                onClick={() => setPendingDeleteReminder(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="button danger"
                disabled={busyId === `reminder:${pendingDeleteReminder.id}`}
                onClick={() => void handleConfirmDeleteReminder()}
                type="button"
              >
                {busyId === `reminder:${pendingDeleteReminder.id}` ? (
                  <><LoadingSpinner /> 删除中...</>
                ) : (
                  "确认删除"
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
