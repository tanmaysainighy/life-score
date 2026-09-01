import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/queries";
import { greetingFor } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { Composer } from "@/components/Composer";
import { Timeline } from "@/components/Timeline";
import { WeekBars, SelfComparison } from "@/components/WeekBars";
import { Section, FirstRun } from "@/components/Section";
import { DailyTargets } from "@/components/DailyTargets";

export const metadata = { title: "LifeScore" };
// Session-dependent, so always rendered fresh — but from local queries only.
// No model call is ever on the path to rendering this page.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const { totals, streak, logs, groups, week, momentum, targets } = await getDashboard(user);

  const minutesToday = logs.reduce((sum, log) => sum + log.duration_minutes, 0);
  const hasHistory = totals.entries > 0;

  return (
    <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div className="min-w-0">
        {/* --- who am I, how am I doing today -------------------------------- */}
        <header className="enter">
          <p className="t-secondary text-[0.9375rem]">
            {greetingFor(new Date(), user.timezone)}, {user.name.split(" ")[0]}.
          </p>

          <p className="t-display mt-5">{totals.today.toLocaleString()}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span className="t-section">XP today</span>

            {momentum.dailyAverage > 0 && totals.today > 0 && (
              <span className="tabular text-[0.8125rem]" style={{
                color: totals.today >= momentum.dailyAverage ? "var(--gain)" : "var(--muted)",
              }}>
                {totals.today >= momentum.dailyAverage ? "↑" : "↓"}{" "}
                {Math.abs(Math.round(((totals.today - momentum.dailyAverage) / momentum.dailyAverage) * 100))}%
                <span className="t-secondary"> from your 7-day average</span>
              </span>
            )}

            {streak.current > 0 && (
              <span className="tabular text-[0.8125rem]" style={{ color: "var(--flame)" }}>
                🔥 {streak.current} day{streak.current === 1 ? "" : "s"}
                {streak.atRisk && <span className="t-secondary"> · log today to keep it</span>}
              </span>
            )}
          </div>
        </header>

        {/* --- what should I log next (the centrepiece) --------------------- */}
        <div className="enter mt-12" style={{ "--i": 1 } as React.CSSProperties}>
          <Composer lifetimeXp={totals.lifetime} />
        </div>

        {/* --- what have I done --------------------------------------------- */}
        <div className="enter mt-14" style={{ "--i": 2 } as React.CSSProperties}>
          {logs.length > 0 ? (
            <Section
              title="Today"
              meta={<span className="tabular">{formatDuration(minutesToday)} · {totals.today.toLocaleString()} XP</span>}
              action={<Link href="/log" className="hit tap t-meta hover:text-ink">All activity</Link>}
            >
              <Timeline entries={logs} timezone={user.timezone} />
            </Section>
          ) : (
            <FirstRun returning={hasHistory} />
          )}
        </div>
      </div>

      {/* --- how am I doing against myself, and against friends ------------- */}
      <aside className="enter flex min-w-0 flex-col gap-12 lg:pt-2" style={{ "--i": 3 } as React.CSSProperties}>
        <Section
          title="Today's targets"
          meta={targets.length > 0 && (
            <span className="tabular">{targets.filter((target) => target.met).length} of {targets.length}</span>
          )}
        >
          <DailyTargets targets={targets} />
        </Section>

        {hasHistory && (
          <>
            <Section title="This week">
              <WeekBars {...week} />
            </Section>

            <Section title="You vs yourself">
              <SelfComparison
                thisWeek={momentum.thisWeek}
                lastWeek={momentum.lastWeek}
                change={momentum.weekChange}
                daysCompared={momentum.daysCompared}
              />
            </Section>
          </>
        )}

        <Section
          title="Groups"
          action={<Link href="/groups" className="hit tap t-meta hover:text-ink">{groups.length > 0 ? "All" : "Find"}</Link>}
        >
          {groups.length === 0 ? (
            <p className="t-secondary text-sm">
              Nobody to compete with yet.{" "}
              <Link href="/groups" className="underline underline-offset-2 hover:text-ink">Start a group</Link>.
            </p>
          ) : (
            <ul>
              {groups.map((group) => (
                <li key={group.id}>
                  <Link href={`/groups/${group.id}`} className="tap flex min-h-11 items-baseline gap-3 py-2">
                    <span aria-hidden className="text-sm">{group.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{group.name}</span>
                    <span className="tabular t-figure text-sm">#{group.rank}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </aside>
    </div>
  );
}
