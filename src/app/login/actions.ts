"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authenticate, createUser, startSession, endSession } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Auth runs as server actions rather than REST routes: the forms post directly,
 * so signing in costs no client JavaScript at all.
 */

export type FormState = { error?: string };

async function limitKey(): Promise<string> {
  const list = await headers();
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function signIn(_state: FormState, formData: FormData): Promise<FormState> {
  const limited = rateLimit("auth", await limitKey());
  if (!limited.ok) return { error: `Too many attempts. Try again in ${limited.retryAfterSeconds}s.` };

  const result = await authenticate(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if ("error" in result) return { error: result.error };

  await startSession(result.id);
  redirect("/");
}

export async function signUp(_state: FormState, formData: FormData): Promise<FormState> {
  const limited = rateLimit("auth", await limitKey());
  if (!limited.ok) return { error: `Too many attempts. Try again in ${limited.retryAfterSeconds}s.` };

  const result = await createUser({
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
    password: String(formData.get("password") ?? ""),
    timezone: String(formData.get("timezone") ?? "UTC"),
  });
  if ("error" in result) return { error: result.error };

  await startSession(result.id);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}
