"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest, getApiErrorMessage } from "@/shared/api-client";
import { AdminUserDto } from "@/shared/types/models";

export function UserAdminPage({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await apiRequest<AdminUserDto[]>("/api/admin/users"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "账号加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiRequest("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setUsername("");
      setPassword("");
      await load();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "创建账号失败"));
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(user: AdminUserDto) {
    const nextPassword = window.prompt(`为 ${user.username} 设置临时密码（至少 12 个字符）`);
    if (!nextPassword) return;
    try {
      await apiRequest(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: nextPassword }),
      });
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "密码重置失败");
    }
  }

  async function toggleUser(user: AdminUserDto) {
    const action = user.isActive ? "停用" : "启用";
    if (!window.confirm(`确定要${action}账号 ${user.username} 吗？`)) return;
    try {
      await apiRequest(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : `${action}失败`);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">账号管理</h1>
          <p className="page-subtitle">创建账号、重置临时密码或停用访问权限。</p>
        </div>
      </header>

      <form className="card form-stack account-create-form" onSubmit={createUser}>
        <h2 className="section-title">创建账号</h2>
        {error && <div className="error-banner">{error}</div>}
        <div className="form-row">
          <div className="field">
            <label htmlFor="newUsername">用户名</label>
            <input className="input" id="newUsername" value={username} onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="temporaryPassword">临时密码</label>
            <input className="input" id="temporaryPassword" type="password" maxLength={12} value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button className="button primary" disabled={submitting} type="submit">
            {submitting ? "正在创建..." : "创建账号"}
          </button>
        </div>
      </form>

      <div className="account-list">
        {users.map((user) => (
          <div className="card account-row" key={user.id}>
            <div>
              <div className="item-title">
                {user.username}
                {user.id === currentUserId && <span className="badge low">当前账号</span>}
              </div>
              <div className="item-meta">
                <span>{user.role === "ADMIN" ? "管理员" : "普通用户"}</span>
                <span>{user.isActive ? "已启用" : "已停用"}</span>
                {user.mustChangePassword && <span>等待首次改密</span>}
              </div>
            </div>
            <div className="account-actions">
              <button className="button" type="button" onClick={() => resetPassword(user)}>
                重置密码
              </button>
              <button
                className={`button ${user.isActive ? "danger" : ""}`}
                disabled={user.id === currentUserId}
                type="button"
                onClick={() => toggleUser(user)}
              >
                {user.isActive ? "停用" : "启用"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
