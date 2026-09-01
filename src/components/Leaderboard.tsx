import Link from "next/link";
import type { LeaderboardPeriod, LeaderboardRow } from "@/lib/queries";

/**
 * Standings, server-rendered.
 *
 * The period lives in the URL rather than in client state, which means no
 * JavaScript, no fetch on switch, and a shareable link to any view. Ranks are
 * computed by the database; nothing here sorts or totals.
 */

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "all", label: "All time" },
];

export function Leaderboard({
  rows, period, basePath, currentUserId,
}: {
  rows: LeaderboardRow[];
  period: LeaderboardPeriod;
  basePath: string;
  currentUserId: string;
}) {
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const myIndex = rows.findIndex((row) => row.user_id === currentUserId);
  // If you're far down the table, your row is still shown rather than buried.
  const myRowIsHidden = myIndex >= 3 + rest.length;

  return (
    <div>
      <nav className="mb-8 flex gap-5" aria-label="Leaderboard period">
        {PERIODS.map(({ value, label }) => (
          <Link
            key={value}
            href={value === "week" ? basePath : `${basePath}?period=${value}`}
            scroll={false}
            aria-current={period === value ? "true" : undefined}
            className="t-section tap pb-1"
            style={period === value
              ? { color: "var(--ink)", borderBottom: "1px solid var(--ink)" }
              : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="t-secondary text-sm">Nobody has logged anything yet.</p>
      ) : (
        <>
          {podium.length > 0 && <Podium rows={podium} currentUserId={currentUserId} />}

          {rest.length > 0 && (
            <ul className="mt-10">
              {rest.map((row, index) => (
                <Standing key={row.user_id} row={row} rank={index + 4} isMe={row.user_id === currentUserId} />
              ))}
            </ul>
          )}

          {myRowIsHidden && myIndex >= 0 && (
            <ul className="rule-t mt-2 pt-2">
              <Standing row={rows[myIndex]} rank={myIndex + 1} isMe />
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Top three, ordered 2 · 1 · 3 with the winner raised — the shape reads as a
 * podium before any of the numbers are.
 */
function Podium({ rows, currentUserId }: { rows: LeaderboardRow[]; currentUserId: string }) {
  const [first, second, third] = rows;
  const order = [
    { row: second, place: 2, lift: "sm:mt-8" },
    { row: first, place: 1, lift: "" },
    { row: third, place: 3, lift: "sm:mt-12" },
  ].filter((entry) => entry.row);

  return (
    <div className="flex items-end justify-center gap-6 sm:gap-12">
      {order.map(({ row, place, lift }) => {
        const isMe = row.user_id === currentUserId;
        return (
          <div key={row.user_id} className={`flex min-w-0 flex-1 flex-col items-center text-center ${lift}`}>
            <span className="t-meta tabular">{place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"}</span>
            <span
              className={`mt-2 max-w-full truncate text-[0.8125rem] uppercase tracking-[0.08em] ${isMe ? "" : "t-secondary"}`}
              style={isMe ? { color: "var(--accent)" } : undefined}
            >
              {row.name}
            </span>
            <span className={`t-figure mt-1.5 ${place === 1 ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"}`}>
              {row.xp.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Standing({ row, rank, isMe }: { row: LeaderboardRow; rank: number; isMe: boolean }) {
  return (
    <li
      className="rule-b flex items-baseline gap-4 py-2.5 last:border-b-0"
      style={isMe ? { color: "var(--accent)" } : undefined}
    >
      <span className="tabular t-meta w-6 shrink-0" style={isMe ? { color: "inherit" } : undefined}>{rank}</span>
      <span className="min-w-0 flex-1 truncate text-[0.9375rem]">
        {row.name}
        {isMe && <span className="t-meta ml-2" style={{ color: "inherit" }}>you</span>}
      </span>
      <span className="tabular t-figure text-[0.9375rem]">{row.xp.toLocaleString()}</span>
    </li>
  );
}
