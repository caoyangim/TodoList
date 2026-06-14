"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckSquare, ClipboardList, KeyRound, ListChecks, LogOut, Users } from "lucide-react";
import { Modal } from "@/components/modal";
import { CurrentUserDto } from "@/shared/types/models";

const links = [
  { href: "/todos", label: "Todo", icon: CheckSquare },
  { href: "/runs", label: "SOP 执行", icon: ListChecks },
  { href: "/templates", label: "SOP 模板", icon: ClipboardList },
];

export function AppNav({ user }: { user: CurrentUserDto }) {
  const pathname = usePathname();
  const router = useRouter();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me");
  }, []);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><CheckSquare size={18} /></span>
          TodoFlow
        </div>
        <nav className="nav-list">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              className={`nav-link ${pathname.startsWith(href) ? "active" : ""}`}
              href={href}
              key={href}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-account">
          <div className="nav-username">{user.username}</div>
          {user.role === "ADMIN" && (
            <Link className="nav-link" href="/admin/users">
              <Users size={17} />
              账号管理
            </Link>
          )}
          <Link
            className={`nav-link ${pathname.startsWith("/account") ? "active" : ""}`}
            href="/account"
          >
            <KeyRound size={17} />
            账号设置
          </Link>
          <button
            className="nav-link nav-button"
            type="button"
            onClick={() => setConfirmingLogout(true)}
          >
            <LogOut size={17} />
            退出登录
          </button>
        </div>
      </aside>

      {confirmingLogout && (
        <Modal
          title="确认退出登录？"
          onClose={() => !loggingOut && setConfirmingLogout(false)}
        >
          <div className="form-stack">
            <p className="modal-description">退出后需要重新登录才能继续使用 TodoFlow。</p>
            <div className="form-actions">
              <button
                className="button"
                disabled={loggingOut}
                type="button"
                onClick={() => setConfirmingLogout(false)}
              >
                取消
              </button>
              <button
                className="button primary"
                disabled={loggingOut}
                type="button"
                onClick={() => void logout()}
              >
                {loggingOut ? "正在退出..." : "确认退出"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
