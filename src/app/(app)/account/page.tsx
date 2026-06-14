import { redirect } from "next/navigation";
import { AccountPage } from "@/features/auth/account-page";
import { getCurrentUser } from "@/server/auth/request";

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <AccountPage user={user} />;
}
