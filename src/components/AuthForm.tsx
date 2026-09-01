"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/login/actions";

/** Shared sign-in / sign-up form. The only client JS is the pending state. */
export function AuthForm({
  mode, action,
}: {
  mode: "signin" | "signup";
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const timezoneRef = useRef<HTMLInputElement>(null);

  // Captured client-side so every day boundary is the user's own.
  useEffect(() => {
    if (timezoneRef.current) {
      timezoneRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    }
  }, []);

  const isSignUp = mode === "signup";

  return (
    <form action={formAction} className="space-y-3">
      <input ref={timezoneRef} type="hidden" name="timezone" defaultValue="UTC" />

      {isSignUp && (
        <div>
          <label htmlFor="name" className="text-xs font-medium text-muted">Name</label>
          <input id="name" name="name" required autoComplete="name" className="field mt-1" placeholder="Tanmay" />
        </div>
      )}

      <div>
        <label htmlFor="email" className="text-xs font-medium text-muted">Email</label>
        <input
          id="email" name="email" type="email" required
          autoComplete="email" className="field mt-1" placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="text-xs font-medium text-muted">Password</label>
        <input
          id="password" name="password" type="password" required minLength={8}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          className="field mt-1" placeholder={isSignUp ? "At least 8 characters" : "••••••••"}
        />
      </div>

      {state.error && <p className="text-sm text-warn">{state.error}</p>}

      <Submit label={isSignUp ? "Create account" : "Sign in"} />

      <p className="pt-1 text-center text-sm text-muted">
        {isSignUp ? "Already have an account? " : "New here? "}
        <Link href={isSignUp ? "/login" : "/signup"} className="font-medium underline underline-offset-2 hover:text-ink">
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full py-2.5">
      {pending ? "One moment…" : label}
    </button>
  );
}
