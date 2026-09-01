"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DailyTarget } from "@/lib/queries";
import { formatDuration } from "@/lib/duration";

/**
 * The things you've committed to doing every day, and how far along you are.
 *
 * Progress is never entered here — it comes from the entries you already logged,
 * matched by activity. So a target is a lens on your day rather than a second
 * checklist to keep in sync, and there is no way to tick one off without having
 * actually done the thing.
 */
export function DailyTargets({ targets }: { targets: DailyTarget[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function send(method: "POST" | "DELETE", body: object): Promise<boolean> {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/targets", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);

    setBusy(false);
    if (!response?.ok) {
      const payload = await response?.json().catch(() => null);
      setError(payload?.error ?? "That didn't save. Try again.");
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    if (await send("POST", { text })) {
      setText("");
      setAdding(false);
    }
  }

  return (
    <div>
      {targets.length > 0 && (
        <ul className="flex flex-col gap-3">
          {targets.map((target) => (
            <li key={target.activity_id}>
              <div className="flex items-baseline gap-3">
                <span aria-hidden className="text-sm">{target.met ? "✓" : target.icon}</span>
                <span
                  className="min-w-0 flex-1 truncate text-sm"
                  style={target.met ? { color: "var(--muted)" } : undefined}
                >
                  {target.name}
                </span>

                <span
                  className="tabular text-[0.8125rem]"
                  style={{ color: target.met ? "var(--gain)" : "var(--faint)" }}
                >
                  {target.target_minutes === null
                    ? (target.met ? "done" : "not yet")
                    : `${formatDuration(target.done_minutes)} / ${formatDuration(target.target_minutes)}`}
                </span>

                <button
                  onClick={() => send("DELETE", { activity_id: target.activity_id })}
                  disabled={busy}
                  aria-label={`Remove ${target.name} target`}
                  className="hit tap t-meta -mr-1 hover:text-ink"
                >
                  ×
                </button>
              </div>

              {target.target_minutes !== null && (
                <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full" style={{ background: "var(--rule)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (target.done_minutes / target.target_minutes) * 100)}%`,
                      background: target.met ? "var(--gain)" : "var(--ink)",
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={add} className={targets.length > 0 ? "mt-4" : ""}>
          <label className="sr-only" htmlFor="new-target">What do you want to do every day?</label>
          <input
            id="new-target"
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && setAdding(false)}
            placeholder="Read for 30 minutes"
            maxLength={200}
            className="field w-full text-sm"
          />
          <div className="mt-2.5 flex items-center gap-1">
            <button type="submit" disabled={busy || !text.trim()} className="hit btn btn-primary btn-sm">
              {busy ? "Saving" : "Add"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(null); }} className="hit btn btn-bare btn-sm">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {targets.length === 0 && (
            <p className="t-secondary text-sm">
              Nothing set yet. Name something you want to do every day and it&rsquo;ll
              track itself from what you log.
            </p>
          )}
          <button
            onClick={() => setAdding(true)}
            className={`hit tap t-meta hover:text-ink ${targets.length === 0 ? "mt-3" : "mt-4"}`}
          >
            + Add a target
          </button>
        </>
      )}

      {error && <p className="mt-2 text-xs" style={{ color: "var(--warn)" }}>{error}</p>}
    </div>
  );
}
