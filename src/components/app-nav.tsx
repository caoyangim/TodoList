"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckSquare, ClipboardList, FileText, KeyRound, LayoutDashboard, ListChecks, LogOut, PanelLeftClose, PanelLeftOpen, Users } from "lucide-react";
import { Modal } from "@/components/modal";
import { CurrentUserDto } from "@/shared/types/models";
import { useSidebarStore } from "@/shared/stores/sidebar-store";

const links = [
  { href: "/overview", label: "概览", icon: LayoutDashboard },
  { href: "/todos", label: "Todo", icon: CheckSquare },
  { href: "/notes", label: "Note", icon: FileText },
  { href: "/runs", label: "SOP 执行", icon: ListChecks },
  { href: "/templates", label: "SOP 模板", icon: ClipboardList },
];

export function AppNav({ user }: { user: CurrentUserDto }) {
  const pathname = usePathname();
  const router = useRouter();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { collapsed, toggle } = useSidebarStore();

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
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <span className="brand-mark"><CheckSquare size={18} /></span>
          <span className="brand-text">
            <span className="brand-title">TodoFlow</span>
            <span className="brand-subtitle">Daily Workspace</span>
          </span>
          <button
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            className="sidebar-toggle"
            type="button"
            onClick={toggle}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        <nav className="nav-list">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              className={`nav-link ${pathname.startsWith(href) ? "active" : ""}`}
              href={href}
              key={href}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} />
              <span className="nav-label">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="nav-account">
          <div className="nav-username">{user.username}</div>
          {user.role === "ADMIN" && (
            <Link className="nav-link" href="/admin/users" title={collapsed ? "账号管理" : undefined}>
              <Users size={17} />
              <span className="nav-label">账号管理</span>
            </Link>
          )}
          <Link
            className={`nav-link ${pathname.startsWith("/account") ? "active" : ""}`}
            href="/account"
            title={collapsed ? "账号设置" : undefined}
          >
            <KeyRound size={17} />
            <span className="nav-label">账号设置</span>
          </Link>
          <button
            className="nav-link nav-button"
            type="button"
            onClick={() => setConfirmingLogout(true)}
            title={collapsed ? "退出登录" : undefined}
          >
            <LogOut size={17} />
            <span className="nav-label">退出登录</span>
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
