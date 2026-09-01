import { all, run, get, transaction, closeDb } from "../src/lib/db.ts";
import { ensureSeeded } from "../src/lib/seed.ts";

/**
 * Wipes every account and everything belonging to one, leaving a clean install.
 *
 *   npm run reset -- --yes
 *
 * The activity taxonomy is deliberately kept: it is product configuration, not
 * user data, and re-seeding it is what makes a fresh database useful. Deleting
 * order follows the foreign keys inward so nothing is orphaned.
 *
 * Requires --yes because there is no undo. Takes DATABASE_URL from .env like
 * every other script, so double-check which database that points at.
 */

if (!process.argv.includes("--yes")) {
  console.error(
    "\nThis deletes every account, activity log, group and remembered phrase.\n" +
    "There is no undo. Re-run with --yes if that is what you want:\n\n" +
    "  npm run reset -- --yes\n",
  );
  process.exit(1);
}

const target = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/:[^:@/]+@/, ":****@")
  : "local (PGlite, ./data/pgdata)";
console.log(`\nResetting: ${target}`);

const before = await counts();

// Children first: activity_logs and memory reference both users and activities.
await transaction(async () => {
  for (const table of [
    "user_activity_memory",
    "activity_logs",
    "user_achievements",
    "group_members",
    "groups",
    "sessions",
    "users",
  ]) {
    // user_achievements was dropped from the schema; skip it if absent.
    const exists = await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_name = ?`, table,
    );
    if (!exists?.n) continue;
    await run(`DELETE FROM ${table}`);
  }

  // Activities derived at runtime came from real usage, so they go too; the
  // seeded taxonomy stays and is reapplied below.
  await run(`DELETE FROM activity_aliases WHERE source <> 'seed'`);
  await run(`DELETE FROM activities WHERE origin = 'derived'`);
});

await ensureSeeded();
const after = await counts();

console.log("");
for (const key of Object.keys(before)) {
  console.log(`  ${key.padEnd(22)} ${String(before[key]).padStart(5)} → ${after[key]}`);
}
console.log("\nClean install. The taxonomy is intact; sign up to start.\n");

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ["users", "sessions", "activity_logs", "groups", "user_activity_memory", "activities"]) {
    out[t] = (await all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))[0].n;
  }
  return out;
}

await closeDb();
