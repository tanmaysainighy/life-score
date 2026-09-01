import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

// In-process, in-memory Postgres. Deleting DATABASE_URL matters: without it a
// developer with that variable exported would run this suite — including its
// writes — against a real database.
delete process.env.DATABASE_URL;
process.env.PGLITE_MEMORY = "1";

let db: typeof import("../src/lib/db.ts");
let activities: typeof import("../src/lib/activities.ts");
let resolver: typeof import("../src/lib/resolver.ts");
let queries: typeof import("../src/lib/queries.ts");
let groups: typeof import("../src/lib/groups.ts");
let validation: typeof import("../src/lib/validation.ts");
let dates: typeof import("../src/lib/dates.ts");

const TANMAY = { id: "USR_tanmay", timezone: "UTC" };
const ARYAN = { id: "USR_aryan", timezone: "UTC" };

async function activityBySlug(slug: string) {
  return (await resolver.listActivities()).find((a) => a.slug === slug)!;
}

before(async () => {
  db = await import("../src/lib/db.ts");
  activities = await import("../src/lib/activities.ts");
  resolver = await import("../src/lib/resolver.ts");
  queries = await import("../src/lib/queries.ts");
  groups = await import("../src/lib/groups.ts");
  validation = await import("../src/lib/validation.ts");
  dates = await import("../src/lib/dates.ts");

  await resolver.listActivities(); // force schema + seed before inserting users

  const now = new Date().toISOString();
  for (const [id, name] of [[TANMAY.id, "Tanmay"], [ARYAN.id, "Aryan"]]) {
    await db.run(
      `INSERT INTO users (id, email, name, password_hash, timezone, created_at, updated_at)
       VALUES (?, ?, ?, 'x', 'UTC', ?, ?)`,
      id, `${name.toLowerCase()}@test.dev`, name, now, now,
    );
  }
});

after(async () => {
  await db.closeDb();
});

describe("logging an activity end to end", () => {
  test("stores the server-calculated XP", async () => {
    const backend = await activityBySlug("backend-development");
    const result = await activities.createEntry(TANMAY, {
      activityId: backend.id,
      durationMinutes: 240,
      rawText: "I worked on my startup backend for 4 hours.",
      method: "keyword",
    });
    assert.ok(result.ok);
    assert.equal(result.xp, 60);
  });

  test("the same activity from another user scores identically", async () => {
    const backend = await activityBySlug("backend-development");
    const result = await activities.createEntry(ARYAN, {
      activityId: backend.id,
      durationMinutes: 240,
      rawText: "Built backend APIs for 4 hours.",
      method: "keyword",
    });
    assert.ok(result.ok);
    assert.equal(result.xp, 60);
  });

  test("the row snapshots the rate and scoring version it was scored at", async () => {
    const row = await db.get<{ base_xp_per_hour: number; scoring_version: number; xp: number }>(
      `SELECT base_xp_per_hour, scoring_version, xp FROM activity_logs WHERE user_id = ? LIMIT 1`,
      TANMAY.id,
    );
    assert.equal(row?.base_xp_per_hour, 15);
    assert.equal(row?.scoring_version, 1);
    assert.equal(row?.xp, 60);
  });

  test("re-pricing the taxonomy leaves historical entries untouched", async () => {
    const backend = await activityBySlug("backend-development");
    await db.run(`UPDATE activities SET base_xp_per_hour = 13, scoring_version = 2 WHERE id = ?`, backend.id);
    resolver.invalidateTaxonomyCache();

    const historical = await db.get<{ xp: number; scoring_version: number }>(
      `SELECT xp, scoring_version FROM activity_logs WHERE user_id = ? LIMIT 1`, TANMAY.id,
    );
    assert.equal(historical?.xp, 60, "old entry must keep its original score");
    assert.equal(historical?.scoring_version, 1);

    // A new entry uses the new rate.
    const fresh = await activities.createEntry(TANMAY, {
      activityId: backend.id, durationMinutes: 60, rawText: "backend for 1 hour",
    });
    assert.ok(fresh.ok);
    assert.equal(fresh.xp, 13);

    await db.run(`UPDATE activities SET base_xp_per_hour = 15, scoring_version = 1 WHERE id = ?`, backend.id);
    resolver.invalidateTaxonomyCache();
  });

  test("editing re-scores through the engine", async () => {
    const backend = await activityBySlug("backend-development");
    const created = await activities.createEntry(ARYAN, {
      activityId: backend.id, durationMinutes: 60, rawText: "backend for 1 hour",
    });
    assert.ok(created.ok);

    const updated = await activities.updateEntry(ARYAN.id, created.id, { durationMinutes: 120 });
    assert.ok(updated.ok);
    assert.equal(updated.xp, 30);
  });

  test("deleting removes the entry and its XP", async () => {
    const backend = await activityBySlug("backend-development");
    const created = await activities.createEntry(ARYAN, {
      activityId: backend.id, durationMinutes: 30, rawText: "quick backend fix",
    });
    assert.ok(created.ok);
    const today = dates.localDay(new Date(), "UTC");
    const before = (await queries.getTotals(ARYAN.id, today)).lifetime;
    assert.ok(await activities.deleteEntry(ARYAN.id, created.id));
    const after = (await queries.getTotals(ARYAN.id, today)).lifetime;
    assert.equal(after, before - created.xp);
  });

  test("you cannot delete someone else's entry", async () => {
    const backend = await activityBySlug("backend-development");
    const created = await activities.createEntry(ARYAN, {
      activityId: backend.id, durationMinutes: 30, rawText: "backend",
    });
    assert.ok(created.ok);
    assert.equal(await activities.deleteEntry(TANMAY.id, created.id), false);
    assert.ok(await activities.deleteEntry(ARYAN.id, created.id));
  });

  test("an unknown activity id is refused", async () => {
    const result = await activities.createEntry(TANMAY, {
      activityId: "ACT_99999", durationMinutes: 60, rawText: "nope",
    });
    assert.equal(result.ok, false);
  });
});

describe("anti-gaming", () => {
  const context = { category: "software_development", minutesLoggedToday: 0, hasRecentDuplicate: false };

  test("a single entry can't exceed 24 hours", () => {
    const issue = validation.validateEntry(25 * 60, context);
    assert.equal(issue?.severity, "error");
    assert.equal(issue?.code, "duration_exceeds_day");
  });

  test('"I coded for 100 hours" is rejected outright', () => {
    assert.equal(validation.validateEntry(100 * 60, context)?.severity, "error");
  });

  test("the day can't hold more than 24 hours in total", () => {
    const issue = validation.validateEntry(120, { ...context, minutesLoggedToday: 23 * 60 });
    assert.equal(issue?.code, "day_overflow");
  });

  test("an improbable session asks rather than accuses", () => {
    const issue = validation.validateEntry(360, { ...context, category: "physical" });
    assert.equal(issue?.severity, "confirm");
    assert.equal(issue?.code, "unusually_long");
  });

  test("a repeat submission warns but can be confirmed", () => {
    const issue = validation.validateEntry(60, { ...context, hasRecentDuplicate: true });
    assert.equal(issue?.severity, "confirm");
    assert.equal(issue?.code, "possible_duplicate");
  });

  test("the server refuses an oversized entry even when asked nicely", async () => {
    const backend = await activityBySlug("backend-development");
    const result = await activities.createEntry(TANMAY, {
      activityId: backend.id, durationMinutes: 1440, rawText: "coded all day and then some",
    }, { acknowledged: true });
    // 24h alone is allowed only if the day is empty; this user has already logged.
    assert.equal(result.ok, false);
  });

  test("a normal entry passes cleanly", () => {
    assert.equal(validation.validateEntry(120, context), null);
  });
});

describe("activities the taxonomy doesn't know", () => {
  test("an unrecognised phrase resolves to nothing rather than a guess", async () => {
    assert.equal(await resolver.resolveDeterministic("quilling for 1 hour", TANMAY.id), null);
  });

  test("picking it manually teaches that user's phrasing for next time", async () => {
    const crafts = await activityBySlug("crafting");

    // What the UI does when the user chooses an activity themselves.
    const created = await activities.createEntry(TANMAY, {
      activityId: crafts.id,
      durationMinutes: 60,
      rawText: "quilling for 1 hour",
      method: "manual",
    });
    assert.ok(created.ok);

    // Same words next time now resolve on their own, with no model involved.
    const again = await resolver.resolveDeterministic("quilling for 2 hours", TANMAY.id);
    assert.ok(again, "the phrase should be remembered");
    assert.equal(again.activity.id, crafts.id);
    assert.equal(again.method, "memory");

    // ...but only for this user. Memory never leaks between accounts.
    assert.equal(await resolver.resolveDeterministic("quilling for 2 hours", ARYAN.id), null);
  });

  test("memory survives different wording of the same thing", async () => {
    const ai = await activityBySlug("ai-ml-development");

    // The spec's example: teach it once, then refer to it differently.
    const created = await activities.createEntry(TANMAY, {
      activityId: ai.id, durationMinutes: 60,
      rawText: "Worked on TinyFish integration", method: "manual",
    });
    assert.ok(created.ok);

    const later = await resolver.resolveDeterministic("Spent 3 hours on TinyFish", TANMAY.id);
    assert.ok(later, "a shorter reference to the same thing should be recognised");
    assert.equal(later.activity.id, ai.id);
    assert.equal(later.method, "memory");
  });

  test("unrelated phrases never collide in memory", async () => {
    assert.equal(await resolver.resolveDeterministic("blorptastic wibbling", TANMAY.id), null);
  });

  test("a remembered phrase still uses the one shared rate, not a personal one", async () => {
    const crafts = await activityBySlug("crafting");
    const remembered = (await resolver.resolveDeterministic("quilling for 2 hours", TANMAY.id))!;
    assert.equal(remembered.activity.base_xp_per_hour, crafts.base_xp_per_hour);

    // Tanmay's remembered phrasing and Aryan's explicit pick score identically.
    const mine = await activities.createEntry(TANMAY, {
      activityId: remembered.activity.id, durationMinutes: 120, rawText: "quilling for 2 hours",
    });
    const theirs = await activities.createEntry(ARYAN, {
      activityId: crafts.id, durationMinutes: 120, rawText: "paper craft for 2 hours",
    });
    assert.ok(mine.ok && theirs.ok);
    assert.equal(mine.xp, theirs.xp);
  });
});

describe("transactions", () => {
  test("a throw rolls the whole block back", async () => {
    const before = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM groups`))!.n;

    await assert.rejects(
      db.transaction(async () => {
        await db.run(
          `INSERT INTO groups (id, name, slug, description, invite_code, owner_id, emoji, created_at)
           VALUES ('GRP_rollback', 'Rollback', 'rollback', '', 'ROLLBACK', ?, '🧪', ?)`,
          TANMAY.id, new Date().toISOString(),
        );
        // Visible inside the transaction...
        assert.ok(await db.get(`SELECT 1 FROM groups WHERE id = 'GRP_rollback'`));
        throw new Error("boom");
      }),
      /boom/,
    );

    // ...and gone once it unwinds.
    assert.equal(await db.get(`SELECT 1 FROM groups WHERE id = 'GRP_rollback'`), undefined);
    assert.equal((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM groups`))!.n, before);
  });

  test("the connection is usable again after a rollback", async () => {
    const activities = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM activities`))!.n;
    assert.ok(activities > 0, "a failed transaction must not poison later queries");
  });

  test("a nested transaction joins the outer one rather than nesting BEGIN", async () => {
    const now = new Date().toISOString();
    await db.transaction(async () => {
      await db.transaction(async () => {
        await db.run(
          `INSERT INTO users (id, email, name, password_hash, timezone, created_at, updated_at)
           VALUES ('USR_nested', 'nested@test.dev', 'Nested', 'x', 'UTC', ?, ?)`, now, now);
      });
    });
    assert.ok(await db.get(`SELECT 1 FROM users WHERE id = 'USR_nested'`));
  });
});

describe("re-seeding an existing database", () => {
  test("is idempotent, keeps activity ids stable, and leaves history intact", async () => {
    const { seedTaxonomy } = await import("../src/lib/seed.ts");

    const before = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM activities`))!.n;
    const idsBefore = new Map(
      (await db.all<{ id: string; slug: string }>(`SELECT id, slug FROM activities`)).map((r) => [r.slug, r.id]),
    );
    const logsBefore = await db.all<{ id: string; activity_id: string; xp: number }>(
      `SELECT id, activity_id, xp FROM activity_logs ORDER BY id`,
    );

    await seedTaxonomy();
    resolver.invalidateTaxonomyCache();

    assert.equal((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM activities`))!.n, before, "no duplicates");

    for (const [slug, id] of idsBefore) {
      const now = await db.get<{ id: string }>(`SELECT id FROM activities WHERE slug = ?`, slug);
      assert.equal(now?.id, id, `${slug} changed id — existing logs would repoint`);
    }

    const logsAfter = await db.all<{ id: string; activity_id: string; xp: number }>(
      `SELECT id, activity_id, xp FROM activity_logs ORDER BY id`,
    );
    assert.deepEqual(logsAfter, logsBefore, "history must be untouched");
  });
});

describe("rest and leisure", () => {
  // A fresh user so the streak assertions aren't polluted by other tests.
  const SLEEPER = { id: "USR_sleeper", timezone: "UTC" };

  before(async () => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO users (id, email, name, password_hash, timezone, created_at, updated_at)
       VALUES (?, 'sleeper@test.dev', 'Sleeper', 'x', 'UTC', ?, ?)`,
      SLEEPER.id, now, now,
    );
  });

  test("sleep is logged, and earns nothing", async () => {
    const result = await activities.createEntry(SLEEPER, {
      activityId: (await activityBySlug("sleep")).id, durationMinutes: 480, rawText: "slept 8 hours",
    });
    assert.ok(result.ok);
    assert.equal(result.xp, 0);
  });

  test("a whole day of passive leisure does not hold a streak", async () => {
    const today = dates.localDay(new Date(), "UTC");
    // 8h of TV plus 3h of scrolling — 19 XP, comfortably over the threshold.
    await activities.createEntry(SLEEPER, {
      activityId: (await activityBySlug("watching")).id, durationMinutes: 480, rawText: "watched tv all day",
    });
    await activities.createEntry(SLEEPER, {
      activityId: (await activityBySlug("browsing")).id, durationMinutes: 180, rawText: "scrolling",
    });

    const totals = await queries.getTotals(SLEEPER.id, today);
    assert.ok(totals.today >= 10, "the XP is real and counts toward level and leaderboard");
    assert.equal((await queries.getStreak(SLEEPER.id, today)).current, 0, "but it is not showing up");
  });

  test("one real activity that same day does hold the streak", async () => {
    const today = dates.localDay(new Date(), "UTC");
    await activities.createEntry(SLEEPER, {
      activityId: (await activityBySlug("gym")).id, durationMinutes: 60, rawText: "gym for an hour",
    });
    assert.equal((await queries.getStreak(SLEEPER.id, today)).current, 1);
  });

  test("leisure XP still counts toward the leaderboard", async () => {
    const today = dates.localDay(new Date(), "UTC");
    const totals = await queries.getTotals(SLEEPER.id, today);
    // 0 (sleep) + 16 (8h TV) + 3 (3h browsing) + 20 (1h gym)
    assert.equal(totals.lifetime, 39);
  });
});

describe("groups and leaderboards", () => {
  test("creating a group makes the creator its owner and first member", async () => {
    const result = await groups.createGroup(TANMAY.id, "VIT Grind");
    assert.ok(result.ok);
    const today = dates.localDay(new Date(), "UTC");
    const mine = await queries.getUserGroups(TANMAY.id, today);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].name, "VIT Grind");
    assert.equal(mine[0].members, 1);
  });

  test("a friend can join with the invite code", async () => {
    const created = await groups.createGroup(TANMAY.id, "Startup Builders");
    assert.ok(created.ok);
    const joined = await groups.joinGroup(ARYAN.id, created.inviteCode);
    assert.ok(joined.ok);

    const board = await queries.getGroupLeaderboard(created.id, "all", dates.localDay(new Date(), "UTC"));
    assert.equal(board.length, 2);
  });

  test("a wrong invite code joins nothing", async () => {
    assert.equal((await groups.joinGroup(ARYAN.id, "NOPENOPE")).ok, false);
  });

  test("the leaderboard is ordered by server-calculated XP", async () => {
    const created = await groups.createGroup(TANMAY.id, "Leaderboard Test");
    assert.ok(created.ok);
    await groups.joinGroup(ARYAN.id, created.inviteCode);

    const board = await queries.getGroupLeaderboard(created.id, "all", dates.localDay(new Date(), "UTC"));
    for (let i = 1; i < board.length; i++) assert.ok(board[i - 1].xp >= board[i].xp);

    // Every total matches a fresh SUM straight from the database.
    for (const row of board) {
      const actual = (await db.get<{ total: number }>(
        `SELECT COALESCE(SUM(xp), 0) AS total FROM activity_logs WHERE user_id = ?`, row.user_id,
      ))!.total;
      assert.equal(row.xp, actual);
    }
  });

  test("non-members are not on a group's leaderboard", async () => {
    const created = await groups.createGroup(TANMAY.id, "Private Group");
    assert.ok(created.ok);
    const board = await queries.getGroupLeaderboard(created.id, "all", dates.localDay(new Date(), "UTC"));
    assert.equal(board.length, 1);
    assert.equal(await queries.isMember(created.id, ARYAN.id), false);
  });

  test("ownership passes on when the owner leaves", async () => {
    const created = await groups.createGroup(TANMAY.id, "Succession");
    assert.ok(created.ok);
    await groups.joinGroup(ARYAN.id, created.inviteCode);

    assert.ok((await groups.leaveGroup(TANMAY.id, created.id)).ok);
    assert.equal((await queries.getGroup(created.id))?.owner_id, ARYAN.id);
  });

  test("the last member leaving removes the group", async () => {
    const created = await groups.createGroup(TANMAY.id, "Solo");
    assert.ok(created.ok);
    assert.ok((await groups.leaveGroup(TANMAY.id, created.id)).ok);
    assert.equal(await queries.getGroup(created.id), undefined);
  });
});

describe("dashboard totals", () => {
  test("today, week and lifetime agree with the raw rows", async () => {
    const today = dates.localDay(new Date(), "UTC");
    const totals = await queries.getTotals(TANMAY.id, today);
    const raw = (await db.get<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(xp), 0) AS total, COUNT(*) AS count FROM activity_logs WHERE user_id = ?`,
      TANMAY.id,
    ))!;
    assert.equal(totals.lifetime, raw.total);
    assert.equal(totals.entries, raw.count);
    assert.equal(totals.today, raw.total, "all test entries were logged today");
  });

  test("personal memory records the phrasing without changing anyone's score", async () => {
    const phrase = await db.get<{ activity_id: string }>(
      `SELECT activity_id FROM user_activity_memory WHERE user_id = ? LIMIT 1`, TANMAY.id,
    );
    assert.ok(phrase, "phrases should be remembered");

    // The remembered activity still carries the one shared rate.
    const activity = (await resolver.getActivity(phrase.activity_id))!;
    const shared = (await db.get<{ base_xp_per_hour: number }>(
      `SELECT base_xp_per_hour FROM activities WHERE id = ?`, phrase.activity_id,
    ))!;
    assert.equal(activity.base_xp_per_hour, shared.base_xp_per_hour);
  });
});

describe("daily targets", () => {
  const OWNER = { id: "USR_targets", timezone: "UTC" };
  let today: string;

  before(async () => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO users (id, email, name, password_hash, timezone, created_at, updated_at)
       VALUES (?, 'targets@test.dev', 'Target', 'x', 'UTC', ?, ?)`,
      OWNER.id, now, now,
    );
    today = dates.localDay(new Date(), OWNER.timezone);
  });

  test("a target with nothing logged against it reads as not done", async () => {
    const reading = await activityBySlug("reading");
    await queries.setDailyTarget(OWNER.id, reading.id, 30);

    const [target] = await queries.getDailyTargets(OWNER.id, today);
    assert.equal(target.activity_id, reading.id);
    assert.equal(target.target_minutes, 30);
    assert.equal(target.done_minutes, 0);
    assert.equal(target.times, 0);
    assert.equal(target.met, false);
  });

  test("progress comes from logged entries, and partial progress is not 'met'", async () => {
    const reading = await activityBySlug("reading");
    await activities.createEntry(OWNER, { activityId: reading.id, durationMinutes: 20, rawText: "read a bit" });

    const partial = (await queries.getDailyTargets(OWNER.id, today))[0];
    assert.equal(partial.done_minutes, 20);
    assert.equal(partial.met, false, "20 of 30 minutes is not met");

    // A second entry the same day accumulates rather than replacing.
    await activities.createEntry(OWNER, { activityId: reading.id, durationMinutes: 15, rawText: "read some more" });

    const done = (await queries.getDailyTargets(OWNER.id, today))[0];
    assert.equal(done.done_minutes, 35);
    assert.equal(done.times, 2);
    assert.equal(done.met, true);
  });

  test("a target with no minutes goal is met by doing it at all", async () => {
    const meditation = await activityBySlug("meditation");
    await queries.setDailyTarget(OWNER.id, meditation.id, null);

    const before = (await queries.getDailyTargets(OWNER.id, today))
      .find((target) => target.activity_id === meditation.id)!;
    assert.equal(before.met, false);

    await activities.createEntry(OWNER, { activityId: meditation.id, durationMinutes: 5, rawText: "sat quietly" });

    const after = (await queries.getDailyTargets(OWNER.id, today))
      .find((target) => target.activity_id === meditation.id)!;
    assert.equal(after.met, true);
  });

  test("yesterday's effort does not count toward today's target", async () => {
    const yesterday = dates.addDays(today, -1);
    const progress = (await queries.getDailyTargets(OWNER.id, yesterday))
      .find((target) => target.target_minutes === 30)!;
    assert.equal(progress.done_minutes, 0, "today's entries must not leak into another day");
    assert.equal(progress.met, false);
  });

  test("another user's entries never advance your target", async () => {
    const reading = await activityBySlug("reading");
    await activities.createEntry(ARYAN, { activityId: reading.id, durationMinutes: 60, rawText: "read" });

    const mine = (await queries.getDailyTargets(OWNER.id, today))
      .find((target) => target.activity_id === reading.id)!;
    assert.equal(mine.done_minutes, 35, "still only my own 35 minutes");
  });

  test("setting the same target twice updates it instead of duplicating", async () => {
    const reading = await activityBySlug("reading");
    await queries.setDailyTarget(OWNER.id, reading.id, 120);

    const all = await queries.getDailyTargets(OWNER.id, today);
    const matching = all.filter((target) => target.activity_id === reading.id);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].target_minutes, 120);
    assert.equal(matching[0].met, false, "raising the goal reopens it");
  });

  test("removing a target takes it off the list", async () => {
    const reading = await activityBySlug("reading");
    await queries.removeDailyTarget(OWNER.id, reading.id);

    const remaining = await queries.getDailyTargets(OWNER.id, today);
    assert.ok(!remaining.some((target) => target.activity_id === reading.id));
  });
});

describe("adding activities to the middle of the taxonomy", () => {
  // The ids are sequential, so inserting an activity mid-list is the one change
  // that could renumber everything after it and silently repoint existing logs
  // to the wrong activity. This models that upgrade: a slug the database has
  // never seen appears among slugs it already has.
  test("a brand-new slug takes a fresh id and moves nobody", async () => {
    await resolver.listActivities();
    const idsBefore = new Map(
      (await db.all<{ id: string; slug: string }>(`SELECT id, slug FROM activities`))
        .map((row) => [row.slug, row.id]),
    );
    const highestBefore = Math.max(...[...idsBefore.values()].map((id) => Number(id.slice(4))));

    // Forget one leaf entirely, so re-seeding sees it as new.
    const victim = "personal-care";
    await db.run(`DELETE FROM activity_aliases WHERE activity_id = ?`, idsBefore.get(victim));
    await db.run(`DELETE FROM activities WHERE slug = ?`, victim);

    const { seedTaxonomy } = await import("../src/lib/seed.ts");
    await seedTaxonomy();
    resolver.invalidateTaxonomyCache();

    const idsAfter = new Map(
      (await db.all<{ id: string; slug: string }>(`SELECT id, slug FROM activities`))
        .map((row) => [row.slug, row.id]),
    );

    for (const [slug, id] of idsBefore) {
      if (slug === victim) continue;
      assert.equal(idsAfter.get(slug), id, `${slug} changed id — existing logs would repoint`);
    }
    assert.ok(
      Number(idsAfter.get(victim)!.slice(4)) > highestBefore,
      "the new slug should take an unused id, not one already spent",
    );
  });
});
