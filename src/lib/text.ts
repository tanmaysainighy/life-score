/**
 * Text normalisation and lexical matching.
 *
 * This is the machinery that lets "coded for 3 hours", "programmed for 3 hours"
 * and "wrote code for 3 hours" all land on the same canonical activity without
 * an LLM call.
 */

const STOPWORDS = new Set([
  "a", "an", "and", "the", "for", "of", "on", "in", "to", "my", "me", "i", "was",
  "were", "is", "am", "at", "it", "its", "this", "that", "with", "some", "did",
  "do", "doing", "done", "spent", "spend", "worked", "work", "working", "today",
  "yesterday", "morning", "afternoon", "evening", "night", "about", "around",
  "just", "then", "been", "have", "had", "got", "up", "out", "off", "over", "all",
  "hour", "hours", "hr", "hrs", "minute", "minutes", "min", "mins", "h", "m",
]);

/**
 * True when every word is filler. Such a phrase carries no subject of its own,
 * so it can name an activity only when it *is* the whole entry.
 */
export function allStopwords(phrase: string): boolean {
  const words = phrase.split(" ").filter(Boolean);
  return words.length > 0 && words.every((word) => STOPWORDS.has(word));
}

/** Lowercase, strip punctuation, collapse whitespace. Used for alias keys. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9+#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Crude suffix stemmer — enough to tie "coding"/"coded"/"code" together. */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  for (const suffix of ["ing", "ings", "ed", "es", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      let base = word.slice(0, -suffix.length);
      // "coding" -> "cod" -> "code";  "running" -> "runn" -> "run"
      if (suffix === "ing" || suffix === "ed") {
        if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
          base = base.slice(0, -1);
        } else if (!/[aeiou]$/.test(base) && /[^aeiou][aeiou][^aeiouwxy]$/.test(base)) {
          base = base + "e";
        }
      }
      return base;
    }
  }
  return word;
}

/** Normalize → split → drop stopwords → stem. */
export function tokenize(input: string): string[] {
  return normalize(input)
    .split(" ")
    .filter((word) => word.length > 1 && !STOPWORDS.has(word) && !/^\d+$/.test(word))
    .map(stem);
}

/**
 * How well a query's tokens are covered by a candidate's tokens, 0..1.
 *
 * Coverage of the *candidate* is weighted in too, so a one-word query matching a
 * one-word activity scores higher than the same query matching a ten-word blob.
 */
export function similarity(queryTokens: string[], candidateTokens: Set<string>): number {
  if (queryTokens.length === 0 || candidateTokens.size === 0) return 0;

  let matched = 0;
  for (const token of new Set(queryTokens)) {
    if (candidateTokens.has(token)) matched += 1;
    else if ([...candidateTokens].some((c) => c.length > 4 && token.length > 4 && (c.startsWith(token) || token.startsWith(c)))) {
      matched += 0.6; // partial: "database" vs "databases", "front" vs "frontend"
    }
  }
  if (matched === 0) return 0;

  const queryCoverage = matched / new Set(queryTokens).size;
  const candidateCoverage = matched / candidateTokens.size;
  return 0.75 * queryCoverage + 0.25 * candidateCoverage;
}

/** Deterministic slug from free text. */
export function slugify(input: string): string {
  return normalize(input).replace(/\s+/g, "-").slice(0, 60) || "activity";
}
