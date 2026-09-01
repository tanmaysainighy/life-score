/**
 * Anti-gaming limits. Kept out of the scoring engine so that scoring stays a
 * pure function of (rate, duration) — this layer decides whether an entry is
 * allowed to be scored at all.
 *
 * Tone matters: flag the impossible, ask about the improbable, never accuse.
 */

export const MAX_ENTRY_MINUTES = 24 * 60;
export const MINUTES_IN_DAY = 24 * 60;
export const DUPLICATE_WINDOW_MINUTES = 10;

/** Single-session ceilings above which we ask "really?" before scoring. */
const PLAUSIBLE_SESSION_MINUTES: Record<string, number> = {
  physical: 300,   // 5 h of sport in one go is a lot
  social: 480,
  life: 480,
  wellness: 240,
  learning: 720,
  creative: 720,
  work: 840,
  software_development: 840,
};
const DEFAULT_SESSION_MINUTES = 720;

export type ValidationIssue = {
  severity: "error" | "confirm";
  code: string;
  message: string;
};

export type ValidationContext = {
  category: string;
  /** Minutes already logged by this user on this local day. */
  minutesLoggedToday: number;
  /** A near-identical entry (same activity + duration) within the dedupe window. */
  hasRecentDuplicate: boolean;
};

/**
 * Returns the first blocking or confirmable issue, or null when the entry is
 * fine. `confirm` issues pass once the client re-submits with `acknowledged`.
 */
export function validateEntry(
  durationMinutes: number,
  context: ValidationContext,
): ValidationIssue | null {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
    return {
      severity: "error",
      code: "duration_invalid",
      message: "That duration doesn't look right. How long did it actually take?",
    };
  }

  if (durationMinutes > MAX_ENTRY_MINUTES) {
    return {
      severity: "error",
      code: "duration_exceeds_day",
      message: "A single activity can't run longer than 24 hours. Try splitting it across days.",
    };
  }

  if (context.minutesLoggedToday + durationMinutes > MINUTES_IN_DAY) {
    const remaining = Math.max(0, MINUTES_IN_DAY - context.minutesLoggedToday);
    return {
      severity: "error",
      code: "day_overflow",
      message: `That would put you past 24 hours for today. You have ${Math.floor(remaining / 60)}h ${remaining % 60}m left to log.`,
    };
  }

  const ceiling = PLAUSIBLE_SESSION_MINUTES[context.category] ?? DEFAULT_SESSION_MINUTES;
  if (durationMinutes > ceiling) {
    return {
      severity: "confirm",
      code: "unusually_long",
      message: `${Math.round((durationMinutes / 60) * 10) / 10} hours in one session is unusual for this. Is that right?`,
    };
  }

  if (context.hasRecentDuplicate) {
    return {
      severity: "confirm",
      code: "possible_duplicate",
      message: "You just logged this exact activity. Log it again?",
    };
  }

  return null;
}
