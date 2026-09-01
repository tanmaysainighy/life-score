import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getWeekReview } from "@/lib/queries";
import { localDay, startOfWeek, addDays } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { Timeline } from "@/components/Timeline";
import { Section } from "@/components/Section";

export const metadata = { title: "History · LifeScore" };
export const dynamic = "force-dynamic";

/**
 * History, a week at a time.
 *
 * Paging by "50 entries" answered nothing; a week is the unit people actually
 * think in, so moving back a week is a review rather than a scroll. The rollup
 * above the timeline exists because "Gym x4" is the thing you want to know and
 * a list of individual entries makes you count them yourself.
 */
export default async function LogPage({
  searchParams,
}: { searchParams: Promise<{ week?: string }> }) {
  const user = await requireUser();
  const today = localDay(new Date(), user.timezone);
  const thisWeek = startOfWeek(today);

  const requested = (await searchParams).week;
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(requested ?? "") ? startOfWeek(requested!) : thisWeek;

  const review = await getWeekReview(user.id, weekStart);
  const isCurrent = weekStart === thisWeek;
  const previous = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="enter flex items-baseline justify-between gap-4">
        <h1 className="t-heading">{isCurrent ? "This week" : weekLabel(weekStart, review.weekEnd)}</h1>
        <nav className="flex items-center gap-1" aria-label="Change week">
          <Link href={`/log?week=${previous}`} className="hit btn btn-bare btn-sm">Earlier</Link>
          {!isCurrent && (
            <Link href={next > thisWeek ? "/log" : `/log?week=${next}`} className="hit btn btn-bare btn-sm">
              Later
            </Link>
          )}
        </nav>
      </div>

      {!isCurrent && <p className="t-meta enter mt-1">{weekLabel(weekStart, review.weekEnd)}</p>}

      {review.entries === 0 ? (
        <p className="t-secondary enter mt-10 text-[0.9375rem]">
          Nothing logged this week.{" "}
          {isCurrent && <Link href="/" className="underline underline-offset-2 hover:text-ink">Start now</Link>}
        </p>
      ) : (
        <>
          {/* --- the week in numbers ------------------------------------- */}
          <div className="enter mt-10" style={{ "--i": 1 } as React.CSSProperties}>
            <Section title="Summary">
              <dl className="flex flex-col">
                <Row label="Logged" value={formatDuration(review.minutes)} />
                <Row label="Earned" value={`${review.xp.toLocaleString()} XP`} />
                <Row label="Entries" value={String(review.entries)} />
                <Row label="Days active" value={`${review.daysActive} of 7`} />
                {review.best && (
                  <Row
                    label="Best day"
                    value={`${dayName(review.best.day)} · ${review.best.xp.toLocaleString()} XP`}
                  />
                )}
              </dl>
            </Section>
          </div>

          {/* --- how often you did each thing ---------------------------- */}
          <div className="enter mt-14" style={{ "--i": 2 } as React.CSSProperties}>
            <Section title="What you did" meta={`${review.byActivity.length} activities`}>
              <ul>
                {review.byActivity.map((activity) => (
                  <li key={activity.name} className="rule-b flex items-baseline gap-3 py-2.5 last:border-b-0">
                    <span aria-hidden className="text-sm">{activity.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{activity.name}</span>
                    <span className="tabular t-meta w-8 text-right">×{activity.times}</span>
                    <span className="tabular t-meta w-16 text-right">{formatDuration(activity.minutes)}</span>
                    <span className="tabular t-figure w-14 text-right text-sm">
                      {activity.xp.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          {/* --- day by day ---------------------------------------------- */}
          <div className="mt-16 flex flex-col gap-12">
            {review.days.map((day, index) => (
              <div key={day.day} className="enter" style={{ "--i": index } as React.CSSProperties}>
                <Section
                  title={dayLabel(day.day, today)}
                  meta={
                    <span className="tabular">
                      {formatDuration(day.minutes)} · {day.xp.toLocaleString()} XP
                    </span>
                  }
                >
                  <Timeline entries={day.entries} timezone={user.timezone} />
                </Section>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rule-b flex items-baseline justify-between gap-4 py-2.5 last:border-b-0">
      <dt className="t-secondary text-sm">{label}</dt>
      <dd className="tabular t-figure text-[0.9375rem]">{value}</dd>
    </div>
  );
}

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

function dayName(day: string): string {
  return asDate(day).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
}

function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return asDate(day).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
}

function weekLabel(start: string, end: string): string {
  const options = { day: "numeric", month: "short", timeZone: "UTC" } as const;
  return `${asDate(start).toLocaleDateString(undefined, options)} – ${asDate(end).toLocaleDateString(undefined, options)}`;
}
