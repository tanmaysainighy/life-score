import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { get, run } from "./db";
import type { SessionUser } from "./queries";

/**
 * Sessions are opaque random tokens stored server-side; the cookie carries no
 * user data and nothing signed by the client is ever trusted.
 */

const COOKIE = "lifescore_session";
const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export type AuthError = { error: string };

export async function createUser(input: {
  email: string; name: string; password: string; timezone: string;
}): Promise<SessionUser | AuthError> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
  if (name.length < 2 || name.length > 40) return { error: "Your name should be 2–40 characters." };
  if (input.password.length < 8) return { error: "Use at least 8 characters for your password." };
  if (await get(`SELECT 1 FROM users WHERE email = ?`, email)) {
    return { error: "An account with that email already exists." };
  }

  const id = `USR_${randomUUID()}`;
  const now = new Date().toISOString();

  await run(
    `INSERT INTO users (id, email, name, password_hash, timezone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, email, name, hashPassword(input.password), input.timezone || "UTC", now, now,
  );

  return { id, email, name, timezone: input.timezone || "UTC" };
}

export async function authenticate(email: string, password: string): Promise<SessionUser | AuthError> {
  const user = await get<SessionUser & { password_hash: string }>(
    `SELECT id, email, name, timezone, password_hash
       FROM users WHERE email = ?`,
    email.trim().toLowerCase(),
  );
  // Same message either way so the form can't be used to enumerate accounts.
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "Email or password is incorrect." };
  }
  const { password_hash: _hash, ...rest } = user;
  return rest;
}

export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);

  await run(
    `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
    token, userId, expires.toISOString(), now.toISOString(),
  );

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await run(`DELETE FROM sessions WHERE id = ?`, token);
  store.delete(COOKIE);
}

/** Current user, or null. One indexed lookup — cheap enough to call per render. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const user = await get<SessionUser & { expires_at: string }>(
    `SELECT u.id, u.email, u.name, u.timezone, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
    token,
  );
  if (!user) return null;
  if (Date.parse(user.expires_at) < Date.now()) {
    await run(`DELETE FROM sessions WHERE id = ?`, token);
    return null;
  }
  const { expires_at: _expires, ...rest } = user;
  return rest;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
