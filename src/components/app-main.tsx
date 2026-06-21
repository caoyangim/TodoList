"use client";

import { usePathname } from "next/navigation";

export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const layoutMode = pathname.startsWith("/notes") ? "workspace" : "standard";

  return (
    <main className="main-content" data-layout-mode={layoutMode}>
      <div className={layoutMode === "workspace" ? "workspace-wrap" : "content-wrap"}>
        {children}
      </div>
    </main>
  );
}
