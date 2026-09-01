import { seedTaxonomy } from "../src/lib/seed.ts";
import { get, closeDb } from "../src/lib/db.ts";

/**
 * Re-applies the canonical taxonomy from taxonomy.ts.
 *
 * The app also does this on every boot, so this is mainly for applying a change
 * without restarting. Safe to run any time: activities are keyed by slug, ids
 * never move, and existing logs keep the rate they were scored at.
 *
 *   npm run seed
 */
await seedTaxonomy();

const activities = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM activities`))?.n ?? 0;
const aliases = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM activity_aliases`))?.n ?? 0;
console.log(`Seeded ${activities} canonical activities and ${aliases} aliases.`);

await closeDb();
