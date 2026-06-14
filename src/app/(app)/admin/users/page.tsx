import { redirect } from "next/navigation";
import { UserAdminPage } from "@/features/auth/user-admin-page";
import { getCurrentUser } from "@/server/auth/request";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/todos");
  return <UserAdminPage currentUserId={user.id} />;
}
