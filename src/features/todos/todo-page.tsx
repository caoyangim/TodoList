"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Edit3, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/shared/api-client";
import { TodoDto, TodoPriority } from "@/shared/types/models";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";

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
  const [form, setForm] = useState<TodoForm>(emptyForm);
  const [error, setError] = useState("");

  const loadTodos = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTodos(await apiRequest<TodoDto[]>(`/api/todos?status=${status}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Todo 加载失败");
    } finally {
      setLoading(false);
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
      await loadTodos();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存失败");
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(todo: TodoDto) {
    setBusyId(todo.id);
    try {
      await apiRequest(`/api/todos/${todo.id}/completion`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !todo.completedAt }),
      });
      await loadTodos();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(todo: TodoDto) {
    if (!window.confirm(`确定删除“${todo.title}”吗？`)) return;
    setBusyId(todo.id);
    try {
      await apiRequest(`/api/todos/${todo.id}`, { method: "DELETE" });
      await loadTodos();
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
            key={value}
            onClick={() => setStatus(value)}
          >
            {value === "pending" ? "未完成" : value === "completed" ? "已完成" : "全部"}
          </button>
        ))}
      </div>

      {error && !editing ? <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div> : null}
      {loading ? (
        <div className="loading">正在加载...</div>
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
            return (
              <article className="list-item" key={todo.id}>
                <button
                  aria-label={todo.completedAt ? "恢复 Todo" : "完成 Todo"}
                  className={`check-button ${todo.completedAt ? "checked" : ""}`}
                  disabled={busyId === todo.id}
                  onClick={() => void toggle(todo)}
                >
                  {todo.completedAt ? <Check size={13} /> : null}
                </button>
                <div className="list-item-main">
                  <h2 className={`item-title ${todo.completedAt ? "completed-text" : ""}`}>{todo.title}</h2>
                  {todo.description ? <p className="item-description">{todo.description}</p> : null}
                  <div className="item-meta">
                    <span className={`badge ${todo.priority.toLowerCase()}`}>{priorityText[todo.priority]}</span>
                    {due ? <span style={{ color: due.overdue && !todo.completedAt ? "var(--danger)" : undefined }}>{due.overdue && !todo.completedAt ? "已逾期 · " : ""}{due.label}</span> : null}
                  </div>
                </div>
                <div className="item-actions">
                  <button className="button ghost icon-only" aria-label="编辑" onClick={() => openEdit(todo)}><Edit3 size={16} /></button>
                  <button className="button ghost icon-only" aria-label="删除" disabled={busyId === todo.id} onClick={() => void remove(todo)}><Trash2 size={16} /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing ? (
        <Modal title={editing === "new" ? "新建 Todo" : "编辑 Todo"} onClose={() => setEditing(null)}>
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
              <button className="button" type="button" onClick={() => setEditing(null)}>取消</button>
              <button className="button primary" disabled={busyId === "form"} type="submit">{busyId === "form" ? "保存中..." : "保存"}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
