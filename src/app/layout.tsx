import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TodoFlow",
  description: "本地 Todo 与版本化 SOP 工具",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}
