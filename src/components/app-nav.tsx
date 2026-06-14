"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CheckSquare, ClipboardList, KeyRound, ListChecks, LogOut, Users } from "lucide-react";
import { CurrentUserDto } from "@/shared/types/models";

const links = [
  { href: "/todos", label: "Todo", icon: CheckSquare },
  { href: "/templates", label: "SOP 模板", icon: ClipboardList },
  { href: "/runs", label: "SOP 执行", icon: ListChecks },
];

export function AppNav({ user }: { user: CurrentUserDto }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    void fetch("/api/auth/me");
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
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
        <Link className="nav-link" href="/change-password">
          <KeyRound size={17} />
          修改密码
        </Link>
        <button className="nav-link nav-button" type="button" onClick={logout}>
          <LogOut size={17} />
          退出登录
        </button>
      </div>
    </aside>
  );
}
