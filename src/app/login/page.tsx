import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentUser } from "@/server/auth/request";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/todos");
  return <main className="auth-page"><LoginForm /></main>;
}
