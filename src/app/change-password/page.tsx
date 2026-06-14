import { redirect } from "next/navigation";
import { PasswordForm } from "@/features/auth/password-form";
import { getCurrentUser } from "@/server/auth/request";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <main className="auth-page"><PasswordForm forced={user.mustChangePassword} /></main>;
}
