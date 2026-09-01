import { addDays, daysBetween } from "./dates";

/**
 * Streak rules, stated plainly:
 *   - A day counts when you earned at least MIN_STREAK_XP that day from
 *     activities outside the "rest" category — sleep, TV and scrolling are
 *     tracked, but they don't count as showing up.
 *   - The streak is the run of consecutive counting days ending today.
 *   - Today not counting yet is fine: if yesterday counted the streak still
 *     stands, and it shows as "at risk" until you log something.
 *   - Miss a whole day and it resets to zero.
 *
 * The rest-category exclusion lives in the query (see getStreak) rather than in
 * the XP rates, so re-pricing leisure can never quietly make a streak farmable.
 */
export const MIN_STREAK_XP = 10;
export const NON_STREAK_CATEGORY = "rest";

export type StreakResult = {
  current: number;
  longest: number;
  atRisk: boolean;
};

/**
 * `qualifyingDays` — YYYY-MM-DD labels that met the XP threshold, any order.
 * `today` — the user's current local day.
 */
export function computeStreak(qualifyingDays: string[], today: string): StreakResult {
  const days = new Set(qualifyingDays);
  if (days.size === 0) return { current: 0, longest: 0, atRisk: false };

  // Current run: start from today, or yesterday if today is still empty.
  let cursor: string | null = null;
  if (days.has(today)) cursor = today;
  else if (days.has(addDays(today, -1))) cursor = addDays(today, -1);

  let current = 0;
  while (cursor && days.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  // Longest run across all history.
  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  return { current, longest: Math.max(longest, current), atRisk: current > 0 && !days.has(today) };
}
