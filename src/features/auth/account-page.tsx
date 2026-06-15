"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BuildInfo } from "@/components/build-info";
import { Modal } from "@/components/modal";
import { PasswordForm } from "@/features/auth/password-form";
import { apiRequest, getApiErrorMessage } from "@/shared/api-client";
import { CurrentUserDto } from "@/shared/types/models";

export function AccountPage({ user }: { user: CurrentUserDto }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteAccount() {
    setDeleting(true);
    setError("");
    try {
      await apiRequest("/api/auth/account", { method: "DELETE" });
      router.replace("/login?accountDeleted=1");
      router.refresh();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, "账号注销失败"));
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">账号设置</h1>
          <p className="page-subtitle">当前账号：{user.username}</p>
        </div>
      </header>

      <div className="account-settings">
        <PasswordForm forced={false} embedded />

        <section className="card danger-zone">
          <div>
            <h2 className="section-title">危险操作</h2>
            {user.role === "ADMIN" ? (
              <p className="modal-description">管理员账号用于维护系统，不能注销。</p>
            ) : (
              <p className="modal-description">
                注销后，账号、Todo、SOP、执行记录和附件都会被永久删除且无法恢复。
              </p>
            )}
          </div>
          {error && <div className="error-banner">{error}</div>}
          {user.role !== "ADMIN" && (
            <button
              className="button danger"
              type="button"
              onClick={() => setConfirming(true)}
            >
              永久注销账号
            </button>
          )}
        </section>
      </div>

      {confirming && (
        <Modal title="确认永久注销" onClose={() => !deleting && setConfirming(false)}>
          <div className="form-stack">
            <p className="modal-description">
              你的账号、Todo、SOP、执行记录和所有附件将被永久删除，此操作无法撤销。
            </p>
            <div className="form-actions">
              <button
                className="button"
                disabled={deleting}
                type="button"
                onClick={() => setConfirming(false)}
              >
                取消
              </button>
              <button
                className="button danger"
                disabled={deleting}
                type="button"
                onClick={() => void deleteAccount()}
              >
                {deleting ? "正在注销..." : "确认永久注销"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <BuildInfo />
    </>
  );
}
