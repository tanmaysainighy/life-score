"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { formatDuration } from "@/lib/duration";

/**
 * The product, really: a writing surface that turns a sentence into a score.
 *
 * Both steps are server-authoritative — `analyze` interprets and returns a
 * proposal, `confirm` re-derives the score and stores it. The client never
 * computes or submits XP; it only shows what came back.
 *
 * The reveal is staged deliberately: the sentence you wrote, then what it was
 * understood as, then the number. That sequence is the product's whole promise,
 * so it's worth the ~400ms it takes to read.
 */

type ActivityOption = {
  id: string; name: string; category: string; icon: string; base_xp_per_hour: number;
};

type Proposal = {
  status: "ready" | "confirm";
  activity: ActivityOption;
  durationMinutes: number;
  xp: number;
  confidence: number;
  method: string;
  note: string | null;
};

type MultiItem = {
  activity: ActivityOption;
  durationMinutes: number | null;
  xp: number | null;
  confidence: number;
  method: string;
  rawText: string;
};

type AnalyzeResponse =
  | Proposal
  | { status: "multi"; items: MultiItem[] }
  | { status: "need_duration"; activity: ActivityOption; message: string }
  | { status: "clarify"; message: string; durationMinutes?: number | null }
  | { status: "error"; message: string };

const QUICK_MINUTES = [15, 30, 45, 60, 90, 120, 180, 240];

export function Composer({ lifetimeXp }: { lifetimeXp: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [landed, setLanded] = useState<number | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [needsAck, setNeedsAck] = useState(false);
  const [picking, setPicking] = useState(false);
  const [parsedDuration, setParsedDuration] = useState<number | null>(null);
  const [batch, setBatch] = useState<MultiItem[] | null>(null);
  const [, startTransition] = useTransition();

  function reset() {
    setResult(null); setMessage(null); setNeedsAck(false);
    setPicking(false); setParsedDuration(null); setBatch(null);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void analyze();
    }
  }

  async function analyze() {
    const raw = text.trim();
    if (!raw || busy) return;
    setBusy(true); setMessage(null); setPicking(false);
    try {
      const response = await fetch("/api/activity/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: raw }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage({ tone: "error", text: payload.error ?? "Couldn't read that just now. Try again." });
        return;
      }
      const data = payload.data as AnalyzeResponse;
      if (data.status === "clarify" || data.status === "error") {
        setMessage({ tone: data.status === "error" ? "error" : "info", text: data.message });
        setResult(null);
        setParsedDuration(data.status === "clarify" ? data.durationMinutes ?? null : null);
        return;
      }
      if (data.status === "multi") {
        setBatch(data.items);
        setResult(null);
        return;
      }
      setResult(data);
    } catch {
      setMessage({ tone: "error", text: "Couldn't reach the server. Your text is still here." });
    } finally {
      setBusy(false);
    }
  }

  function propose(activity: ActivityOption, minutes: number): Proposal {
    return {
      status: "confirm", activity, durationMinutes: minutes,
      xp: Math.round((activity.base_xp_per_hour * minutes) / 60),
      confidence: 1, method: "manual", note: null,
    };
  }

  function pickActivity(activity: ActivityOption) {
    setPicking(false); setMessage(null);
    setResult(parsedDuration
      ? propose(activity, parsedDuration)
      : { status: "need_duration", activity, message: `${activity.name}. How long?` });
  }

  async function confirm(proposal: Proposal, acknowledged = false) {
    setBusy(true);
    try {
      const response = await fetch("/api/activity/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_id: proposal.activity.id,
          duration_minutes: proposal.durationMinutes,
          raw_text: text.trim(),
          method: proposal.method,
          confidence: proposal.confidence,
          acknowledged,
          previous_lifetime_xp: lifetimeXp,
        }),
      });
      const payload = await response.json();

      if (response.status === 409) {
        setMessage({ tone: "info", text: payload.error });
        setResult({ ...proposal, status: "confirm", note: payload.error });
        setNeedsAck(true);
        return;
      }
      if (!response.ok) {
        setMessage({ tone: "error", text: payload.error ?? "That didn't save." });
        return;
      }

      setLanded(payload.data.xp);
      if (payload.data.levelled_up) setLevelUp(payload.data.level);
      setText("");
      reset();
      startTransition(() => router.refresh());
      inputRef.current?.focus();
    } catch {
      setMessage({ tone: "error", text: "That didn't save. Your entry hasn't been lost — try again." });
    } finally {
      setBusy(false);
    }
  }

  /** Saves each entry in the batch, then refreshes once at the end. */
  async function confirmBatch(items: MultiItem[]) {
    setBusy(true);
    try {
      let earned = 0;
      let latestLevel: number | null = null;
      let levelled = false;

      for (const item of items) {
        if (item.durationMinutes === null) continue;
        const response = await fetch("/api/activity/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activity_id: item.activity.id,
            duration_minutes: item.durationMinutes,
            raw_text: item.rawText,
            method: item.method,
            confidence: item.confidence,
            acknowledged: true,
            previous_lifetime_xp: lifetimeXp,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          setMessage({ tone: "error", text: payload?.error ?? "One of those didn't save." });
          return;
        }
        const payload = await response.json();
        earned += payload.data.xp;
        latestLevel = payload.data.level;
        levelled ||= payload.data.levelled_up;
      }

      setLanded(earned);
      if (levelled && latestLevel !== null) setLevelUp(latestLevel);
      setText("");
      reset();
      startTransition(() => router.refresh());
      inputRef.current?.focus();
    } catch {
      setMessage({ tone: "error", text: "That didn't save. Your entry hasn't been lost — try again." });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (landed === null) return;
    const timer = setTimeout(() => setLanded(null), 900);
    return () => clearTimeout(timer);
  }, [landed]);

  useEffect(() => {
    if (levelUp === null) return;
    const timer = setTimeout(() => setLevelUp(null), 2400);
    return () => clearTimeout(timer);
  }, [levelUp]);

  const proposal = result?.status === "ready" || result?.status === "confirm" ? result : null;

  return (
    <div className="relative">
      <h2 className="t-section">What did you do?</h2>

      <div className="rule-b mt-3">
        <textarea
          id="composer"
          ref={inputRef}
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Worked on my AI agent for 4 hours…"
          maxLength={500}
          aria-label="Describe what you did"
          className="w-full resize-none bg-transparent pb-3 text-[1.375rem] leading-snug tracking-[-0.015em] outline-none placeholder:text-faint sm:text-[1.5rem]"
        />
      </div>

      <div className="mt-3 flex items-center gap-4">
        <button onClick={analyze} disabled={busy || text.trim().length < 2} className="btn btn-primary">
          {busy && !proposal ? "Understanding…" : "Log it"}
        </button>
        <span className="t-meta hidden sm:block">⌘↵</span>
      </div>

      {/* --- interpretation ------------------------------------------------ */}

      {message && (
        <div className="settle mt-6">
          <p className="text-[0.9375rem]" style={{ color: message.tone === "error" ? "var(--warn)" : "var(--muted)" }}>
            {message.text}
          </p>
          {message.tone === "info" && !picking && !proposal && (
            <button onClick={() => setPicking(true)} className="btn btn-quiet btn-sm mt-3">
              Choose it myself
            </button>
          )}
        </div>
      )}

      {picking && (
        <div className="settle mt-6">
          <ActivityPicker onSelect={pickActivity} />
          <button onClick={() => setPicking(false)} className="btn btn-bare btn-sm mt-2">Cancel</button>
        </div>
      )}

      {batch && (
        <MultiPreview
          items={batch}
          busy={busy}
          onChange={setBatch}
          onConfirm={() => confirmBatch(batch)}
          onCancel={reset}
        />
      )}

      {result?.status === "need_duration" && (
        <DurationStep
          activity={result.activity}
          message={result.message}
          onPick={(minutes) => setResult(propose(result.activity, minutes))}
        />
      )}

      {proposal && (
        <Interpretation
          proposal={proposal}
          busy={busy}
          needsAck={needsAck}
          onChange={setResult}
          onConfirm={() => confirm(proposal, needsAck)}
          onCancel={reset}
        />
      )}

      {landed !== null && (
        <div className="pointer-events-none absolute -top-2 left-0 right-0 flex justify-center" aria-live="polite">
          <span className="lift-away t-figure text-xl" style={{ color: "var(--accent)" }}>+{landed} XP</span>
        </div>
      )}

      {levelUp !== null && <LevelUp level={levelUp} />}
    </div>
  );
}

/**
 * What the sentence was understood as, and what it's worth. Shown as a small
 * ladder — activity, duration, then the number — so the reasoning is legible
 * before the user commits it.
 */
function Interpretation({
  proposal, busy, needsAck, onChange, onConfirm, onCancel,
}: {
  proposal: Proposal;
  busy: boolean;
  needsAck: boolean;
  onChange: (next: Proposal) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const xp = Math.round((proposal.activity.base_xp_per_hour * proposal.durationMinutes) / 60);
  const hours = proposal.durationMinutes / 60;
  const hoursLabel = Number.isInteger(hours) ? hours : Number(hours.toFixed(2));

  return (
    <div className="settle mt-8">
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[1.0625rem]">
            <span aria-hidden>{proposal.activity.icon}</span>
            <span className="truncate">{proposal.activity.name}</span>
          </p>
          <p className="tabular t-secondary mt-1 text-sm">
            {formatDuration(proposal.durationMinutes)} · {hoursLabel} × {proposal.activity.base_xp_per_hour} XP/h
          </p>
        </div>

        <p className="t-figure shrink-0 text-4xl" style={{ color: "var(--accent)" }}>+{xp}</p>
      </div>

      {proposal.status === "confirm" && proposal.method !== "manual" && (
        <p className="t-secondary mt-3 text-sm">
          {proposal.note ?? "Check this is what you meant."}
        </p>
      )}

      {editing && (
        <div className="mt-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="edit-minutes" className="t-meta">Minutes</label>
            <input
              id="edit-minutes" type="number" min={1} max={1440}
              value={proposal.durationMinutes}
              onChange={(event) => onChange({
                ...proposal,
                durationMinutes: Math.max(1, Math.min(1440, Number(event.target.value) || 1)),
              })}
              className="field max-w-24 text-sm"
            />
          </div>
          <ActivityPicker onSelect={(activity) => {
            onChange({ ...proposal, activity, method: "manual", confidence: 1 });
            setEditing(false);
          }} />
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button onClick={onConfirm} disabled={busy} className="btn btn-primary">
          {busy ? "Saving…" : needsAck ? "Log it anyway" : "Confirm"}
        </button>
        <button onClick={() => setEditing((v) => !v)} disabled={busy} className="hit btn btn-bare btn-sm">
          {editing ? "Done" : "Change"}
        </button>
        <button onClick={onCancel} disabled={busy} className="hit btn btn-bare btn-sm">Discard</button>
      </div>
    </div>
  );
}

/**
 * Two or more activities pulled out of one sentence.
 *
 * Anything without a stated duration is shown as a gap to fill rather than
 * guessed at, and can be dropped entirely if the split got it wrong.
 */
function MultiPreview({
  items, busy, onChange, onConfirm, onCancel,
}: {
  items: MultiItem[];
  busy: boolean;
  onChange: (next: MultiItem[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const setMinutes = (index: number, minutes: number | null) =>
    onChange(items.map((item, i) => i === index ? {
      ...item,
      durationMinutes: minutes,
      xp: minutes === null ? null : Math.round((item.activity.base_xp_per_hour * minutes) / 60),
    } : item));

  const total = items.reduce((sum, item) => sum + (item.xp ?? 0), 0);
  const missing = items.filter((item) => item.durationMinutes === null).length;

  return (
    <div className="settle mt-8">
      <p className="t-section">{items.length} activities</p>

      <ul className="mt-3">
        {items.map((item, index) => (
          <li key={`${item.activity.id}-${index}`} className="rule-b py-3 last:border-b-0">
            <div className="flex items-baseline justify-between gap-4">
              <p className="flex min-w-0 items-center gap-2 text-[0.9375rem]">
                <span aria-hidden>{item.activity.icon}</span>
                <span className="truncate">{item.activity.name}</span>
              </p>
              {item.xp === null
                ? <span className="t-meta shrink-0">needs a duration</span>
                : <span className="t-figure shrink-0" style={{ color: "var(--accent)" }}>+{item.xp}</span>}
            </div>

            {item.durationMinutes === null ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_MINUTES.map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => setMinutes(index, minutes)}
                    className="hit btn btn-quiet btn-sm"
                  >
                    {formatDuration(minutes)}
                  </button>
                ))}
                <button
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                  className="hit btn btn-bare btn-sm"
                >
                  Not this
                </button>
              </div>
            ) : (
              <p className="tabular t-meta mt-1">
                {formatDuration(item.durationMinutes)} · {item.activity.base_xp_per_hour} XP/h
                <button
                  onClick={() => setMinutes(index, null)}
                  className="hit btn btn-bare btn-sm ml-1"
                >
                  Change
                </button>
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-center gap-2">
        <button onClick={onConfirm} disabled={busy || missing > 0} className="btn btn-primary">
          {busy ? "Saving…" : `Log all · +${total} XP`}
        </button>
        <button onClick={onCancel} disabled={busy} className="hit btn btn-bare btn-sm">Discard</button>
      </div>

      {missing > 0 && (
        <p className="t-meta mt-2">
          {missing === 1 ? "One entry still needs" : `${missing} entries still need`} a duration.
        </p>
      )}
    </div>
  );
}

function DurationStep({
  activity, message, onPick,
}: { activity: ActivityOption; message: string; onPick: (minutes: number) => void }) {
  const [custom, setCustom] = useState("");
  return (
    <div className="settle mt-8">
      <p className="text-[0.9375rem]">{message}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {QUICK_MINUTES.map((minutes) => (
          <button key={minutes} onClick={() => onPick(minutes)} className="hit btn btn-quiet btn-sm">
            {formatDuration(minutes)}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const minutes = Number(custom);
          if (Number.isFinite(minutes) && minutes >= 1 && minutes <= 1440) onPick(Math.round(minutes));
        }}
      >
        <input
          type="number" min={1} max={1440} value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="Minutes"
          className="field max-w-24 text-sm"
          aria-label={`Minutes spent on ${activity.name}`}
        />
        <button type="submit" className="hit btn btn-bare btn-sm">Use</button>
      </form>
    </div>
  );
}

/** Fetched on first open only — never part of the dashboard payload. */
function ActivityPicker({ onSelect }: { onSelect: (activity: ActivityOption) => void }) {
  const [options, setOptions] = useState<ActivityOption[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/activities")
      .then((response) => response.json())
      .then((payload) => setOptions(payload.data?.activities ?? []))
      .catch(() => setOptions([]));
  }, []);

  const filtered = (options ?? [])
    .filter((option) => option.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 30);

  return (
    <div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search activities"
        aria-label="Search activities"
        className="field text-sm"
        autoFocus
      />
      <ul className="mt-1 max-h-56 overflow-y-auto">
        {options === null && <li className="py-3"><span className="t-meta">Loading…</span></li>}
        {filtered.map((option) => (
          <li key={option.id}>
            <button
              onClick={() => onSelect(option)}
              className="tap rule-b flex w-full items-baseline gap-2.5 py-2.5 text-left"
            >
              <span aria-hidden className="text-sm">{option.icon}</span>
              <span className="flex-1 truncate text-sm">{option.name}</span>
              <span className="tabular t-meta">{option.base_xp_per_hour}/h</span>
            </button>
          </li>
        ))}
        {options !== null && filtered.length === 0 && (
          <li className="py-3"><span className="t-meta">Nothing matches that.</span></li>
        )}
      </ul>
    </div>
  );
}

function LevelUp({ level }: { level: number }) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "color-mix(in srgb, var(--bg) 70%, transparent)" }}
      role="status"
    >
      <div className="settle text-center">
        <p className="t-section">Level up</p>
        <p className="t-display mt-2" style={{ color: "var(--accent)" }}>{level}</p>
      </div>
    </div>
  );
}
