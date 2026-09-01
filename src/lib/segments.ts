/**
 * Splitting one sentence into separate activities.
 *
 * "studied for 2 hours and went running" is two things you did. But
 * "worked on backend and API for 4 hours" is one thing with a compound object,
 * and treating it as two would invent an entry you never logged. So the split
 * is proposed here and only *accepted* by the caller once both halves have
 * resolved to something plausible — see `analyzeEntry`.
 */

// A duration must survive the split, so `and` is only a connector when the
// rest of one isn't what follows it: "an hour and a half", and equally
// "2 hours and 30 minutes", are single durations rather than two clauses.
const DURATION_TAIL =
  /a\s+half\b|a\s+quarter\b|half\b|quarter\b|\d+\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\b/;

const CONNECTOR = new RegExp(
  String.raw`\s*(?:,\s*(?:and\s+|then\s+|also\s+)?|\s+and\s+(?!${DURATION_TAIL.source})|\s+then\s+|\s+also\s+|\s*&\s*|\s*\+\s*)`,
  "gi",
);

const MIN_SEGMENT = 3;

/**
 * Candidate clauses, in the order they were written. Returns a single-element
 * array when there's nothing to split, so callers can treat both cases alike.
 */
export function splitSegments(text: string): string[] {
  const parts = text
    .split(CONNECTOR)
    .map((part) => part.trim().replace(/^(?:i|then|also|and)\s+/i, "").trim())
    .filter((part) => part.length >= MIN_SEGMENT);

  return parts.length > 1 ? parts : [text.trim()];
}
