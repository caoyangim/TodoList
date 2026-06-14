"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/shared/api-client";
import { CurrentUserDto } from "@/shared/types/models";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const user = await apiRequest<CurrentUserDto>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
        redirectOnAuthError: false,
      });
      const next = searchParams.get("next");
      router.replace(user.mustChangePassword ? "/change-password" : next?.startsWith("/") ? next : "/todos");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-card form-stack" onSubmit={submit}>
      <div>
        <div className="auth-brand">TodoFlow</div>
        <h1 className="auth-title">登录</h1>
        <p className="page-subtitle">使用管理员为你创建的账号。</p>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label htmlFor="username">用户名</label>
        <input
          autoComplete="username"
          className="input"
          id="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">密码</label>
        <input
          autoComplete="current-password"
          className="input"
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <button className="button primary" disabled={submitting} type="submit">
        {submitting ? "正在登录..." : "登录"}
      </button>
    </form>
  );
}
