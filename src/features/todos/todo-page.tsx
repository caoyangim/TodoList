"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Edit3, MessageSquare, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/shared/api-client";
import { NoteContentDto, TodoDto, TodoPriority } from "@/shared/types/models";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner, LoadingState } from "@/components/loading";
import { Modal } from "@/components/modal";
import { RichNoteEditor } from "@/components/rich-note-editor";

type Status = "pending" | "completed" | "all";
type TodoForm = {
  title: string;
  description: string;
  priority: TodoPriority;
  dueAt: string;
};

const emptyForm: TodoForm = { title: "", description: "", priority: "MEDIUM", dueAt: "" };
const priorityText = { HIGH: "高优先级", MEDIUM: "中优先级", LOW: "低优先级" };

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
  const [status, setStatus] = useState<Status>("pending");
  const [todos, setTodos] = useState<TodoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodoDto | null | "new">(null);
  const [noteTodo, setNoteTodo] = useState<TodoDto | null>(null);
  const [noteValue, setNoteValue] = useState<NoteContentDto>({ html: "", images: [] });
  const [form, setForm] = useState<TodoForm>(emptyForm);
  const [error, setError] = useState("");

  const loadTodos = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      setTodos(await apiRequest<TodoDto[]>(`/api/todos?status=${status}`));
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
      priority: todo.priority,
      dueAt: toDateInput(todo.dueAt),
    });
    setEditing(todo);
    setError("");
  }

  function openNote(todo: TodoDto) {
    setNoteTodo(todo);
    setNoteValue(todo.note ?? { html: "", images: [] });
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
            imageIds: noteValue.images.map((image) => image.id),
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

  async function toggle(todo: TodoDto) {
    setBusyId(`toggle:${todo.id}`);
    try {
      await apiRequest(`/api/todos/${todo.id}/completion`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !todo.completedAt }),
      });
      await loadTodos(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
    } finally {
      setBusyId(null);
    }
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

      <div className="tabs" style={{ marginBottom: 14 }}>
        {(["pending", "completed", "all"] as Status[]).map((value) => (
          <button
            className={`tab ${status === value ? "active" : ""}`}
            disabled={loading}
            key={value}
            onClick={() => setStatus(value)}
          >
            {value === "pending" ? "未完成" : value === "completed" ? "已完成" : "全部"}
          </button>
        ))}
      </div>

      {error && !editing ? <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div> : null}
      {loading ? (
        <LoadingState label="正在加载 Todo..." />
      ) : todos.length === 0 ? (
        <EmptyState
          title={status === "completed" ? "还没有已完成的 Todo" : "今天从一件小事开始"}
          description={status === "completed" ? "完成的事项会出现在这里。" : "创建第一个 Todo，让计划开始流动。"}
          action={status !== "completed" ? <button className="button primary" onClick={openCreate}>新建 Todo</button> : null}
        />
      ) : (
        <div className="list">
          {todos.map((todo) => {
            const due = formatDueDate(todo.dueAt);
            const isToggling = busyId === `toggle:${todo.id}`;
            const isDeleting = busyId === `delete:${todo.id}`;
            const isBusy = isToggling || isDeleting;
            return (
              <article className="list-item" key={todo.id}>
                <button
                  aria-label={todo.completedAt ? "恢复 Todo" : "完成 Todo"}
                  className={`check-button ${todo.completedAt ? "checked" : ""}`}
                  disabled={isBusy}
                  onClick={() => void toggle(todo)}
                >
                  {isToggling ? (
                    <LoadingSpinner size={13} />
                  ) : todo.completedAt ? (
                    <Check size={13} />
                  ) : null}
                </button>
                <div className="list-item-main">
                  <h2 className={`item-title ${todo.completedAt ? "completed-text" : ""}`}>{todo.title}</h2>
                  {todo.description ? <p className="item-description">{todo.description}</p> : null}
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
                        {todo.note.images.length > 0 ? (
                          <div className="note-image-grid display">
                            {todo.note.images.map((image) => (
                              <a
                                href={image.url}
                                key={image.id}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img alt="Todo 备注图片" src={image.url} />
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="item-meta">
                    <span className={`badge ${todo.priority.toLowerCase()}`}>{priorityText[todo.priority]}</span>
                    {due ? <span style={{ color: due.overdue && !todo.completedAt ? "var(--danger)" : undefined }}>{due.overdue && !todo.completedAt ? "已逾期 · " : ""}{due.label}</span> : null}
                  </div>
                </div>
                <div className="item-actions">
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
                <label htmlFor="todo-priority">优先级</label>
                <select id="todo-priority" className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as TodoPriority })}>
                  <option value="HIGH">高</option>
                  <option value="MEDIUM">中</option>
                  <option value="LOW">低</option>
                </select>
              </div>
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
