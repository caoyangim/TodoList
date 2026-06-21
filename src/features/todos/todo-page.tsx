"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  Edit3,
  File,
  ListChecks,
  MessageSquare,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { apiRequest } from "@/shared/api-client";
import { formatFileSize } from "@/shared/format";
import { NoteContentDto, TemplateDto, TodoDto, TodoPriority, TodoStatus } from "@/shared/types/models";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner, LoadingState } from "@/components/loading";
import { Modal } from "@/components/modal";
import { RichNoteEditor } from "@/components/rich-note-editor";
import { RunCreateModal } from "@/features/runs/run-create-modal";

type StatusFilter = "pending" | "resolved" | "completed" | "all";
type TodoForm = {
  title: string;
  description: string;
  timePriority: TodoPriority;
  importancePriority: TodoPriority;
  dueAt: string;
};

const emptyRichContent: NoteContentDto = { html: "", files: [] };
const emptyForm: TodoForm = {
  title: "",
  description: "",
  timePriority: "MEDIUM",
  importancePriority: "MEDIUM",
  dueAt: "",
};
const priorityText = { HIGH: "高", MEDIUM: "中", LOW: "低" };
const todoStatusText: Record<TodoStatus, string> = {
  PENDING: "待处理",
  RESOLVED: "已解决（待验证）",
  COMPLETED: "已完成（已验证）",
};
const todoStatusBadgeClass: Record<TodoStatus, string> = {
  PENDING: "not-started",
  RESOLVED: "progress",
  COMPLETED: "completed",
};

function toDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDueDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  const today = new Date();
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const label = date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });

  if (dateOnly === todayOnly) {
    return { label: `今天 · ${label}`, overdue: false, isToday: true };
  }

  return { label, overdue: dateOnly < todayOnly, isToday: false };
}

function formatLongDate() {
  return new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function statusMatchesFilter(todo: TodoDto, status: StatusFilter) {
  if (status === "all") return true;
  if (status === "pending") return todo.status === "PENDING";
  if (status === "resolved") return todo.status === "RESOLVED";
  return todo.status === "COMPLETED";
}

function compareTodoPriority(a: TodoDto, b: TodoDto) {
  const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const aUrgency = priorityWeight[a.timePriority];
  const bUrgency = priorityWeight[b.timePriority];
  const aImportance = priorityWeight[a.importancePriority];
  const bImportance = priorityWeight[b.importancePriority];
  const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;

  if (aUrgency !== bUrgency) return bUrgency - aUrgency;
  if (aImportance !== bImportance) return bImportance - aImportance;
  if (aDue !== bDue) return aDue - bDue;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function formatTodoStamp(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPriorityTone(todo: TodoDto) {
  if (todo.timePriority === "HIGH" && todo.importancePriority === "HIGH") return "both";
  if (todo.importancePriority === "HIGH") return "important";
  if (todo.timePriority === "HIGH") return "urgent";
  return "balanced";
}

function getPriorityLabel(todo: TodoDto) {
  if (todo.timePriority === "HIGH" && todo.importancePriority === "HIGH") return "双高优先";
  if (todo.importancePriority === "HIGH") return "周目标";
  if (todo.timePriority === "HIGH") return "今日优先";
  return "保持推进";
}

type TodoListItemProps = {
  todo: TodoDto;
  busyId: string | null;
  onChangeStatus: (todo: TodoDto, nextStatus: TodoStatus, verificationReport?: NoteContentDto | null) => Promise<void>;
  onOpenEdit: (todo: TodoDto) => void;
  onOpenNote: (todo: TodoDto) => void;
  onOpenVerify: (todo: TodoDto) => void;
  onRemove: (todo: TodoDto) => Promise<void>;
  onConvert: (todo: TodoDto) => void;
};

function TodoListItem({
  todo,
  busyId,
  onChangeStatus,
  onOpenEdit,
  onOpenNote,
  onOpenVerify,
  onRemove,
  onConvert,
}: TodoListItemProps) {
  const due = formatDueDate(todo.dueAt);
  const isAdvancing =
    busyId === `status:${todo.id}:RESOLVED` || busyId === `status:${todo.id}:COMPLETED`;
  const isResetting =
    busyId === `status:${todo.id}:PENDING` || busyId === `status:${todo.id}:RESOLVED`;
  const isDeleting = busyId === `delete:${todo.id}`;
  const isBusy = isAdvancing || isResetting || isDeleting;

  return (
    <article className="list-item todo-detail-item" id={`todo-${todo.id}`}>
      <button
        aria-label={
          todo.status === "PENDING"
            ? "标记为已解决"
            : todo.status === "RESOLVED"
              ? "完成验证"
              : "重新进入待验证"
        }
        className={`check-button ${todo.status === "COMPLETED" ? "checked" : todo.status === "RESOLVED" ? "progress" : ""}`}
        disabled={isBusy}
        onClick={() => {
          if (todo.status === "PENDING") {
            void onChangeStatus(todo, "RESOLVED");
            return;
          }
          if (todo.status === "RESOLVED") {
            onOpenVerify(todo);
            return;
          }
          void onChangeStatus(todo, "RESOLVED");
        }}
      >
        {isAdvancing ? (
          <LoadingSpinner size={13} />
        ) : todo.status === "COMPLETED" ? (
          <ShieldCheck size={13} />
        ) : todo.status === "RESOLVED" ? (
          <ChevronRight size={13} />
        ) : (
          <Check size={13} />
        )}
      </button>
      <div className="list-item-main">
        <div className="todo-detail-head">
          <h2 className={`item-title ${todo.status === "COMPLETED" ? "completed-text" : ""}`}>{todo.title}</h2>
          <span className={`todo-priority-chip ${getPriorityTone(todo)}`}>{getPriorityLabel(todo)}</span>
        </div>
        {todo.description ? <p className="item-description">{todo.description}</p> : null}
        {todo.run ? (
          <Link className="todo-run-progress" href={`/runs/${todo.run.id}`}>
            <div className="todo-run-progress-heading">
              <span>
                <ListChecks size={14} />
                {todo.run.title}
                {todo.run.archivedAt ? "（已归档）" : ""}
              </span>
              <strong>{todo.run.progressPercent}%</strong>
            </div>
            <div className="progress-track">
              <div
                className={`progress-bar ${
                  todo.run.status === "COMPLETED"
                    ? "completed"
                    : todo.run.progressPercent >= 80
                      ? "near-complete"
                      : ""
                }`}
                style={{ width: `${todo.run.progressPercent}%` }}
              />
            </div>
            <span className="todo-run-progress-count">
              {todo.run.completedCount}/{todo.run.totalCount} 个执行节点
            </span>
          </Link>
        ) : null}
        {todo.note ? (
          <div className="node-note todo-note">
            <MessageSquare size={14} />
            <div className="node-note-content">
              {todo.note.html ? (
                <div
                  className="rich-note-content"
                  dangerouslySetInnerHTML={{ __html: todo.note.html }}
                />
              ) : null}
              {todo.note.files.length > 0 ? (
                <div className="note-file-grid display">
                  {todo.note.files.map((file) =>
                    file.mimeType.startsWith("image/") ? (
                      <a
                        href={file.url}
                        key={file.id}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="Todo 备注图片" src={file.url} />
                      </a>
                    ) : (
                      <a
                        href={file.url}
                        key={file.id}
                        rel="noreferrer"
                        target="_blank"
                        className="note-file-card display"
                      >
                        <File size={20} />
                        <span className="note-file-card-name" title={file.originalName}>
                          {file.originalName}
                        </span>
                        <span className="note-file-card-size">{formatFileSize(file.size)}</span>
                      </a>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {todo.verificationReport ? (
          <div className="node-note todo-note">
            <ShieldCheck size={14} />
            <div className="node-note-content">
              <div className="note-label">验证报告</div>
              {todo.verificationReport.html ? (
                <div
                  className="rich-note-content"
                  dangerouslySetInnerHTML={{ __html: todo.verificationReport.html }}
                />
              ) : null}
              {todo.verificationReport.files.length > 0 ? (
                <div className="note-file-grid display">
                  {todo.verificationReport.files.map((file) =>
                    file.mimeType.startsWith("image/") ? (
                      <a href={file.url} key={file.id} rel="noreferrer" target="_blank">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="Todo 验证报告附件" src={file.url} />
                      </a>
                    ) : (
                      <a
                        href={file.url}
                        key={file.id}
                        rel="noreferrer"
                        target="_blank"
                        className="note-file-card display"
                      >
                        <File size={20} />
                        <span className="note-file-card-name" title={file.originalName}>
                          {file.originalName}
                        </span>
                        <span className="note-file-card-size">{formatFileSize(file.size)}</span>
                      </a>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="item-meta">
          <span className={`badge ${todoStatusBadgeClass[todo.status]}`}>{todoStatusText[todo.status]}</span>
          <span className={`badge ${todo.timePriority.toLowerCase()}`}>
            紧急度：{priorityText[todo.timePriority]}
          </span>
          <span className={`badge ${todo.importancePriority.toLowerCase()}`}>
            重要度：{priorityText[todo.importancePriority]}
          </span>
          {due ? (
            <span className={due.overdue && todo.status !== "COMPLETED" ? "danger-text" : undefined}>
              {due.overdue && todo.status !== "COMPLETED" ? "已逾期 · " : ""}
              {due.label}
            </span>
          ) : null}
          <span>更新于 {formatTodoStamp(todo.updatedAt)}</span>
        </div>
      </div>
      <div className="item-actions">
        {!todo.run ? (
          <button
            aria-label="转换为 SOP 执行"
            className="button ghost icon-only"
            disabled={isBusy}
            onClick={() => onConvert(todo)}
            title="转换为 SOP 执行"
          >
            <ListChecks size={16} />
          </button>
        ) : null}
        {todo.status !== "PENDING" ? (
          <button
            aria-label="退回待处理"
            className="button ghost icon-only"
            disabled={isBusy}
            onClick={() => void onChangeStatus(todo, "PENDING")}
            title="退回待处理"
          >
            {isResetting && busyId === `status:${todo.id}:PENDING` ? <LoadingSpinner /> : <RotateCcw size={16} />}
          </button>
        ) : null}
        <button
          aria-label={todo.note ? "编辑备注" : "添加备注"}
          className="button ghost icon-only"
          disabled={isBusy}
          onClick={() => onOpenNote(todo)}
          title={todo.note ? "编辑备注" : "添加备注"}
        >
          <MessageSquare size={16} />
        </button>
        <button className="button ghost icon-only" aria-label="编辑" disabled={isBusy} onClick={() => onOpenEdit(todo)}><Edit3 size={16} /></button>
        <button className="button ghost icon-only" aria-label="删除" disabled={isBusy} onClick={() => void onRemove(todo)}>
          {isDeleting ? <LoadingSpinner /> : <Trash2 size={16} />}
        </button>
      </div>
    </article>
  );
}

export function TodoPage({ mode = "list" }: { mode?: "overview" | "list" }) {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [todos, setTodos] = useState<TodoDto[]>([]);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodoDto | null | "new">(null);
  const [noteTodo, setNoteTodo] = useState<TodoDto | null>(null);
  const [verifyTodo, setVerifyTodo] = useState<TodoDto | null>(null);
  const [convertingTodo, setConvertingTodo] = useState<TodoDto | null>(null);
  const [noteValue, setNoteValue] = useState<NoteContentDto>(emptyRichContent);
  const [verificationReportValue, setVerificationReportValue] = useState<NoteContentDto>(emptyRichContent);
  const [form, setForm] = useState<TodoForm>(emptyForm);
  const [error, setError] = useState("");

  const loadTodos = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [todoData, templateData] = await Promise.all([
        apiRequest<TodoDto[]>("/api/todos?status=all"),
        apiRequest<TemplateDto[]>("/api/templates"),
      ]);
      setTodos(todoData);
      setTemplates(templateData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Todo 加载失败");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTodos();
  }, [loadTodos]);

  function openCreate() {
    setForm(emptyForm);
    setEditing("new");
    setError("");
  }

  function openEdit(todo: TodoDto) {
    setForm({
      title: todo.title,
      description: todo.description ?? "",
      timePriority: todo.timePriority,
      importancePriority: todo.importancePriority,
      dueAt: toDateInput(todo.dueAt),
    });
    setEditing(todo);
    setError("");
  }

  function openNote(todo: TodoDto) {
    setNoteTodo(todo);
    setNoteValue(todo.note ?? emptyRichContent);
    setError("");
  }

  function openVerify(todo: TodoDto) {
    setVerifyTodo(todo);
    setVerificationReportValue(todo.verificationReport ?? emptyRichContent);
    setError("");
  }

  async function saveNote(event: React.FormEvent) {
    event.preventDefault();
    if (!noteTodo) return;
    setBusyId(`note:${noteTodo.id}`);
    setError("");
    try {
      const updated = await apiRequest<TodoDto>(`/api/todos/${noteTodo.id}/note`, {
        method: "PATCH",
        body: JSON.stringify({
          note: {
            html: noteValue.html,
            fileIds: noteValue.files.map((f) => f.id),
          },
        }),
      });
      setTodos((current) => current.map((todo) => (todo.id === updated.id ? updated : todo)));
      setNoteTodo(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "备注保存失败");
    } finally {
      setBusyId(null);
    }
  }

  async function saveTodo(event: React.FormEvent) {
    event.preventDefault();
    setBusyId("form");
    setError("");
    try {
      const payload = {
        ...form,
        dueAt: form.dueAt ? new Date(`${form.dueAt}T12:00:00`).toISOString() : null,
      };
      if (editing === "new") {
        await apiRequest("/api/todos", { method: "POST", body: JSON.stringify(payload) });
      } else if (editing) {
        await apiRequest(`/api/todos/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      setEditing(null);
      await loadTodos(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存失败");
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(todo: TodoDto, nextStatus: TodoStatus, verificationReport?: NoteContentDto | null) {
    const busyKey = `status:${todo.id}:${nextStatus}`;
    setBusyId(busyKey);
    try {
      await apiRequest(`/api/todos/${todo.id}/completion`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextStatus,
          ...(verificationReport !== undefined
            ? {
                verificationReport: verificationReport
                  ? {
                      html: verificationReport.html,
                      fileIds: verificationReport.files.map((file) => file.id),
                    }
                  : null,
              }
            : {}),
        }),
      });
      setVerifyTodo(null);
      await loadTodos(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function submitVerification(event: React.FormEvent) {
    event.preventDefault();
    if (!verifyTodo) return;
    await changeStatus(verifyTodo, "COMPLETED", verificationReportValue);
  }

  async function remove(todo: TodoDto) {
    if (!window.confirm(`确定删除“${todo.title}”吗？`)) return;
    setBusyId(`delete:${todo.id}`);
    try {
      await apiRequest(`/api/todos/${todo.id}`, { method: "DELETE" });
      await loadTodos(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  const sortedTodos = [...todos].sort(compareTodoPriority);
  const filteredTodos = sortedTodos.filter((todo) => statusMatchesFilter(todo, status));
  const pendingTodos = sortedTodos.filter((todo) => todo.status === "PENDING");
  const highImportanceTodos = sortedTodos.filter((todo) => todo.importancePriority === "HIGH");
  const weeklyGoals = pendingTodos.filter((todo) => todo.importancePriority === "HIGH").slice(0, 4);
  const todayFocus = pendingTodos.filter((todo) => todo.timePriority === "HIGH").slice(0, 4);
  const dueToday = pendingTodos.filter((todo) => formatDueDate(todo.dueAt)?.isToday).slice(0, 3);
  const overdueTodos = pendingTodos.filter((todo) => formatDueDate(todo.dueAt)?.overdue).slice(0, 3);
  const upcomingTodos = pendingTodos
    .filter((todo) => {
      const due = formatDueDate(todo.dueAt);
      return due && !due.overdue && !due.isToday;
    })
    .slice(0, 3);
  const recentNoteTodo = [...sortedTodos]
    .filter((todo) => todo.note || todo.description)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;

  const completedCount = todos.filter((todo) => todo.status === "COMPLETED").length;
  const resolvedCount = todos.filter((todo) => todo.status === "RESOLVED").length;
  const totalCount = todos.length;
  const weeklyGoalDone = highImportanceTodos.filter((todo) => todo.status === "COMPLETED").length;
  const todayFocusWithRuns = todayFocus.filter((todo) => todo.run);
  const urgentCount = pendingTodos.filter((todo) => todo.timePriority === "HIGH").length;
  const importantCount = pendingTodos.filter((todo) => todo.importancePriority === "HIGH").length;

  const overviewContent = (
    <section className="todo-dashboard page-section">
      <header className="todo-hero">
        <div>
          <div className="todo-hero-kicker">TODAY&apos;S WORKSPACE</div>
          <h1 className="page-title todo-hero-title">今天要推进什么？</h1>
          <p className="page-subtitle todo-hero-subtitle">
            {formatLongDate()} · 用紧急度安排今天，用重要度守住这周的主线。
          </p>
        </div>
        <div className="todo-hero-actions">
          <div className="todo-hero-metric">
            <strong>{completedCount}</strong>
            <span>已验证完成</span>
          </div>
          <div className="todo-hero-metric">
            <strong>{resolvedCount}</strong>
            <span>待验证</span>
          </div>
          <button className="button primary todo-create-button" onClick={openCreate}>
            <Plus size={17} /> 新建 Todo
          </button>
        </div>
      </header>

      <section className="todo-summary-strip" aria-label="Todo 工作台摘要">
        <div className="todo-summary-card">
          <span>今日紧急</span>
          <strong>{urgentCount}</strong>
          <small>优先处理高紧急度事项</small>
        </div>
        <div className="todo-summary-card">
          <span>本周重点</span>
          <strong>{importantCount}</strong>
          <small>高重要度任务仍在推进中</small>
        </div>
        <div className="todo-summary-card">
          <span>今天截止</span>
          <strong>{dueToday.length}</strong>
          <small>适合在今天收口的事项</small>
        </div>
        <div className="todo-summary-card danger">
          <span>逾期事项</span>
          <strong>{overdueTodos.length}</strong>
          <small>建议先清掉积压风险</small>
        </div>
      </section>

      {error && !editing ? <div className="error-banner">{error}</div> : null}

      {loading ? (
        <LoadingState label="正在整理今日工作台..." />
      ) : totalCount === 0 ? (
        <EmptyState
          title="今天从一件小事开始"
          description="先创建第一条 Todo，工作台会自动按重要度和紧急度整理今天的重点。"
          action={<button className="button primary" onClick={openCreate}>新建 Todo</button>}
        />
      ) : (
        <div className="todo-dashboard-grid">
              <section className="dashboard-panel dashboard-panel-goal">
                <div className="dashboard-panel-head">
                  <div>
                    <p className="dashboard-panel-kicker">WEEKLY GOALS</p>
                    <h2>周目标</h2>
                  </div>
                  <span className="dashboard-panel-chip">{weeklyGoals.length} 项</span>
                </div>
                <p className="dashboard-panel-copy">高重要度事项放在这里，保持这周的推进方向。</p>
                <div className="goal-metrics">
                  <div className="goal-metric-card">
                    <strong>{weeklyGoalDone}/{highImportanceTodos.length || 0}</strong>
                    <span>目标推进</span>
                  </div>
                  <div className="goal-metric-card">
                    <strong>{highImportanceTodos.filter((todo) => todo.status !== "COMPLETED").length}</strong>
                    <span>仍需关注</span>
                  </div>
                </div>
                <div className="goal-list">
                  {weeklyGoals.length > 0 ? (
                    weeklyGoals.map((todo) => {
                      const due = formatDueDate(todo.dueAt);
                      return (
                        <button
                          className="goal-card"
                          key={todo.id}
                          onClick={() => openEdit(todo)}
                          type="button"
                        >
                          <div className="goal-card-head">
                            <span className={`todo-priority-chip ${getPriorityTone(todo)}`}>{getPriorityLabel(todo)}</span>
                            {due ? <span className="goal-card-date">{due.label}</span> : null}
                          </div>
                          <strong>{todo.title}</strong>
                          <p>{todo.description || "这项工作已经被标记为本周的重要推进事项。"}</p>
                        </button>
                      );
                    })
                  ) : (
                    <div className="dashboard-inline-empty">暂无高重要度事项，可以把本周主线任务标成高重要度。</div>
                  )}
                </div>
              </section>

              <section className="dashboard-panel dashboard-panel-today">
                <div className="dashboard-panel-head">
                  <div>
                    <p className="dashboard-panel-kicker">TODAY&apos;S CHECKLIST</p>
                    <h2>当天代办清单</h2>
                  </div>
                  <span className="dashboard-panel-chip">{todayFocus.length} 项</span>
                </div>
                <p className="dashboard-panel-copy">高紧急度事项优先占据工作台中间区域，方便你马上开工。</p>
                <div className="today-card-grid">
                  {todayFocus.length > 0 ? (
                    todayFocus.map((todo) => {
                      const due = formatDueDate(todo.dueAt);
                      return (
                        <article className={`today-focus-card ${getPriorityTone(todo)}`} key={todo.id}>
                          <div className="today-focus-head">
                            <span className="today-focus-label">{getPriorityLabel(todo)}</span>
                            <span className="today-focus-count">{todo.run ? `${todo.run.completedCount}/${todo.run.totalCount}` : "待推进"}</span>
                          </div>
                          <h3>{todo.title}</h3>
                          <p>{todo.description || "这条 Todo 被放入今天的高优先处理区。"}</p>
                          {todo.run ? (
                            <Link className="today-focus-progress" href={`/runs/${todo.run.id}`}>
                              <div className="progress-track">
                                <div
                                  className={`progress-bar ${
                                    todo.run.status === "COMPLETED"
                                      ? "completed"
                                      : todo.run.progressPercent >= 80
                                        ? "near-complete"
                                        : ""
                                  }`}
                                  style={{ width: `${todo.run.progressPercent}%` }}
                                />
                              </div>
                              <span>{todo.run.title} · {todo.run.progressPercent}%</span>
                            </Link>
                          ) : null}
                          <div className="today-focus-meta">
                            {due ? <span>{due.label}</span> : <span>未设置截止日期</span>}
                            <button className="inline-action" onClick={() => void changeStatus(todo, "RESOLVED")} type="button">
                              标记已解决
                            </button>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="dashboard-inline-empty">暂无高紧急度事项，今天可以按节奏推进重要工作。</div>
                  )}
                </div>
                {todayFocusWithRuns.length > 0 ? (
                  <div className="today-run-strip">
                    <div className="today-run-strip-title">正在推进的 SOP</div>
                    <div className="today-run-strip-list">
                      {todayFocusWithRuns.map((todo) => (
                        <Link className="today-run-pill" href={`/runs/${todo.run?.id}`} key={todo.id}>
                          <ListChecks size={14} />
                          <span>{todo.run?.title}</span>
                          <strong>{todo.run?.progressPercent}%</strong>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <aside className="todo-side-column">
                <section className="dashboard-panel dashboard-panel-schedule">
                  <div className="dashboard-panel-head">
                    <div>
                      <p className="dashboard-panel-kicker">TODAY&apos;S PLAN</p>
                      <h2>今日安排</h2>
                    </div>
                  </div>
                  <div className="schedule-group">
                    <div className="schedule-group-title">今天截止</div>
                    {dueToday.length > 0 ? dueToday.map((todo) => (
                      <button className="schedule-card today" key={todo.id} onClick={() => openEdit(todo)} type="button">
                        <span>{todo.title}</span>
                        <small>{formatDueDate(todo.dueAt)?.label}</small>
                      </button>
                    )) : <div className="dashboard-inline-empty compact">今天没有明确截止项。</div>}
                  </div>
                  <div className="schedule-group">
                    <div className="schedule-group-title">已逾期</div>
                    {overdueTodos.length > 0 ? overdueTodos.map((todo) => (
                      <button className="schedule-card overdue" key={todo.id} onClick={() => openEdit(todo)} type="button">
                        <span>{todo.title}</span>
                        <small>{formatDueDate(todo.dueAt)?.label}</small>
                      </button>
                    )) : <div className="dashboard-inline-empty compact">没有逾期事项。</div>}
                  </div>
                  <div className="schedule-group">
                    <div className="schedule-group-title">最近到期</div>
                    {upcomingTodos.length > 0 ? upcomingTodos.map((todo) => (
                      <button className="schedule-card" key={todo.id} onClick={() => openEdit(todo)} type="button">
                        <span>{todo.title}</span>
                        <small>{formatDueDate(todo.dueAt)?.label}</small>
                      </button>
                    )) : <div className="dashboard-inline-empty compact">最近没有新的截止安排。</div>}
                  </div>
                </section>

                <section className="dashboard-panel dashboard-panel-note">
                  <div className="dashboard-panel-head">
                    <div>
                      <p className="dashboard-panel-kicker">QUICK NOTE</p>
                      <h2>随手便贴</h2>
                    </div>
                    <Sparkles size={16} />
                  </div>
                  {recentNoteTodo ? (
                    <button className="sticky-note-card" onClick={() => openNote(recentNoteTodo)} type="button">
                      <strong>{recentNoteTodo.title}</strong>
                      <p>
                        {recentNoteTodo.note?.html
                          ? "这条 Todo 已有备注，点开继续补充记录。"
                          : recentNoteTodo.description || "这条事项最近有更新，适合继续补充细节。"}
                      </p>
                      <span>最近更新于 {formatTodoStamp(recentNoteTodo.updatedAt)}</span>
                    </button>
                  ) : (
                    <div className="sticky-note-card static">
                      <strong>记录灵感或复盘</strong>
                      <p>先选一条 Todo 添加备注，右侧这块就会自动成为你的轻量便贴区。</p>
                      <span>支持富文本、链接和图片粘贴</span>
                    </div>
                  )}
                </section>
              </aside>
        </div>
      )}
    </section>
  );

  const listContent = (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">我的 Todo</h1>
          <p className="page-subtitle">这里保留原始 Todo 列表，专注查看、筛选和逐条处理。</p>
        </div>
        <button className="button primary" onClick={openCreate}>
          <Plus size={17} /> 新建 Todo
        </button>
      </header>

      {error && !editing ? <div className="error-banner page-section">{error}</div> : null}

      {loading ? (
        <LoadingState label="正在加载 Todo 列表..." />
      ) : (
        <section className="todo-detail-section todo-detail-section-standalone">
          <div className="todo-detail-header">
            <div>
              <p className="dashboard-panel-kicker">DETAIL LIST</p>
              <h2 className="section-title">全部 Todo 明细</h2>
            </div>
            <div className="todo-detail-summary">
              <span>{filteredTodos.length} / {totalCount} 条</span>
            </div>
          </div>

          <div className="tabs page-section todo-tabs">
            {(["pending", "resolved", "completed", "all"] as StatusFilter[]).map((value) => (
              <button
                className={`tab ${status === value ? "active" : ""}`}
                disabled={loading}
                key={value}
                onClick={() => setStatus(value)}
              >
                {value === "pending"
                  ? "待处理"
                  : value === "resolved"
                    ? "已解决"
                    : value === "completed"
                      ? "已完成"
                      : "全部"}
              </button>
            ))}
          </div>

          {filteredTodos.length === 0 ? (
            <EmptyState
              title={
                status === "completed"
                  ? "还没有已完成的 Todo"
                  : status === "resolved"
                    ? "还没有待验证的 Todo"
                    : status === "pending"
                      ? "待处理区已经清空"
                      : "还没有任何 Todo"
              }
              description={
                status === "completed"
                  ? "已验证完成的事项会出现在这里。"
                  : status === "resolved"
                    ? "已经解决、等待验证的事项会出现在这里。"
                    : status === "pending"
                      ? "可以新建 Todo，或者把工作重点放回概览页。"
                      : "创建第一个 Todo，让计划开始流动。"
              }
              action={status === "completed" ? null : <button className="button primary" onClick={openCreate}>新建 Todo</button>}
            />
          ) : (
            <div className="list todo-detail-list">
              {filteredTodos.map((todo) => (
                <TodoListItem
                  busyId={busyId}
                  key={todo.id}
                  onChangeStatus={changeStatus}
                  onConvert={(item) => {
                    setError("");
                    setConvertingTodo(item);
                  }}
                  onOpenEdit={openEdit}
                  onOpenNote={openNote}
                  onOpenVerify={openVerify}
                  onRemove={remove}
                  todo={todo}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );

  return (
    <>
      {mode === "overview" ? overviewContent : listContent}

      {editing ? (
        <Modal
          title={editing === "new" ? "新建 Todo" : "编辑 Todo"}
          onClose={() => {
            if (busyId !== "form") setEditing(null);
          }}
        >
          <form className="form-stack" onSubmit={saveTodo}>
            {error ? <div className="error-banner">{error}</div> : null}
            <div className="field">
              <label htmlFor="todo-title">标题</label>
              <input id="todo-title" autoFocus className="input" maxLength={200} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="todo-description">说明</label>
              <textarea id="todo-description" className="textarea" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="todo-time-priority">时间优先级</label>
                <select id="todo-time-priority" className="select" value={form.timePriority} onChange={(event) => setForm({ ...form, timePriority: event.target.value as TodoPriority })}>
                  <option value="HIGH">高</option>
                  <option value="MEDIUM">中</option>
                  <option value="LOW">低</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="todo-importance-priority">重要优先级</label>
                <select id="todo-importance-priority" className="select" value={form.importancePriority} onChange={(event) => setForm({ ...form, importancePriority: event.target.value as TodoPriority })}>
                  <option value="HIGH">高</option>
                  <option value="MEDIUM">中</option>
                  <option value="LOW">低</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="todo-due">截止日期</label>
                <input id="todo-due" className="input" type="date" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button className="button" disabled={busyId === "form"} type="button" onClick={() => setEditing(null)}>取消</button>
              <button className="button primary" disabled={busyId === "form"} type="submit">
                {busyId === "form" ? <><LoadingSpinner /> 保存中...</> : "保存"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {convertingTodo ? (
        <RunCreateModal
          templates={templates}
          initialTitle={convertingTodo.title}
          todoId={convertingTodo.id}
          onClose={() => setConvertingTodo(null)}
          onCreated={() => {
            setConvertingTodo(null);
            void loadTodos(false);
          }}
        />
      ) : null}

      {verifyTodo ? (
        <Modal
          title="完成验证"
          onClose={() => {
            if (busyId !== `status:${verifyTodo.id}:COMPLETED`) setVerifyTodo(null);
          }}
        >
          <form className="form-stack" onSubmit={submitVerification}>
            {error ? <div className="error-banner">{error}</div> : null}
            <div className="field">
              <label>{verifyTodo.title}</label>
              <p className="modal-hint">
                可以补充可选的验证报告，也可以直接完成验证。
              </p>
            </div>
            <div className="field">
              <label>验证报告（可选）</label>
              <RichNoteEditor
                value={verificationReportValue}
                onChange={setVerificationReportValue}
                onError={setError}
              />
            </div>
            <div className="form-actions">
              <button
                className="button"
                disabled={busyId === `status:${verifyTodo.id}:COMPLETED`}
                onClick={() => setVerifyTodo(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="button primary"
                disabled={busyId === `status:${verifyTodo.id}:COMPLETED`}
                type="submit"
              >
                {busyId === `status:${verifyTodo.id}:COMPLETED` ? (
                  <>
                    <LoadingSpinner /> 提交中...
                  </>
                ) : (
                  "确认完成"
                )}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {noteTodo ? (
        <Modal
          title={noteTodo.note ? "编辑 Todo 备注" : "添加 Todo 备注"}
          onClose={() => {
            if (busyId !== `note:${noteTodo.id}`) setNoteTodo(null);
          }}
        >
          <form className="form-stack" onSubmit={saveNote}>
            {error ? <div className="error-banner">{error}</div> : null}
            <div className="field">
              <label>{noteTodo.title}</label>
              <RichNoteEditor value={noteValue} onChange={setNoteValue} onError={setError} />
            </div>
            <div className="form-actions">
              <button
                className="button"
                disabled={busyId === `note:${noteTodo.id}`}
                onClick={() => setNoteTodo(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="button primary"
                disabled={busyId === `note:${noteTodo.id}`}
                type="submit"
              >
                {busyId === `note:${noteTodo.id}` ? (
                  <>
                    <LoadingSpinner /> 保存中...
                  </>
                ) : (
                  "保存备注"
                )}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
