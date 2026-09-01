import { all, get, run, transaction } from "./db";
import { flattenTaxonomy } from "./taxonomy";
import { normalize } from "./text";

export const CURRENT_SCORING_VERSION = 1;

/** The highest ACT_ number currently in use. */
async function highestActivityNumber(): Promise<number> {
  const row = await get<{ n: number | null }>(
    `SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) AS n FROM activities WHERE id LIKE 'ACT_%'`,
  );
  return row?.n ?? 0;
}

/**
 * The next free ACT_ id.
 *
 * Ids must never be derived from position in the taxonomy: inserting an
 * activity in the middle would shift every id after it, and `activity_logs`
 * references activities by id — so history would silently repoint to the wrong
 * activity. An existing slug always keeps the id it was first given.
 */
export async function nextActivityId(): Promise<string> {
  return `ACT_${String((await highestActivityNumber()) + 1).padStart(5, "0")}`;
}

/** `(?, ?)` × n, comma separated — one VALUES list for a multi-row insert. */
const repeat = (template: string, count: number) =>
  Array.from({ length: count }, () => template).join(", ");

/**
 * Loads the canonical taxonomy into the database. Idempotent: activities are
 * keyed by slug, so running it again refreshes names/keywords without creating
 * duplicates and without touching user-derived activities or existing logs.
 */
export async function seedTaxonomy(): Promise<void> {
  const rows = flattenTaxonomy();
  if (rows.length === 0) return;
  const now = new Date().toISOString();

  // Keep the id an activity already has; only genuinely new slugs get a new one.
  const existingRows = await all<{ id: string; slug: string }>(`SELECT id, slug FROM activities`);
  const existing = new Map(existingRows.map((row) => [row.slug, row.id]));

  let counter = await highestActivityNumber();
  const idFor = new Map<string, string>();
  for (const row of rows) {
    idFor.set(row.slug, existing.get(row.slug) ?? `ACT_${String(++counter).padStart(5, "0")}`);
  }

  // The activity's own name is always an alias, plus any declared synonyms.
  const aliasPairs = new Map<string, string>();
  for (const row of rows) {
    for (const alias of [row.name, row.slug.replace(/-/g, " "), ...row.aliases]) {
      const key = normalize(alias);
      if (key && !aliasPairs.has(key)) aliasPairs.set(key, idFor.get(row.slug)!);
    }
  }

  // Two statements rather than ~550. Inserting row by row costs a network
  // round trip each, which on hosted Postgres turned every boot into a
  // multi-second stall — this runs on every start, not just an empty database.
  await transaction(async () => {
    await run(
      `INSERT INTO activities
         (id, name, slug, parent_id, category, base_xp_per_hour, icon,
          keywords, status, scoring_version, origin, created_at, updated_at)
       VALUES ${repeat("(?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'seed', ?, ?)", rows.length)}
       ON CONFLICT (slug) DO UPDATE SET
         name = excluded.name,
         parent_id = excluded.parent_id,
         category = excluded.category,
         base_xp_per_hour = excluded.base_xp_per_hour,
         icon = excluded.icon,
         keywords = excluded.keywords,
         scoring_version = excluded.scoring_version,
         updated_at = excluded.updated_at`,
      ...rows.flatMap((row) => [
        idFor.get(row.slug)!, row.name, row.slug,
        row.parentSlug ? idFor.get(row.parentSlug)! : null,
        row.category, row.xp, row.icon, row.keywords,
        CURRENT_SCORING_VERSION, now, now,
      ]),
    );

    await run(
      `INSERT INTO activity_aliases (alias, activity_id, source, created_at)
       VALUES ${repeat("(?, ?, 'seed', ?)", aliasPairs.size)}
       ON CONFLICT (alias) DO NOTHING`,
      ...[...aliasPairs].flatMap(([alias, id]) => [alias, id, now]),
    );
  });
}

let seeding: Promise<void> | null = null;

/**
 * Runs once per process.
 *
 * This applies the taxonomy on *every* boot, not just an empty database. That's
 * what makes deploying a taxonomy change work: seeding is an upsert keyed by
 * slug, ids of existing activities never move, and historical logs keep the
 * rate they were scored at. Skipping when rows already exist would mean new
 * activities silently never reached production.
 */
export function ensureSeeded(): Promise<void> {
  return (seeding ??= seedTaxonomy());
}
