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

/**
 * The client controls the *first* entry in X-Forwarded-For, so keying the rate
 * limit on it let a caller mint a fresh bucket per request and never trip the
 * limit at all. The last entry is the one appended by the proxy closest to us
 * and is the only part a client cannot forge.
 *
 * TRUSTED_PROXY_HEADER names a platform header to prefer where one exists
 * (Vercel sets x-real-ip). Absent any header, everything shares one bucket:
 * coarse, but it fails closed rather than open.
 */
async function clientKey(): Promise<string> {
  const list = await headers();

  const trusted = process.env.TRUSTED_PROXY_HEADER;
  if (trusted) {
    const value = list.get(trusted)?.trim();
    if (value) return value;
  }

  const realIp = list.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = list.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }

  return "unknown";
}

/**
 * Credential stuffing spreads attempts across many addresses against one
 * account, which an address-keyed limit never sees. Limiting the target email
 * as well bounds that, independently of where the requests come from.
 */
function emailKey(email: string): string {
  return `email:${email.trim().toLowerCase().slice(0, 200)}`;
}

export async function signIn(_state: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");

  for (const key of [await clientKey(), emailKey(email)]) {
    const limited = rateLimit("auth", key);
    if (!limited.ok) return { error: `Too many attempts. Try again in ${limited.retryAfterSeconds}s.` };
  }

  const result = await authenticate(email, String(formData.get("password") ?? ""));
  if ("error" in result) return { error: result.error };

  await startSession(result.id);
  redirect("/");
}

export async function signUp(_state: FormState, formData: FormData): Promise<FormState> {
  const limited = rateLimit("auth", await clientKey());
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
