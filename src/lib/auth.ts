import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scrypt, timingSafeEqual, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { get, run } from "./db";
import type { SessionUser } from "./queries";

/**
 * Sessions are opaque random tokens stored server-side; the cookie carries no
 * user data and nothing signed by the client is ever trusted.
 */

const COOKIE = "lifescore_session";
const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;
const MAX_PASSWORD_LENGTH = 200;

/**
 * scrypt takes ~40 ms. The synchronous form stalls Node's single thread for
 * that long on every login and signup, so use the threadpool instead.
 */
const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

/**
 * Hashed against when no account matches, so an unknown email costs the same
 * work as a known one. Without it, returning early on a missing user makes the
 * response ~40 ms faster and turns the login form into an account oracle
 * regardless of the error message being identical.
 *
 * Built once, on first use rather than at import, so nothing blocks at boot.
 */
let dummyHash: Promise<string> | null = null;
function decoyHash(): Promise<string> {
  return (dummyHash ??= hashPassword(randomBytes(24).toString("hex")));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, SCRYPT_KEYLEN)).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = await scryptAsync(password, salt, SCRYPT_KEYLEN);
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
  if (input.password.length > MAX_PASSWORD_LENGTH) {
    return { error: `Passwords can be at most ${MAX_PASSWORD_LENGTH} characters.` };
  }
  if (await get(`SELECT 1 FROM users WHERE email = ?`, email)) {
    return { error: "An account with that email already exists." };
  }

  const id = `USR_${randomUUID()}`;
  const now = new Date().toISOString();

  await run(
    `INSERT INTO users (id, email, name, password_hash, timezone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, email, name, await hashPassword(input.password), input.timezone || "UTC", now, now,
  );

  return { id, email, name, timezone: input.timezone || "UTC" };
}

export async function authenticate(email: string, password: string): Promise<SessionUser | AuthError> {
  const user = await get<SessionUser & { password_hash: string }>(
    `SELECT id, email, name, timezone, password_hash
       FROM users WHERE email = ?`,
    email.trim().toLowerCase(),
  );
  // Same message AND the same work either way: an unknown email is hashed
  // against a dummy so the response time does not reveal whether the account
  // exists. Returning early here was a timing oracle worth ~40 ms.
  const matches = await verifyPassword(password, user?.password_hash ?? (await decoyHash()));
  if (!user || !matches) {
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
