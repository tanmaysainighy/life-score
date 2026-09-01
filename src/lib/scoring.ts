/**
 * The scoring engine. Pure functions, no database, no LLM, no clock.
 *
 * This is the only place XP is calculated. The LLM decides *what* the activity
 * was; this decides what it is worth. Same canonical activity + same duration =
 * same XP, for every user, every time.
 */

export type ScoreInput = {
  baseXpPerHour: number;
  durationMinutes: number;
};

export type ScoreExplanation = {
  xp: number;
  baseXpPerHour: number;
  durationMinutes: number;
  hours: number;
  formula: string;
};

/** XP = rate × hours, rounded half-up to a whole number. */
export function scoreActivity({ baseXpPerHour, durationMinutes }: ScoreInput): number {
  if (!Number.isFinite(baseXpPerHour) || !Number.isFinite(durationMinutes)) {
    throw new Error("scoreActivity: rate and duration must be finite numbers");
  }
  if (baseXpPerHour < 0 || durationMinutes < 0) {
    throw new Error("scoreActivity: rate and duration must be non-negative");
  }
  return Math.round((baseXpPerHour * durationMinutes) / 60);
}

/** The same calculation, plus the human-readable derivation shown in the UI. */
export function explainScore(input: ScoreInput): ScoreExplanation {
  const xp = scoreActivity(input);
  const hours = input.durationMinutes / 60;
  const rounded = Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/\.?0+$/, "");
  return {
    xp,
    baseXpPerHour: input.baseXpPerHour,
    durationMinutes: input.durationMinutes,
    hours,
    formula: `${rounded} h × ${input.baseXpPerHour} XP/h = ${xp} XP`,
  };
}

/**
 * Rate for an activity that isn't in the taxonomy yet, derived from its nearest
 * neighbours rather than invented. Median (not mean) so one outlier neighbour
 * can't drag the value; clamped to the range the taxonomy actually uses.
 *
 * Returns null when there aren't enough neighbours to be confident — the caller
 * must then ask the user or queue the activity for review instead of guessing.
 */
export const MIN_XP_RATE = 2;
export const MAX_XP_RATE = 20;

export function deriveXpRate(neighbourRates: number[]): number | null {
  const rates = neighbourRates.filter((rate) => Number.isFinite(rate) && rate > 0).sort((a, b) => a - b);
  if (rates.length < 2) return null;

  const middle = Math.floor(rates.length / 2);
  const median = rates.length % 2 === 1 ? rates[middle] : (rates[middle - 1] + rates[middle]) / 2;

  return Math.min(MAX_XP_RATE, Math.max(MIN_XP_RATE, Math.round(median)));
}
