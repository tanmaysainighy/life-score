import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { signUp } from "../login/actions";
import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Create account · LifeScore" };

export default async function SignupPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <AuthShell title="Start scoring" subtitle="Write what you did. We'll handle the rest.">
      <AuthForm mode="signup" action={signUp} />
    </AuthShell>
  );
}
