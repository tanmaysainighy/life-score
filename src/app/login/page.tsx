import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { signIn } from "./actions";
import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Sign in · LifeScore" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <AuthShell title="Welcome back" subtitle="Pick up your streak where you left it.">
      <AuthForm mode="signin" action={signIn} />
    </AuthShell>
  );
}
