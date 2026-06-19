"use client";

import { useSidebarStore } from "@/shared/stores/sidebar-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useSidebarStore((s) => s.collapsed);

  return (
    <div className="app-shell" data-sidebar-collapsed={collapsed ? "true" : "false"}>
      {children}
    </div>
  );
}
