import { formatDuration, formatDurationLong } from "@/lib/duration";
import { localTime } from "@/lib/dates";
import { EntryActions } from "./EntryActions";

/**
 * The day's activity as a timeline, not a stack of cards.
 *
 * Rows are server-rendered and the score explanation opens with a native
 * <details>, so scanning and expanding your history costs no JavaScript at all.
 * Only the edit/delete controls inside an opened row are interactive.
 */

export type TimelineEntry = {
  id: string;
  raw_text: string;
  duration_minutes: number;
  xp: number;
  base_xp_per_hour: number;
  scoring_version: number;
  created_at: string;
  activity_name: string;
  activity_icon: string;
};

export function Timeline({ entries, timezone }: { entries: TimelineEntry[]; timezone: string }) {
  return (
    <ul>
      {entries.map((entry, index) => (
        <li key={entry.id} className="enter rule-b last:border-b-0" style={{ "--i": index } as React.CSSProperties}>
          <details>
            <summary className="tap group flex items-baseline gap-4 py-3.5">
              <span className="tabular t-meta w-11 shrink-0">{localTime(new Date(entry.created_at), timezone)}</span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span aria-hidden className="text-[0.9375rem] leading-none">{entry.activity_icon}</span>
                  <span className="truncate text-[0.9375rem]">{entry.activity_name}</span>
                  <svg className="chev mt-px shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
                       width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                    <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="t-meta mt-0.5 block truncate">{formatDuration(entry.duration_minutes)} · {entry.raw_text}</span>
              </span>

              <span className="t-figure shrink-0 text-[0.9375rem]" style={{ color: "var(--accent)" }}>
                +{entry.xp}
              </span>
            </summary>

            <div className="settle pb-4 pl-15 pr-1">
              <ScoreExplanation entry={entry} />
              <EntryActions id={entry.id} durationMinutes={entry.duration_minutes} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

/**
 * How the number was reached, shown as the arithmetic itself. Every score is
 * explainable — this is the trust surface, so it states the rule, not a claim.
 */
function ScoreExplanation({ entry }: { entry: TimelineEntry }) {
  return (
    <div className="max-w-xs">
      <p className="t-section">{entry.activity_name}</p>
      <p className="tabular t-secondary mt-1.5 text-sm">{entry.base_xp_per_hour} XP / hour</p>

      <div className="tabular mt-3 inline-block text-sm">
        <div className="pb-1 text-right">
          {formatDurationLong(entry.duration_minutes)} × {entry.base_xp_per_hour}
        </div>
        <div className="rule-t pt-1 text-right">
          <span className="t-figure text-base">{entry.xp}</span> XP
        </div>
      </div>

      <p className="t-meta mt-3">Scoring rule v{entry.scoring_version}</p>
    </div>
  );
}
