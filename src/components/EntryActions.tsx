"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Edit and delete for one entry. The smallest possible interactive island —
 * the row, the timestamp and the score explanation around it are all static
 * server-rendered HTML.
 *
 * Editing re-scores on the server through the same engine; nothing here
 * recalculates XP.
 */
export function EntryActions({ id, durationMinutes }: { id: string; durationMinutes: number }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(durationMinutes);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(init: RequestInit) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/activity/${id}`, init).catch(() => null);
    if (!response?.ok) {
      const payload = await response?.json().catch(() => null);
      setError(payload?.error ?? "That didn't save. Try again.");
      setBusy(false);
      return;
    }
    setEditing(false);
    setBusy(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`minutes-${id}`}>Duration in minutes</label>
        <input
          id={`minutes-${id}`}
          type="number" min={1} max={1440} value={minutes}
          onChange={(event) => setMinutes(Math.max(1, Math.min(1440, Number(event.target.value) || 1)))}
          className="field max-w-24 text-sm"
        />
        <span className="t-meta">minutes</span>
        <button
          onClick={() => send({
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ duration_minutes: minutes }),
          })}
          disabled={busy}
          className="hit btn btn-primary btn-sm"
        >
          {busy ? "Saving" : "Save"}
        </button>
        <button onClick={() => { setEditing(false); setMinutes(durationMinutes); }} className="hit btn btn-bare btn-sm">
          Cancel
        </button>
        {error && <p className="w-full text-xs" style={{ color: "var(--warn)" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-1">
      <button onClick={() => setEditing(true)} className="hit btn btn-bare btn-sm">Edit</button>
      <button onClick={() => send({ method: "DELETE" })} disabled={busy} className="hit btn btn-bare btn-sm">Delete</button>
      {error && <p className="text-xs" style={{ color: "var(--warn)" }}>{error}</p>}
    </div>
  );
}
