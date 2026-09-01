import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { all, get, run, closeDb } from "../src/lib/db.ts";
import { ensureSeeded } from "../src/lib/seed.ts";

/**
 * One-off import of the old SQLite database into Postgres.
 *
 *   DATABASE_URL=postgres://... npm run import:sqlite [path/to/lifescore.db]
 *
 * Safe to re-run: every insert is ON CONFLICT DO NOTHING, so a second pass adds
 * only what's missing.
 *
 * Activities are NOT copied by id. The Postgres database seeds its own taxonomy,
 * and ids are only guaranteed stable *within* a database — so every reference is
 * remapped through the activity's slug, which is the real identity. Getting this
 * wrong would silently repoint history at the wrong activity.
 */

const source = process.argv[2] ?? path.join(process.cwd(), "data", "lifescore.db");
console.log(`Reading ${source}`);

const sqlite = new DatabaseSync(source, { readOnly: true });
const read = <T>(sql: string): T[] => sqlite.prepare(sql).all() as T[];

await ensureSeeded();

// --- activities: map old id -> slug -> new id ------------------------------

const oldActivities = read<{ id: string; slug: string; name: string; parent_id: string | null;
  category: string; base_xp_per_hour: number; icon: string; keywords: string;
  scoring_version: number; origin: string }>(
  `SELECT id, slug, name, parent_id, category, base_xp_per_hour, icon, keywords,
          scoring_version, origin FROM activities`,
);

const newBySlug = new Map(
  (await all<{ id: string; slug: string }>(`SELECT id, slug FROM activities`))
    .map((row) => [row.slug, row.id]),
);

// Activities that were derived at runtime don't exist in the seed, so recreate
// them before anything references them.
let derived = 0;
for (const activity of oldActivities) {
  if (newBySlug.has(activity.slug) || activity.origin !== "derived") continue;

  const parentSlug = oldActivities.find((a) => a.id === activity.parent_id)?.slug;
  const parentId = parentSlug ? newBySlug.get(parentSlug) ?? null : null;
  const highest = (await get<{ n: number | null }>(
    `SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) AS n FROM activities WHERE id LIKE 'ACT_%'`,
  ))?.n ?? 0;
  const id = `ACT_${String(highest + 1).padStart(5, "0")}`;
  const now = new Date().toISOString();

  await run(
    `INSERT INTO activities
       (id, name, slug, parent_id, category, base_xp_per_hour, icon,
        keywords, status, scoring_version, origin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'derived', ?, ?)
     ON CONFLICT (slug) DO NOTHING`,
    id, activity.name, activity.slug, parentId, activity.category,
    activity.base_xp_per_hour, activity.icon, activity.keywords,
    activity.scoring_version, now, now,
  );
  newBySlug.set(activity.slug, id);
  derived += 1;
}

/** Old activity id -> new activity id, via slug. */
const remap = new Map<string, string>();
for (const activity of oldActivities) {
  const mapped = newBySlug.get(activity.slug);
  if (mapped) remap.set(activity.id, mapped);
}

// --- rows that carry no activity reference ---------------------------------

let users = 0;
for (const user of read<Record<string, string | number>>(`SELECT * FROM users`)) {
  await run(
    `INSERT INTO users (id, email, name, password_hash, timezone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    user.id, user.email, user.name, user.password_hash,
    user.timezone, user.created_at, user.updated_at,
  );
  users += 1;
}

let sessions = 0;
for (const row of read<Record<string, string>>(`SELECT * FROM sessions`)) {
  await run(
    `INSERT INTO sessions (id, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    row.id, row.user_id, row.expires_at, row.created_at,
  );
  sessions += 1;
}

let groups = 0;
for (const row of read<Record<string, string>>(`SELECT * FROM groups`)) {
  await run(
    `INSERT INTO groups (id, name, slug, description, invite_code, owner_id, emoji, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    row.id, row.name, row.slug, row.description, row.invite_code, row.owner_id, row.emoji, row.created_at,
  );
  groups += 1;
}

for (const row of read<Record<string, string>>(`SELECT * FROM group_members`)) {
  await run(
    `INSERT INTO group_members (group_id, user_id, role, joined_at)
     VALUES (?, ?, ?, ?) ON CONFLICT (group_id, user_id) DO NOTHING`,
    row.group_id, row.user_id, row.role, row.joined_at,
  );
}

// --- rows that reference an activity ---------------------------------------

let logs = 0;
let skipped = 0;
for (const log of read<Record<string, string | number>>(`SELECT * FROM activity_logs`)) {
  const activityId = remap.get(String(log.activity_id));
  if (!activityId) { skipped += 1; continue; }

  // xp and base_xp_per_hour are copied verbatim: an entry keeps the score it
  // was given, exactly as it would through any other re-pricing.
  await run(
    `INSERT INTO activity_logs
       (id, user_id, activity_id, raw_text, duration_minutes, xp, base_xp_per_hour,
        scoring_version, resolution_method, confidence, local_day, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    log.id, log.user_id, activityId, log.raw_text, log.duration_minutes, log.xp,
    log.base_xp_per_hour, log.scoring_version, log.resolution_method,
    log.confidence, log.local_day, log.created_at, log.updated_at,
  );
  logs += 1;
}

let memories = 0;
for (const row of read<Record<string, string | number>>(`SELECT * FROM user_activity_memory`)) {
  const activityId = remap.get(String(row.activity_id));
  if (!activityId) continue;
  await run(
    `INSERT INTO user_activity_memory (user_id, phrase, activity_id, hits, last_used)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, phrase) DO NOTHING`,
    row.user_id, row.phrase, activityId, row.hits, row.last_used,
  );
  memories += 1;
}

sqlite.close();

console.log(
  `Imported ${users} users, ${groups} groups, ${logs} activity logs, ` +
  `${memories} remembered phrases, ${sessions} sessions` +
  (derived ? `, and recreated ${derived} derived activities` : "") +
  (skipped ? `\nSkipped ${skipped} logs whose activity no longer exists.` : ""),
);

// Verify the totals survived rather than trusting the insert count.
const totals = await get<{ users: number; logs: number; xp: number }>(
  `SELECT (SELECT COUNT(*) FROM users) AS users,
          (SELECT COUNT(*) FROM activity_logs) AS logs,
          (SELECT COALESCE(SUM(xp), 0) FROM activity_logs) AS xp`,
);
console.log(`Postgres now holds ${totals?.users} users, ${totals?.logs} logs, ${totals?.xp} XP total.`);

await closeDb();
