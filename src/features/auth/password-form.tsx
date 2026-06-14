"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, getApiErrorMessage } from "@/shared/api-client";

export function PasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiRequest("/api/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      router.replace("/login");
      router.refresh();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "密码修改失败"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-card form-stack" onSubmit={submit}>
      <div>
        <h1 className="auth-title">{forced ? "设置新密码" : "修改密码"}</h1>
        <p className="page-subtitle">
          {forced ? "首次登录需要替换管理员提供的临时密码。" : "修改后所有设备都需要重新登录。"}
        </p>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label htmlFor="currentPassword">当前密码</label>
        <input className="input" id="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="newPassword">新密码</label>
        <input className="input" id="newPassword" type="password" autoComplete="new-password" maxLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        <span className="field-hint">密码长度为 12 个字符</span>
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">确认新密码</label>
        <input className="input" id="confirmPassword" type="password" autoComplete="new-password" maxLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
      </div>
      <button className="button primary" disabled={submitting} type="submit">
        {submitting ? "正在保存..." : "保存并重新登录"}
      </button>
    </form>
  );
}
