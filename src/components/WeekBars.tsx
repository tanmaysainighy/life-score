/**
 * The week as seven bars. Hand-drawn in CSS rather than pulled from a chart
 * library — it's seven numbers, and a library would ship more bytes than the
 * whole page while looking like everyone else's dashboard.
 *
 * Days still to come are drawn as a faint baseline so the week reads as a
 * fixed frame you are filling in, not a graph that stops halfway.
 */

type Day = { day: string; label: string; xp: number; isToday: boolean; isFuture: boolean };

export function WeekBars({
  days, peak, average, best,
}: {
  days: Day[]; peak: number; average: number; best: Day | null;
}) {
  const ceiling = Math.max(peak, 1);

  return (
    <div>
      {/* One label for the whole chart; the bars themselves are decoration to
          a screen reader, so their numbers are not announced twice. */}
      <div className="flex h-28 items-end gap-1.5" role="img"
           aria-label={`Daily XP this week. Average ${average} XP.${best ? ` Best day ${best.label} with ${best.xp} XP.` : ""}`}>
        {days.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-2" aria-hidden>
            <span className={`tabular text-[0.6875rem] ${d.xp > 0 ? "" : "opacity-0"}`}
                  style={{ color: d.isToday ? "var(--accent)" : "var(--faint)" }}>
              {d.xp}
            </span>
            <div
              className="grow-h w-full rounded-[2px]"
              style={{
                height: `${d.xp === 0 ? 2 : Math.max(6, (d.xp / ceiling) * 100)}%`,
                background: d.isToday ? "var(--accent)" : d.xp === 0 ? "var(--rule)" : "var(--ink)",
                opacity: d.isFuture ? .35 : d.xp === 0 ? 1 : d.isToday ? 1 : .82,
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-1.5" aria-hidden>
        {days.map((d) => (
          <span key={d.day} className="flex-1 text-center text-[0.6875rem]"
                style={{ color: d.isToday ? "var(--ink)" : "var(--faint)" }}>
            {d.label[0]}
          </span>
        ))}
      </div>

      {(average > 0 || best) && (
        <p className="t-meta mt-4">
          <span className="tabular">Average {average.toLocaleString()} XP</span>
          {best && <> · Best day {best.label}</>}
        </p>
      )}
    </div>
  );
}

/**
 * This week against last week. A percentage is only shown when there is a real
 * baseline to compare with — inventing one from a zero week would be a lie.
 */
export function SelfComparison({
  thisWeek, lastWeek, change, daysCompared,
}: { thisWeek: number; lastWeek: number; change: number | null; daysCompared: number }) {
  const ceiling = Math.max(thisWeek, lastWeek, 1);
  const sameStretch = daysCompared < 7;

  return (
    <div>
      <Row label="This week" value={thisWeek} width={(thisWeek / ceiling) * 100} strong />
      <Row
        label={sameStretch ? `Last week, first ${daysCompared} day${daysCompared === 1 ? "" : "s"}` : "Last week"}
        value={lastWeek}
        width={(lastWeek / ceiling) * 100}
      />

      {change !== null ? (
        <p className="tabular mt-4 text-sm">
          <span className="t-figure text-lg" style={{ color: change >= 0 ? "var(--gain)" : "var(--muted)" }}>
            {change >= 0 ? "+" : ""}{change}%
          </span>
          <span className="t-secondary ml-2">
            {sameStretch ? "at this point last week" : "on last week"}
          </span>
        </p>
      ) : (
        <p className="t-meta mt-4">Nothing to compare with yet — next week gets a number.</p>
      )}
    </div>
  );
}

function Row({ label, value, width, strong = false }: {
  label: string; value: number; width: number; strong?: boolean;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-sm ${strong ? "" : "t-secondary"}`}>{label}</span>
        <span className="tabular t-figure text-sm">{value.toLocaleString()}</span>
      </div>
      <div className="mt-1.5 h-1 w-full" style={{ background: "var(--rule)" }}>
        <div
          className="grow-w h-full"
          style={{ width: `${Math.max(width, value > 0 ? 3 : 0)}%`, background: strong ? "var(--accent)" : "var(--faint)" }}
        />
      </div>
    </div>
  );
}
