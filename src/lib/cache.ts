/**
 * A tiny in-process TTL cache.
 *
 * Leaderboards are read far more often than they change, and a few seconds of
 * staleness is invisible. This is deliberately not Redis: one process, one map,
 * no extra infrastructure. Swap the two functions below if that ever changes.
 */

type Entry = { value: unknown; expires: number };
const store = new Map<string, Entry>();

export function cached<T>(key: string, ttlMs: number, compute: () => T): T {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  const value = compute();
  store.set(key, { value, expires: now + ttlMs });

  // Caching the promise itself means concurrent requests share one query. A
  // failed one must not stay cached, though, or the error outlives the outage.
  if (value instanceof Promise) {
    value.catch(() => {
      if (store.get(key)?.value === value) store.delete(key);
    });
  }

  // Opportunistic sweep; the map never holds more than a few hundred keys.
  if (store.size > 500) {
    for (const [k, entry] of store) if (entry.expires <= now) store.delete(k);
  }
  return value;
}

/** Drops every key beginning with `prefix` (call after a write). */
export function invalidate(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
