"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Create / join forms. Both post to the REST endpoints and refresh the RSC tree. */
export function GroupActions() {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏆");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const [url, body] = tab === "create"
      ? ["/api/groups", { name, emoji }]
      : ["/api/groups/join", { invite_code: code }];

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);

    const payload = await response?.json().catch(() => null);
    setBusy(false);

    if (!response?.ok) {
      setError(payload?.error ?? "That didn't work. Try again.");
      return;
    }
    setName(""); setCode("");
    router.push(`/groups/${payload.data.id}`);
    router.refresh();
  }

  return (
    <div className="">
      <div className="mb-4 inline-flex rounded-lg border p-0.5">
        {(["create", "join"] as const).map((value) => (
          <button
            key={value}
            onClick={() => { setTab(value); setError(null); }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              tab === value ? "border-b border-current" : "text-muted hover:text-ink"
            }`}
          >
            {value === "create" ? "Create group" : "Join with code"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        {tab === "create" ? (
          <>
            <div className="w-16">
              <label htmlFor="group-emoji" className="text-xs font-medium text-muted">Icon</label>
              <input
                id="group-emoji" value={emoji} maxLength={4}
                onChange={(event) => setEmoji(event.target.value)}
                className="field mt-1 text-center"
              />
            </div>
            <div className="min-w-40 flex-1">
              <label htmlFor="group-name" className="text-xs font-medium text-muted">Group name</label>
              <input
                id="group-name" value={name} required minLength={2} maxLength={40}
                onChange={(event) => setName(event.target.value)}
                placeholder="VIT Grind" className="field mt-1"
              />
            </div>
          </>
        ) : (
          <div className="min-w-40 flex-1">
            <label htmlFor="invite-code" className="text-xs font-medium text-muted">Invite code</label>
            <input
              id="invite-code" value={code} required
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="A1B2C3D4" className="field mt-1 tracking-widest"
            />
          </div>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "Working…" : tab === "create" ? "Create" : "Join"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-warn">{error}</p>}
    </div>
  );
}

export function LeaveGroup({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function leave() {
    setBusy(true);
    await fetch(`/api/groups/${groupId}`, { method: "DELETE" }).catch(() => null);
    router.push("/groups");
    router.refresh();
  }

  if (!confirming) {
    return <button onClick={() => setConfirming(true)} className="hit btn btn-bare btn-sm">Leave group</button>;
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-muted">Sure?</span>
      <button onClick={leave} disabled={busy} className="hit btn btn-quiet btn-sm">Leave</button>
      <button onClick={() => setConfirming(false)} className="hit btn btn-bare btn-sm">Cancel</button>
    </span>
  );
}
