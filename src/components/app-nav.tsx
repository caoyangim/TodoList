"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, ClipboardList, ListChecks } from "lucide-react";

const links = [
  { href: "/todos", label: "Todo", icon: CheckSquare },
  { href: "/templates", label: "SOP 模板", icon: ClipboardList },
  { href: "/runs", label: "SOP 执行", icon: ListChecks },
];

export function AppNav() {
  const pathname = usePathname();
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
    </aside>
  );
}
