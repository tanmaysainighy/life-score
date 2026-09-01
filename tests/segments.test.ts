import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

delete process.env.DATABASE_URL;
process.env.PGLITE_MEMORY = "1";

let splitSegments: typeof import("../src/lib/segments.ts")["splitSegments"];
let analyzeEntry: typeof import("../src/lib/activities.ts")["analyzeEntry"];
let closeDb: typeof import("../src/lib/db.ts")["closeDb"];

before(async () => {
  ({ splitSegments } = await import("../src/lib/segments.ts"));
  ({ analyzeEntry } = await import("../src/lib/activities.ts"));
  ({ closeDb } = await import("../src/lib/db.ts"));
});

after(async () => { await closeDb(); });

describe("splitting a sentence into clauses", () => {
  test("splits on the usual connectors", () => {
    assert.deepEqual(splitSegments("gym then studied"), ["gym", "studied"]);
    assert.deepEqual(splitSegments("gym, studied"), ["gym", "studied"]);
    assert.deepEqual(splitSegments("gym and studied"), ["gym", "studied"]);
  });

  test("a duration containing 'and' survives intact", () => {
    // "an hour and a half" is one duration, not two clauses.
    assert.deepEqual(splitSegments("coded for an hour and a half"), ["coded for an hour and a half"]);
    assert.deepEqual(splitSegments("ran for one and a half hours"), ["ran for one and a half hours"]);
  });

  test("a single clause comes back untouched", () => {
    assert.deepEqual(splitSegments("worked on my backend for 4 hours"), ["worked on my backend for 4 hours"]);
  });
});

describe("logging two things in one sentence", () => {
  test("separate activities become separate entries", async () => {
    const result = await analyzeEntry("USR_none", "studied for 2 hours and went running");
    assert.equal(result.status, "multi");
    if (result.status !== "multi") return;

    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].activity.slug, "studying");
    assert.equal(result.items[0].durationMinutes, 120);
    assert.equal(result.items[0].xp, 24);

    assert.equal(result.items[1].activity.slug, "running");
    // No duration was stated for the second half, so it must ask rather than
    // borrow the first half's 2 hours.
    assert.equal(result.items[1].durationMinutes, null);
    assert.equal(result.items[1].xp, null);
  });

  test("three activities in one sentence", async () => {
    const result = await analyzeEntry("USR_none", "ran 5k and did 30 minutes of yoga and read for an hour");
    assert.equal(result.status, "multi");
    if (result.status !== "multi") return;
    assert.equal(result.items.length, 3);
    assert.deepEqual(result.items.map((i) => i.activity.slug), ["running", "yoga", "reading"]);
  });

  test("a compound object is ONE activity, not two", async () => {
    // The dangerous case: splitting this would invent a second entry and
    // double the XP for a single afternoon.
    const result = await analyzeEntry("USR_none", "worked on backend and API for 4 hours");
    assert.notEqual(result.status, "multi");
    if (result.status === "ready" || result.status === "confirm") {
      assert.equal(result.activity.category, "software_development");
      assert.equal(result.durationMinutes, 240);
    }
  });

  test("one activity stays on the single path", async () => {
    const result = await analyzeEntry("USR_none", "worked on my startup backend for 4 hours");
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.activity.slug, "backend-development");
    assert.equal(result.xp, 60);
  });
});
