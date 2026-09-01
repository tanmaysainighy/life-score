import { ensureSeeded, nextActivityId } from "./seed";
import { all, get, run } from "./db";
import { normalize, tokenize, similarity, slugify, allStopwords } from "./text";
import { deriveXpRate } from "./scoring";

/**
 * Activity resolution: text in, canonical activity out.
 *
 * The cascade runs cheapest-first and stops as soon as it is confident:
 *
 *   normalize → exact alias → stemmed alias → personal memory → alias-in-text
 *             → token similarity
 *                                                                ↓ (unsure)
 *                                                          LLM classification
 *
 * Only the last step costs money or latency, and most everyday phrasings never
 * reach it. The LLM is called by `analyzeEntry` in activities.ts, not here —
 * this module is deterministic end to end.
 */

export type Activity = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  category: string;
  base_xp_per_hour: number;
  icon: string;
  keywords: string;
  scoring_version: number;
  status: string;
};

export type ResolutionMethod = "exact" | "alias" | "memory" | "keyword" | "llm" | "manual";

export type Resolution = {
  activity: Activity;
  confidence: number;
  method: ResolutionMethod;
};

// --- in-process taxonomy cache -------------------------------------------
// ~110 rows that change only when the taxonomy is edited or a new activity is
// derived, so this is loaded once and reused. Caching the *promise* means
// concurrent requests during startup share a single load rather than racing.

type CachedActivity = Activity & { tokens: Set<string> };

type Taxonomy = {
  activities: CachedActivity[];
  byId: Map<string, CachedActivity>;
  aliases: Map<string, string>;
  stemmedAliases: Map<string, string>;
};

let cache: Promise<Taxonomy> | null = null;

export function invalidateTaxonomyCache(): void {
  cache = null;
}

async function load(): Promise<Taxonomy> {
  await ensureSeeded();

  const activities = await all<Activity>(
    `SELECT id, name, slug, parent_id, category, base_xp_per_hour, icon, keywords,
            scoring_version, status
       FROM activities
      WHERE status = 'active'`,
  );
  // Ordered so the cache — and therefore every resolution — is built the same
  // way in every process.
  const aliasRows = await all<{ alias: string; activity_id: string }>(
    `SELECT a.alias, a.activity_id
       FROM activity_aliases a
       JOIN activities act ON act.id = a.activity_id
      WHERE act.status = 'active'
      ORDER BY a.alias`,
  );

  const aliases = new Map(aliasRows.map((row) => [row.alias, row.activity_id]));

  // A second index on the stemmed form, so "coded"/"coding"/"code" all hit the
  // same alias without falling through to fuzzy matching.
  const stemmedAliases = new Map<string, string>();
  for (const row of aliasRows) {
    const key = tokenize(row.alias).join(" ");
    if (key && !stemmedAliases.has(key)) stemmedAliases.set(key, row.activity_id);
  }

  const withTokens: CachedActivity[] = activities.map((activity) => ({
    ...activity,
    tokens: new Set(tokenize(`${activity.name} ${activity.slug.replace(/-/g, " ")} ${activity.keywords}`)),
  }));

  return {
    activities: withTokens,
    byId: new Map(withTokens.map((activity) => [activity.id, activity])),
    aliases,
    stemmedAliases,
  };
}

function taxonomy(): Promise<Taxonomy> {
  return (cache ??= load());
}

export async function listActivities(): Promise<Activity[]> {
  return (await taxonomy()).activities;
}

export async function getActivity(id: string): Promise<Activity | undefined> {
  return (await taxonomy()).byId.get(id);
}

// --- duration stripping ---------------------------------------------------

const DURATION_PHRASE =
  /\b(?:for\s+)?(?:\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|quarter)\s*(?:and\s+a\s+half\s*)?(?:an?\s+)?(?:h|hr|hrs|hours?|m|min|mins|minutes?)(?:\s+and\s+a\s+(?:half|quarter))?\b/gi;

/**
 * Verbs that define the activity themselves, with whatever follows being the
 * subject matter rather than the activity. Without this, "studied machine
 * learning" would score as ML engineering instead of as studying.
 *
 * These only apply when no longer alias matches at the very start of the text,
 * so a more specific opener like "read a paper" still wins.
 */
const FRAMING_VERBS: { pattern: RegExp; slug: string }[] = [
  { pattern: /^(?:studied|studying|study|revised|revising|revision)\b/, slug: "studying" },
  { pattern: /^(?:learned|learnt|learning|learn)\b/, slug: "studying" },
  { pattern: /^(?:practised|practiced|practising|practicing)\b/, slug: "practice" },
];

/** Removes duration expressions so matching sees the activity, not the clock. */
export function stripDuration(text: string): string {
  return text.replace(DURATION_PHRASE, " ").replace(/\s+/g, " ").trim();
}

/**
 * Walks the word spans of `words` and returns whatever `lookup` first matches.
 *
 * Order is latest-ending first, then longest, so the first hit is the best one
 * and the search can stop there. `anchored` restricts spans to those starting at
 * the first word, for "does the sentence *open* with a known alias?".
 */
function findSpan<T>(
  words: string[],
  lookup: (span: string) => T | undefined,
  anchored = false,
): T | undefined {
  for (let end = words.length; end > 0; end--) {
    for (let start = 0; start < end; start++) {
      if (anchored && start > 0) break;
      const span = words.slice(start, end).join(" ");
      if (span.length < 3) continue;
      const hit = lookup(span);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

// --- the cascade ----------------------------------------------------------

/** Ranked candidates by lexical similarity. Also feeds the LLM's context. */
export async function rankCandidates(
  text: string, limit = 12,
): Promise<{ activity: Activity; score: number }[]> {
  const tokens = tokenize(stripDuration(text));
  if (tokens.length === 0) return [];

  return (await taxonomy())
    .activities
    .map((activity) => ({ activity, score: similarity(tokens, activity.tokens) }))
    .filter((row) => row.score > 0.15)
    .sort((a, b) => b.score - a.score || a.activity.id.localeCompare(b.activity.id))
    .slice(0, limit);
}

/**
 * Deterministic resolution. Returns null when nothing is close enough — the
 * caller then either asks the LLM or asks the user. It never guesses.
 */
export async function resolveDeterministic(
  rawText: string, userId?: string,
): Promise<Resolution | null> {
  const stripped = stripDuration(rawText);
  const key = normalize(stripped);
  if (!key) return null;

  const { aliases, stemmedAliases, byId, activities } = await taxonomy();

  // 1. The whole phrase is a known name or alias.
  const exact = aliases.get(key);
  if (exact) {
    const activity = byId.get(exact);
    if (activity) return { activity, confidence: 0.98, method: "exact" };
  }

  // 1b. Same, allowing for word endings: "coded" -> the "coding" alias.
  const stemmedKey = tokenize(key).join(" ");
  const stemmed = stemmedKey ? stemmedAliases.get(stemmedKey) : undefined;
  if (stemmed) {
    const activity = byId.get(stemmed);
    if (activity) return { activity, confidence: 0.96, method: "exact" };
  }

  // 2. This user has described something this way before.
  //
  // Memory is keyed on tokens, not raw text, so "worked on TinyFish
  // integration" and "spent 3 hours on TinyFish" reach the same memory. It
  // improves *classification* only — scoring still comes from the shared
  // taxonomy row it points at, so nobody gets a personalised rate.
  if (userId && stemmedKey) {
    const exactMemory = await get<{ activity_id: string }>(
      `SELECT activity_id FROM user_activity_memory WHERE user_id = ? AND phrase = ?`,
      userId, stemmedKey,
    );
    if (exactMemory) {
      const activity = byId.get(exactMemory.activity_id);
      if (activity) return { activity, confidence: 0.95, method: "memory" };
    }

    const partial = await bestRememberedMatch(userId, stemmedKey);
    if (partial) {
      const activity = byId.get(partial);
      if (activity) return { activity, confidence: 0.9, method: "memory" };
    }
  }

  // 3. A known alias appears inside the sentence ("worked on backend today").
  //
  // Rather than testing all ~450 aliases against the text, look the text's own
  // word spans up in the alias map. A short sentence is a couple of dozen map
  // hits instead of hundreds of string scans, and spans are whole words by
  // construction — no risk of finding "ran" inside "drank".
  //
  // Scanning spans by latest end first, then longest, means the first hit is
  // already the winner: in "worked on my startup backend" the subject is the
  // backend, not the startup.
  const words = key.split(" ");
  // "I studied…" opens with the verb as far as this rule is concerned.
  const opener = key.replace(/^(?:i|we|just)\s+/, "");
  const openerWords = opener.split(" ");

  // A span of pure filler never names the subject from inside a longer
  // sentence: "worked"/"working" are aliases of Professional Work, but
  // "worked on my portfolio site" is about the site, so it should keep looking
  // (and ultimately ask) rather than settle for the framing verb. As the whole
  // phrase, though, "work" is a perfectly good entry — that is step 1's job.
  const bestAlias = findSpan(words, (span) => (allStopwords(span) ? undefined : aliases.get(span)));

  // 3b. A framing verb wins over the topic that follows it — unless a *longer*
  // alias also opens the sentence, which means something more specific was said
  // ("read a paper" rather than a bare "read").
  const aliasAtStart = findSpan(openerWords, (span) => (aliases.has(span) ? span : undefined), true);
  for (const { pattern, slug } of FRAMING_VERBS) {
    const match = opener.match(pattern);
    if (!match || (aliasAtStart?.length ?? 0) > match[0].length) continue;
    const activity = activities.find((candidate) => candidate.slug === slug);
    if (activity) return { activity, confidence: 0.93, method: "keyword" };
  }

  if (bestAlias) {
    const activity = byId.get(bestAlias);
    if (activity) return { activity, confidence: 0.92, method: "alias" };
  }

  // 4. Token similarity across names and keywords.
  const [top, runnerUp] = await rankCandidates(stripped, 2);
  if (top) {
    // A clear winner is worth more than a narrow one.
    const margin = runnerUp ? top.score - runnerUp.score : top.score;
    const confidence = Math.min(0.97, top.score * 1.1 + Math.min(0.08, margin));
    if (confidence >= 0.7) {
      return { activity: top.activity, confidence: Number(confidence.toFixed(2)), method: "keyword" };
    }
  }

  return null;
}

// --- personal memory ------------------------------------------------------

/**
 * One user's memory of how they phrase things. Stored as stemmed tokens so
 * filler words and word endings don't stop a later match.
 */
async function bestRememberedMatch(userId: string, stemmedKey: string): Promise<string | null> {
  const wanted = new Set(stemmedKey.split(" ").filter(Boolean));
  if (wanted.size === 0) return null;

  const rows = await all<{ phrase: string; activity_id: string; hits: number }>(
    `SELECT phrase, activity_id, hits FROM user_activity_memory
      WHERE user_id = ? ORDER BY hits DESC, last_used DESC LIMIT 200`,
    userId,
  );

  let best: { activityId: string; overlap: number; hits: number } | null = null;
  for (const row of rows) {
    const remembered = new Set(row.phrase.split(" ").filter(Boolean));
    if (remembered.size === 0) continue;

    // One phrase must fully contain the other: "tinyfish" matches a memory of
    // "tinyfish integration", but "tinyfish" and "backend deploy" never match.
    const smaller = wanted.size <= remembered.size ? wanted : remembered;
    const larger = smaller === wanted ? remembered : wanted;
    if (![...smaller].every((token) => larger.has(token))) continue;

    if (!best || smaller.size > best.overlap || (smaller.size === best.overlap && row.hits > best.hits)) {
      best = { activityId: row.activity_id, overlap: smaller.size, hits: row.hits };
    }
  }
  return best?.activityId ?? null;
}

/** Remembers "this phrasing means that activity" for this user only. */
export async function rememberPhrase(userId: string, rawText: string, activityId: string): Promise<void> {
  const phrase = tokenize(stripDuration(rawText)).join(" ");
  if (!phrase || phrase.length > 120) return;
  await run(
    `INSERT INTO user_activity_memory (user_id, phrase, activity_id, hits, last_used)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT (user_id, phrase) DO UPDATE SET
       activity_id = excluded.activity_id,
       hits = user_activity_memory.hits + 1,
       last_used = excluded.last_used`,
    userId, phrase, activityId, new Date().toISOString(),
  );
}

// --- deriving new canonical activities ------------------------------------

/**
 * Creates a canonical activity that didn't exist yet, pricing it from its
 * neighbours rather than from anyone's opinion.
 *
 * Returns null when the neighbourhood is too thin to price confidently; the
 * caller then files it as a proposal for review instead of scoring it.
 */
export async function deriveActivity(
  name: string,
  parentId: string,
  neighbourIds: string[],
): Promise<Activity | null> {
  const { byId, activities } = await taxonomy();
  const parent = byId.get(parentId);
  if (!parent) return null;

  const siblingRows = await all<{ base_xp_per_hour: number }>(
    `SELECT base_xp_per_hour FROM activities WHERE parent_id = ? AND status = 'active'`,
    parentId,
  );
  const siblings = siblingRows.map((row) => row.base_xp_per_hour);

  const neighbours = neighbourIds
    .map((id) => byId.get(id)?.base_xp_per_hour)
    .filter((rate): rate is number => typeof rate === "number");

  const rate = deriveXpRate([...siblings, ...neighbours, parent.base_xp_per_hour]);
  if (rate === null) return null;

  const slug = slugify(name);
  const existing = activities.find((activity) => activity.slug === slug);
  if (existing) return existing;

  const id = await nextActivityId();
  const now = new Date().toISOString();

  await run(
    `INSERT INTO activities
       (id, name, slug, parent_id, category, base_xp_per_hour, icon,
        keywords, status, scoring_version, origin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'derived', ?, ?)`,
    id, name, slug, parentId, parent.category, rate, parent.icon,
    normalize(name), parent.scoring_version, now, now,
  );
  await run(
    `INSERT INTO activity_aliases (alias, activity_id, source, created_at)
     VALUES (?, ?, 'llm', ?) ON CONFLICT (alias) DO NOTHING`,
    normalize(name), id, now,
  );

  invalidateTaxonomyCache();
  return (await getActivity(id)) ?? null;
}
