import { redirect } from "next/navigation";
import { AppMain } from "@/components/app-main";
import { AppNav } from "@/components/app-nav";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/server/auth/request";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  return (
    <AppShell>
      <AppNav user={user} />
      <AppMain>{children}</AppMain>
    </AppShell>
  );
}
