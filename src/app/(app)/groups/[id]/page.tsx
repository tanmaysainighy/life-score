import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getGroup, isMember, getGroupLeaderboard, type LeaderboardPeriod } from "@/lib/queries";
import { localDay } from "@/lib/dates";
import { Leaderboard } from "@/components/Leaderboard";
import { LeaveGroup } from "@/components/GroupActions";
import { InviteCode } from "@/components/InviteCode";
import { Section } from "@/components/Section";

export const dynamic = "force-dynamic";

const PERIODS: LeaderboardPeriod[] = ["today", "week", "month", "all"];

export default async function GroupPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const requested = (await searchParams).period as LeaderboardPeriod | undefined;
  const period: LeaderboardPeriod = requested && PERIODS.includes(requested) ? requested : "week";

  const group = await getGroup(id);
  // Non-members get a 404 rather than a 403 — no group's existence is leaked.
  if (!group || !(await isMember(group.id, user.id))) notFound();

  const leaderboard = await getGroupLeaderboard(group.id, period, localDay(new Date(), user.timezone));

  return (
    <div className="mx-auto max-w-2xl">
      <header className="enter flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-heading flex items-center gap-2.5">
            <span aria-hidden>{group.emoji}</span>
            <span className="truncate">{group.name}</span>
          </h1>
          <p className="t-meta mt-1.5">
            {leaderboard.length} {leaderboard.length === 1 ? "member" : "members"}
          </p>
        </div>
        <LeaveGroup groupId={group.id} />
      </header>

      {group.description && <p className="t-secondary enter mt-4 text-[0.9375rem]">{group.description}</p>}

      <div className="enter mt-12" style={{ "--i": 1 } as React.CSSProperties}>
        <Leaderboard
          rows={leaderboard}
          period={period}
          basePath={`/groups/${group.id}`}
          currentUserId={user.id}
        />
      </div>

      <div className="enter mt-14" style={{ "--i": 2 } as React.CSSProperties}>
        <Section title="Invite">
          <InviteCode code={group.invite_code} />
        </Section>
      </div>
    </div>
  );
}
