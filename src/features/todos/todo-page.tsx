"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, Edit3, File, ListChecks, MessageSquare, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { apiRequest } from "@/shared/api-client";
import { NoteContentDto, TemplateDto, TodoDto, TodoPriority, TodoStatus } from "@/shared/types/models";
import { formatFileSize } from "@/shared/format";
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
  return { label, overdue: dateOnly < todayOnly };
}

export function TodoPage() {
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
        apiRequest<TodoDto[]>(`/api/todos?status=${status}`),
        apiRequest<TemplateDto[]>("/api/templates"),
      ]);
      setTodos(todoData);
      setTemplates(templateData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Todo 加载失败");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [status]);

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

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">我的 Todo</h1>
          <p className="page-subtitle">把今天要做的事清楚地放在眼前。</p>
        </div>
        <button className="button primary" onClick={openCreate}>
          <Plus size={17} /> 新建 Todo
        </button>
      </header>

      <div className="tabs page-section">
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

      {error && !editing ? <div className="error-banner page-section">{error}</div> : null}
      {loading ? (
        <LoadingState label="正在加载 Todo..." />
      ) : todos.length === 0 ? (
        <EmptyState
          title={
            status === "completed"
              ? "还没有已完成的 Todo"
              : status === "resolved"
                ? "还没有待验证的 Todo"
                : "今天从一件小事开始"
          }
          description={
            status === "completed"
              ? "已验证完成的事项会出现在这里。"
              : status === "resolved"
                ? "已经解决、等待验证的事项会出现在这里。"
                : "创建第一个 Todo，让计划开始流动。"
          }
          action={status === "completed" ? null : <button className="button primary" onClick={openCreate}>新建 Todo</button>}
        />
      ) : (
        <div className="list">
          {todos.map((todo) => {
            const due = formatDueDate(todo.dueAt);
            const isAdvancing =
              busyId === `status:${todo.id}:RESOLVED` || busyId === `status:${todo.id}:COMPLETED`;
            const isResetting =
              busyId === `status:${todo.id}:PENDING` || busyId === `status:${todo.id}:RESOLVED`;
            const isDeleting = busyId === `delete:${todo.id}`;
            const isBusy = isAdvancing || isResetting || isDeleting;
            return (
              <article className="list-item" key={todo.id}>
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
                      void changeStatus(todo, "RESOLVED");
                      return;
                    }
                    if (todo.status === "RESOLVED") {
                      openVerify(todo);
                      return;
                    }
                    void changeStatus(todo, "RESOLVED");
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
                  <h2 className={`item-title ${todo.status === "COMPLETED" ? "completed-text" : ""}`}>{todo.title}</h2>
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
                      时间优先级：{priorityText[todo.timePriority]}
                    </span>
                    <span className={`badge ${todo.importancePriority.toLowerCase()}`}>
                      重要优先级：{priorityText[todo.importancePriority]}
                    </span>
                    {due ? (
                      <span className={due.overdue && todo.status !== "COMPLETED" ? "danger-text" : undefined}>
                        {due.overdue && todo.status !== "COMPLETED" ? "已逾期 · " : ""}
                        {due.label}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="item-actions">
                  {!todo.run ? (
                    <button
                      aria-label="转换为 SOP 执行"
                      className="button ghost icon-only"
                      disabled={isBusy}
                      onClick={() => {
                        setError("");
                        setConvertingTodo(todo);
                      }}
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
                      onClick={() => void changeStatus(todo, "PENDING")}
                      title="退回待处理"
                    >
                      {isResetting && busyId === `status:${todo.id}:PENDING` ? <LoadingSpinner /> : <RotateCcw size={16} />}
                    </button>
                  ) : null}
                  <button
                    aria-label={todo.note ? "编辑备注" : "添加备注"}
                    className="button ghost icon-only"
                    disabled={isBusy}
                    onClick={() => openNote(todo)}
                    title={todo.note ? "编辑备注" : "添加备注"}
                  >
                    <MessageSquare size={16} />
                  </button>
                  <button className="button ghost icon-only" aria-label="编辑" disabled={isBusy} onClick={() => openEdit(todo)}><Edit3 size={16} /></button>
                  <button className="button ghost icon-only" aria-label="删除" disabled={isBusy} onClick={() => void remove(todo)}>
                    {isDeleting ? <LoadingSpinner /> : <Trash2 size={16} />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

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
