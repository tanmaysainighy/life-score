import { all, get, run } from "./db";
import { ensureSeeded } from "./seed";
import { localDay, startOfWeek, startOfMonth, addDays, daysBetween } from "./dates";
import { computeStreak, MIN_STREAK_XP, NON_STREAK_CATEGORY } from "./streak";
import { getLevelProgress } from "./levels";
import { evaluateAchievements, ACHIEVEMENTS } from "./achievements";
import { cached } from "./cache";

/**
 * Read models for the UI. Every total is computed by the database with an
 * aggregate over an indexed range — nothing loops over rows in JavaScript.
 */

export type SessionUser = {
  id: string; name: string; email: string; timezone: string;
};

export type LogRow = {
  id: string;
  raw_text: string;
  duration_minutes: number;
  xp: number;
  base_xp_per_hour: number;
  scoring_version: number;
  created_at: string;
  local_day: string;
  activity_name: string;
  activity_icon: string;
};

const LOG_SELECT = `
  SELECT l.id, l.raw_text, l.duration_minutes, l.xp, l.base_xp_per_hour, l.scoring_version,
         l.created_at, l.local_day,
         a.name AS activity_name, a.icon AS activity_icon
    FROM activity_logs l
    JOIN activities a ON a.id = l.activity_id`;

/** Today / week / month / lifetime in a single pass over the user's index. */
export async function getTotals(userId: string, today: string) {
  const row = await get<{
    today: number; week: number; month: number; lifetime: number;
    entries: number; distinct_activities: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN local_day = ?  THEN xp END), 0) AS today,
       COALESCE(SUM(CASE WHEN local_day >= ? THEN xp END), 0) AS week,
       COALESCE(SUM(CASE WHEN local_day >= ? THEN xp END), 0) AS month,
       COALESCE(SUM(xp), 0)                                   AS lifetime,
       COUNT(*)                                               AS entries,
       COUNT(DISTINCT activity_id)                            AS distinct_activities
     FROM activity_logs WHERE user_id = ?`,
    today, startOfWeek(today), startOfMonth(today), userId,
  );
  return row ?? {
    today: 0, week: 0, month: 0, lifetime: 0, entries: 0, distinct_activities: 0,
  };
}

/**
 * Only the day labels that cleared the streak threshold come back.
 * Rest-category activities are excluded, so a long night's sleep or a TV binge
 * is still tracked but never keeps a streak alive on its own.
 */
export async function getStreak(userId: string, today: string) {
  const rows = await all<{ local_day: string }>(
    `SELECT l.local_day
       FROM activity_logs l
       JOIN activities a ON a.id = l.activity_id
      WHERE l.user_id = ? AND a.category != ?
      GROUP BY l.local_day HAVING SUM(l.xp) >= ?`,
    userId, NON_STREAK_CATEGORY, MIN_STREAK_XP,
  );
  return computeStreak(rows.map((row) => row.local_day), today);
}

export function getLogsForDay(userId: string, day: string): Promise<LogRow[]> {
  return all<LogRow>(
    `${LOG_SELECT} WHERE l.user_id = ? AND l.local_day = ? ORDER BY l.created_at DESC`,
    userId, day,
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Monday–Sunday for the week containing `today`, zero-filled, with the numbers
 * the UI states in prose: average across days so far and the best day.
 */
export async function getWeekBars(userId: string, today: string) {
  const start = startOfWeek(today);
  const rows = await all<{ local_day: string; xp: number }>(
    `SELECT local_day, SUM(xp) AS xp FROM activity_logs
      WHERE user_id = ? AND local_day >= ? AND local_day <= ?
      GROUP BY local_day`,
    userId, start, addDays(start, 6),
  );
  const byDay = new Map(rows.map((row) => [row.local_day, row.xp]));

  const days = WEEKDAYS.map((label, index) => {
    const day = addDays(start, index);
    return { day, label, xp: byDay.get(day) ?? 0, isToday: day === today, isFuture: day > today };
  });

  const elapsed = days.filter((d) => !d.isFuture);
  const best = days.reduce((a, b) => (b.xp > a.xp ? b : a), days[0]);
  return {
    days,
    peak: Math.max(...days.map((d) => d.xp)),
    average: elapsed.length ? Math.round(elapsed.reduce((sum, d) => sum + d.xp, 0) / elapsed.length) : 0,
    best: best.xp > 0 ? best : null,
  };
}

/**
 * This week against last week, and today against the trailing 7-day average.
 *
 * The week comparison is deliberately like-for-like: this week *so far* against
 * the same stretch of last week. Comparing three days against a full seven
 * would show a large drop every Monday morning — technically true, useless as a
 * signal, and discouraging at exactly the wrong moment.
 */
export async function getMomentum(userId: string, today: string) {
  const thisWeekStart = startOfWeek(today);
  const lastWeekStart = addDays(thisWeekStart, -7);
  const elapsed = daysBetween(thisWeekStart, today);        // 0 on Monday
  const lastWeekSamePoint = addDays(lastWeekStart, elapsed);

  const row = await get<{ this_week: number; last_week: number; trailing: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN local_day >= ? THEN xp END), 0)                   AS this_week,
       COALESCE(SUM(CASE WHEN local_day >= ? AND local_day <= ? THEN xp END), 0) AS last_week,
       COALESCE(SUM(CASE WHEN local_day >= ? AND local_day < ? THEN xp END), 0)  AS trailing
     FROM activity_logs WHERE user_id = ?`,
    thisWeekStart, lastWeekStart, lastWeekSamePoint, addDays(today, -7), today, userId,
  );

  const thisWeek = row?.this_week ?? 0;
  const lastWeek = row?.last_week ?? 0;

  return {
    thisWeek,
    lastWeek,
    // A percentage needs a real baseline; inventing one from a zero week lies.
    weekChange: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null,
    dailyAverage: Math.round((row?.trailing ?? 0) / 7),
    // How much of the week each side covers, so the UI can say so plainly.
    daysCompared: elapsed + 1,
  };
}

/** Every entry inside a date range, oldest day first. */
export function getLogsInRange(userId: string, from: string, to: string): Promise<LogRow[]> {
  return all<LogRow>(
    `${LOG_SELECT} WHERE l.user_id = ? AND l.local_day >= ? AND l.local_day <= ?
      ORDER BY l.created_at DESC`,
    userId, from, to,
  );
}

/**
 * One week, reviewed.
 *
 * The per-activity rollup is the part worth having: "Gym x4" says something a
 * list of individual entries doesn't. Everything else is derived from the logs
 * already fetched rather than asking the database twice for the same rows.
 */
export async function getWeekReview(userId: string, weekStart: string) {
  const weekEnd = addDays(weekStart, 6);

  const [logs, byActivity] = await Promise.all([
    getLogsInRange(userId, weekStart, weekEnd),
    all<{ name: string; icon: string; times: number; minutes: number; xp: number }>(
      `SELECT a.name, a.icon, COUNT(*) AS times,
              SUM(l.duration_minutes) AS minutes, SUM(l.xp) AS xp
         FROM activity_logs l JOIN activities a ON a.id = l.activity_id
        WHERE l.user_id = ? AND l.local_day >= ? AND l.local_day <= ?
        GROUP BY a.id, a.name, a.icon
        ORDER BY xp DESC, times DESC`,
      userId, weekStart, weekEnd,
    ),
  ]);

  // Group by the day the user actually lived, newest first.
  const days = new Map<string, LogRow[]>();
  for (const log of logs) {
    const existing = days.get(log.local_day);
    if (existing) existing.push(log);
    else days.set(log.local_day, [log]);
  }

  const dayTotals = [...days].map(([day, entries]) => ({
    day,
    entries,
    xp: entries.reduce((sum, log) => sum + log.xp, 0),
    minutes: entries.reduce((sum, log) => sum + log.duration_minutes, 0),
  }));

  const best = dayTotals.reduce<(typeof dayTotals)[number] | null>(
    (top, current) => (top === null || current.xp > top.xp ? current : top), null,
  );

  return {
    weekStart,
    weekEnd,
    days: dayTotals,
    byActivity,
    xp: dayTotals.reduce((sum, d) => sum + d.xp, 0),
    minutes: dayTotals.reduce((sum, d) => sum + d.minutes, 0),
    entries: logs.length,
    daysActive: dayTotals.length,
    best: best && best.xp > 0 ? best : null,
  };
}

export function getCategoryBreakdown(userId: string) {
  return all<{ category: string; xp: number; minutes: number }>(
    `SELECT a.category, SUM(l.xp) AS xp, SUM(l.duration_minutes) AS minutes
       FROM activity_logs l JOIN activities a ON a.id = l.activity_id
      WHERE l.user_id = ?
      GROUP BY a.category ORDER BY xp DESC`,
    userId,
  );
}

export function getTopActivities(userId: string, limit = 6) {
  return all<{ name: string; icon: string; xp: number; minutes: number; count: number }>(
    `SELECT a.name, a.icon, SUM(l.xp) AS xp, SUM(l.duration_minutes) AS minutes, COUNT(*) AS count
       FROM activity_logs l JOIN activities a ON a.id = l.activity_id
      WHERE l.user_id = ?
      GROUP BY a.id, a.name, a.icon ORDER BY xp DESC LIMIT ?`,
    userId, limit,
  );
}

// --- daily targets --------------------------------------------------------

export type DailyTarget = {
  activity_id: string;
  name: string;
  icon: string;
  target_minutes: number | null;
  done_minutes: number;
  times: number;
  met: boolean;
};

/**
 * What you said you'd do today, and how far along you are.
 *
 * One query joins the commitments to today's entries, so an untouched target
 * still comes back (with zeros) rather than disappearing from the list — the
 * whole point is seeing what you haven't done yet.
 */
export async function getDailyTargets(userId: string, today: string): Promise<DailyTarget[]> {
  const rows = await all<Omit<DailyTarget, "met">>(
    `SELECT t.activity_id, a.name, a.icon, t.target_minutes,
            COALESCE(SUM(l.duration_minutes), 0) AS done_minutes,
            COUNT(l.id) AS times
       FROM daily_targets t
       JOIN activities a ON a.id = t.activity_id
       LEFT JOIN activity_logs l
         ON l.activity_id = t.activity_id AND l.user_id = t.user_id AND l.local_day = ?
      WHERE t.user_id = ?
      GROUP BY t.activity_id, a.name, a.icon, t.target_minutes
      ORDER BY a.name`,
    today, userId,
  );

  return rows.map((row) => ({
    ...row,
    met: row.target_minutes === null ? row.times > 0 : row.done_minutes >= row.target_minutes,
  }));
}

export async function setDailyTarget(
  userId: string, activityId: string, targetMinutes: number | null,
): Promise<void> {
  await run(
    `INSERT INTO daily_targets (user_id, activity_id, target_minutes, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, activity_id) DO UPDATE SET target_minutes = excluded.target_minutes`,
    userId, activityId, targetMinutes, new Date().toISOString(),
  );
}

export async function removeDailyTarget(userId: string, activityId: string): Promise<void> {
  await run(`DELETE FROM daily_targets WHERE user_id = ? AND activity_id = ?`, userId, activityId);
}

// --- groups ---------------------------------------------------------------

export type GroupSummary = {
  id: string; name: string; emoji: string; slug: string;
  members: number; xp: number; rank: number;
};

/** Every group the user is in, with their current weekly rank. One query. */
export function getUserGroups(userId: string, today: string): Promise<GroupSummary[]> {
  return cached(`groups:${userId}:${today}`, 10_000, () =>
    all<GroupSummary>(
      `WITH mine AS (SELECT group_id FROM group_members WHERE user_id = ?),
            weekly AS (
              SELECT gm.group_id, gm.user_id, COALESCE(SUM(l.xp), 0) AS xp
                FROM group_members gm
                LEFT JOIN activity_logs l
                  ON l.user_id = gm.user_id AND l.local_day >= ?
               WHERE gm.group_id IN (SELECT group_id FROM mine)
               GROUP BY gm.group_id, gm.user_id
            ),
            ranked AS (
              SELECT group_id, user_id, xp,
                     RANK() OVER (PARTITION BY group_id ORDER BY xp DESC) AS rank
                FROM weekly
            )
       SELECT g.id, g.name, g.emoji, g.slug, r.xp, r.rank,
              (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS members
         FROM ranked r JOIN groups g ON g.id = r.group_id
        WHERE r.user_id = ?
        ORDER BY g.created_at DESC`,
      userId, startOfWeek(today), userId,
    ),
  );
}

export type LeaderboardPeriod = "today" | "week" | "month" | "all";

function periodStart(period: LeaderboardPeriod, today: string): string {
  switch (period) {
    case "today": return today;
    case "week": return startOfWeek(today);
    case "month": return startOfMonth(today);
    case "all": return "0000-01-01";
  }
}

export type LeaderboardRow = {
  user_id: string; name: string; xp: number; entries: number;
};

/**
 * Server-side aggregation over the (user_id, local_day) index. The client never
 * submits XP and never computes a total.
 */
export function getGroupLeaderboard(
  groupId: string, period: LeaderboardPeriod, today: string,
): Promise<LeaderboardRow[]> {
  return cached(`lb:${groupId}:${period}:${today}`, 15_000, () =>
    all<LeaderboardRow>(
      `SELECT u.id AS user_id, u.name,
              COALESCE(SUM(l.xp), 0) AS xp,
              COUNT(l.id) AS entries
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         LEFT JOIN activity_logs l ON l.user_id = gm.user_id AND l.local_day >= ?
        WHERE gm.group_id = ?
        GROUP BY u.id, u.name
        ORDER BY xp DESC, u.name ASC
        LIMIT 100`,
      periodStart(period, today), groupId,
    ),
  );
}

export function getGroup(groupId: string) {
  return get<{ id: string; name: string; slug: string; description: string; emoji: string; invite_code: string; owner_id: string; created_at: string }>(
    `SELECT id, name, slug, description, emoji, invite_code, owner_id, created_at FROM groups WHERE id = ?`,
    groupId,
  );
}

export async function isMember(groupId: string, userId: string): Promise<boolean> {
  return Boolean(await get(`SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?`, groupId, userId));
}

// --- composed views -------------------------------------------------------

/**
 * Everything the dashboard renders, gathered in one server pass.
 * The independent queries run concurrently rather than in a waterfall.
 */
export async function getDashboard(user: SessionUser) {
  await ensureSeeded();
  const today = localDay(new Date(), user.timezone);

  const [totals, streak, logs, groups, week, momentum, targets] = await Promise.all([
    getTotals(user.id, today),
    getStreak(user.id, today),
    getLogsForDay(user.id, today),
    getUserGroups(user.id, today),
    getWeekBars(user.id, today),
    getMomentum(user.id, today),
    getDailyTargets(user.id, today),
  ]);

  return {
    today, totals, streak, logs, groups, week, momentum, targets,
    level: getLevelProgress(totals.lifetime),
  };
}

export async function getProfile(user: SessionUser) {
  await ensureSeeded();
  const today = localDay(new Date(), user.timezone);

  const [totals, streak, categories, topActivities, groups] = await Promise.all([
    getTotals(user.id, today),
    getStreak(user.id, today),
    getCategoryBreakdown(user.id),
    getTopActivities(user.id),
    getUserGroups(user.id, today),
  ]);

  const level = getLevelProgress(totals.lifetime);
  const earned = evaluateAchievements({
    lifetimeXp: totals.lifetime,
    currentStreak: streak.current,
    longestStreak: streak.longest,
    totalEntries: totals.entries,
    distinctActivities: totals.distinct_activities,
    level: level.level,
  });
  const earnedIds = new Set(earned.map((achievement) => achievement.id));

  return {
    today, totals, streak, level, categories, topActivities, groups,
    achievements: ACHIEVEMENTS.map(({ earned: _earned, ...rest }) => ({
      ...rest, unlocked: earnedIds.has(rest.id),
    })),
  };
}
