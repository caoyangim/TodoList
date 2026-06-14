import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { getCurrentUser } from "@/server/auth/request";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  return (
    <div className="app-shell">
      <AppNav user={user} />
      <main className="main-content">
        <div className="content-wrap">{children}</div>
      </main>
    </div>
  );
}
