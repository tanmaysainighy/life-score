import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";
import { formatDuration } from "@/lib/duration";
import { Section } from "@/components/Section";

export const metadata = { title: "Profile · LifeScore" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const { totals, streak, level, categories, topActivities, groups, achievements } = await getProfile(user);
  const unlocked = achievements.filter((achievement) => achievement.unlocked);
  const categoryTotal = categories.reduce((sum, row) => sum + row.xp, 0) || 1;

  return (
    <div className="mx-auto max-w-2xl">
      {/* --- identity ------------------------------------------------------ */}
      <header className="enter">
        <h1 className="t-heading">{user.name}</h1>
        <p className="t-section mt-3">Level {level.level}</p>

        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="tabular t-figure text-2xl">{totals.lifetime.toLocaleString()}</span>
            <span className="tabular t-meta">
              {level.isMax ? "top level" : `${level.nextLevelAt!.toLocaleString()} for level ${level.level + 1}`}
            </span>
          </div>
          <div className="mt-2.5 h-1 w-full" style={{ background: "var(--rule)" }}>
            <div className="grow-w h-full" style={{ width: `${level.percent}%`, background: "var(--accent)" }} />
          </div>
        </div>

        {streak.current > 0 && (
          <p className="tabular mt-5 text-[0.9375rem]" style={{ color: "var(--flame)" }}>
            🔥 {streak.current} day streak
            {streak.longest > streak.current && (
              <span className="t-secondary"> · longest {streak.longest}</span>
            )}
          </p>
        )}
      </header>

      {/* --- the four numbers, as a table rather than four boxes ----------- */}
      <div className="enter mt-14" style={{ "--i": 1 } as React.CSSProperties}>
        <Section title="Totals">
          <dl>
            {([
              ["Today", totals.today],
              ["This week", totals.week],
              ["This month", totals.month],
              ["Lifetime", totals.lifetime],
            ] as const).map(([label, value]) => (
              <div key={label} className="rule-b flex items-baseline justify-between gap-4 py-2.5 last:border-b-0">
                <dt className="t-secondary text-sm">{label}</dt>
                <dd className="tabular t-figure text-[0.9375rem]">{value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      {categories.length > 0 && (
        <div className="enter mt-14" style={{ "--i": 2 } as React.CSSProperties}>
          <Section title="Where the time goes">
            <ul>
              {categories.map((row) => (
                <li key={row.category} className="mb-4 last:mb-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm capitalize">{row.category.replace(/_/g, " ")}</span>
                    <span className="tabular t-meta">
                      {Math.round(row.minutes / 60)}h · {row.xp.toLocaleString()} XP
                    </span>
                  </div>
                  <div className="mt-1.5 h-px w-full" style={{ background: "var(--rule)" }}>
                    <div className="grow-w h-px" style={{
                      width: `${Math.max(2, (row.xp / categoryTotal) * 100)}%`, background: "var(--ink)",
                    }} />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {topActivities.length > 0 && (
        <div className="enter mt-14" style={{ "--i": 3 } as React.CSSProperties}>
          <Section title="Most logged">
            <ul>
              {topActivities.map((activity) => (
                <li key={activity.name} className="rule-b flex items-baseline gap-3 py-2.5 last:border-b-0">
                  <span aria-hidden className="text-sm">{activity.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{activity.name}</span>
                  <span className="tabular t-meta">{formatDuration(activity.minutes)}</span>
                  <span className="tabular t-figure w-16 text-right text-sm">{activity.xp.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <div className="enter mt-14" style={{ "--i": 4 } as React.CSSProperties}>
        <Section title="Achievements" meta={`${unlocked.length} of ${achievements.length}`}>
          <ul className="flex flex-col gap-2.5">
            {achievements.map((achievement) => (
              <li key={achievement.id} className="flex items-baseline gap-3" style={{
                opacity: achievement.unlocked ? 1 : .35,
              }}>
                <span aria-hidden className="text-sm">{achievement.icon}</span>
                <span className="text-sm">{achievement.name}</span>
                <span className="t-meta truncate">{achievement.description}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="enter mt-14" style={{ "--i": 5 } as React.CSSProperties}>
        <Section title="Groups" action={<Link href="/groups" className="hit tap t-meta hover:text-ink">All</Link>}>
          {groups.length === 0 ? (
            <p className="t-secondary text-sm">
              Not in any groups.{" "}
              <Link href="/groups" className="underline underline-offset-2 hover:text-ink">Find one</Link>.
            </p>
          ) : (
            <ul>
              {groups.map((group) => (
                <li key={group.id} className="rule-b last:border-b-0">
                  <Link href={`/groups/${group.id}`} className="tap flex min-h-11 items-baseline gap-3 py-2.5">
                    <span aria-hidden className="text-sm">{group.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{group.name}</span>
                    <span className="tabular t-figure text-sm">#{group.rank}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
