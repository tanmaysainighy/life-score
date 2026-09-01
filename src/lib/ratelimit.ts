/**
 * Fixed-window rate limiting, per user per bucket. In-process, which is right
 * for one server; move the map to Redis if this ever runs multi-instance.
 *
 * The AI endpoint is the expensive one, so it gets the tightest budget.
 */

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

export const LIMITS = {
  analyze: { max: 20, windowMs: 60_000 },   // LLM-backed
  write: { max: 60, windowMs: 60_000 },     // creating/editing entries
  auth: { max: 10, windowMs: 300_000 },     // login/signup attempts
} as const;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function rateLimit(bucket: keyof typeof LIMITS, key: string): RateLimitResult {
  const { max, windowMs } = LIMITS[bucket];
  const id = `${bucket}:${key}`;
  const now = Date.now();
  const current = windows.get(id);

  if (!current || current.resetAt <= now) {
    windows.set(id, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) {
      for (const [k, window] of windows) if (window.resetAt <= now) windows.delete(k);
    }
    return { ok: true };
  }

  if (current.count >= max) {
    return { ok: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }
  current.count += 1;
  return { ok: true };
}
