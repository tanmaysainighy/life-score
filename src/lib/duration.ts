/**
 * Duration parsing. Deterministic and LLM-free — most entries state their
 * duration plainly, and guessing is never allowed, so this either finds a
 * duration or returns null and the user gets asked.
 */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5, quarter: 0.25,
};

const HOUR_UNIT = /^(h|hr|hrs|hour|hours)$/;
const MIN_UNIT = /^(m|min|mins|minute|minutes)$/;

function toNumber(token: string): number | null {
  if (/^\d+(\.\d+)?$/.test(token)) return parseFloat(token);
  return NUMBER_WORDS[token] ?? null;
}

/**
 * Returns whole minutes, or null when no duration is stated.
 * Handles: "4 hours", "4h", "1.5 hrs", "90 minutes", "2h30m", "an hour and a
 * half", "half an hour", "45 mins", "for four hours".
 */
export function parseDuration(input: string): number | null {
  const text = input.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;

  // Compact forms first: "2h30m", "90m", "3h", "2 hours and 30 minutes".
  //
  // The minutes part has to allow an "and" between: without it this matched
  // just the "2 hours" of "2 hours and 30 minutes" and returned early, quietly
  // dropping the half hour.
  const compact = text.match(
    /(?:^|\s)(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?(?:\s*(?:and\s+)?(\d+)\s*m(?:ins?|inutes?)?)?(?=\s|$)/,
  );
  if (compact) {
    const minutes = parseFloat(compact[1]) * 60 + (compact[2] ? parseInt(compact[2], 10) : 0);
    if (minutes > 0) return Math.round(minutes);
  }

  // "30m" / "45mins" -> "30 m" so the token pass sees the unit on its own.
  const tokens = text.replace(/(\d)\s*([a-z])/g, "$1 $2").split(" ");
  let total = 0;

  const FILLER = ["and", "for", "of", "about", "around", "roughly", "an", "a"];

  for (let i = 0; i < tokens.length; i++) {
    const unit = tokens[i];
    const isHour = HOUR_UNIT.test(unit);
    const isMin = MIN_UNIT.test(unit);
    if (!isHour && !isMin) continue;

    // Look back for the quantity: "four hours", "an hour", "1.5 hours".
    // "an"/"a" only counts as 1 if nothing more specific sits behind it, so
    // "half an hour" reads as 0.5 rather than 1.
    let quantity: number | null = null;
    let article: number | null = null;
    for (let back = i - 1; back >= 0 && back >= i - 5; back--) {
      const token = tokens[back];
      if (token === "an" || token === "a") { article ??= 1; continue; }
      const value = toNumber(token);
      if (value !== null) {
        if (quantity === null) {
          quantity = value;
          // "one and a half hours": having found the fraction, keep looking
          // back for the whole number it belongs to.
          if (value < 1) continue;
        } else {
          quantity += value;
        }
        break;
      }
      if (!FILLER.includes(token)) break;
    }
    quantity ??= article ?? 1; // bare "hours" means one

    total += isHour ? quantity * 60 : quantity;

    // "an hour and a half" — a trailing fraction attached to the same unit.
    if (isHour && tokens[i + 1] === "and") {
      const fraction = [tokens[i + 2], tokens[i + 3]]
        .map((token) => toNumber(token ?? ""))
        .find((value) => value !== null && value < 1);
      if (fraction !== undefined && fraction !== null) {
        total += fraction * 60;
        i += 3;
      }
    }
  }

  if (total <= 0) return null;
  return Math.round(total);
}

/** "4h 30m" / "45m" / "2h" — compact display. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** "4 hours" / "1 hour 30 minutes" — prose, used in score explanations. */
export function formatDurationLong(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (rest) parts.push(`${rest} ${rest === 1 ? "minute" : "minutes"}`);
  return parts.join(" ") || "0 minutes";
}
