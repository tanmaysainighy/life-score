import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

// In-memory Postgres, and no model: everything asserted here must come from the
// deterministic cascade alone. A phrase that only works because the LLM guessed
// right isn't a property of the app — it's weather.
delete process.env.DATABASE_URL;
delete process.env.GROQ_API_KEY;
process.env.PGLITE_MEMORY = "1";

let resolver: typeof import("../src/lib/resolver.ts");
let activities: typeof import("../src/lib/activities.ts");
let db: typeof import("../src/lib/db.ts");

before(async () => {
  db = await import("../src/lib/db.ts");
  resolver = await import("../src/lib/resolver.ts");
  activities = await import("../src/lib/activities.ts");
  await resolver.listActivities();
});

after(async () => {
  await db.closeDb();
});

/**
 * The phrasings people actually type. Every one of these was wrong, or fell
 * through to the model, at some point — several of them confidently wrong,
 * which is the expensive kind.
 */
const EXPECTED: [string, string][] = [
  // --- the two that started this ------------------------------------------
  ["worked on my project for 2 hours", "personal-project"],
  ["worked on my portfolio", "personal-project"],
  ["worked on my side project", "personal-project"],
  ["built my portfolio site", "personal-project"],
  ["worked on my app for 2 hours", "personal-project"],
  ["worked on my website", "personal-project"],

  // "project" used to mean client work for everybody; now only the compound does
  ["did a client project", "freelancing"],
  ["worked on a client project for 4 hours", "freelancing"],
  ["client work for 2 hours", "freelancing"],
  ["my startup project", "startup-work"],
  ["worked on my startup for 3 hours", "startup-work"],

  // --- filler words that are also real activities --------------------------
  ["work for 2 hours", "professional-work"],
  ["working", "professional-work"],
  ["did some work", "professional-work"],
  ["office work for 8 hours", "professional-work"],
  ["commuted to office", "commuting"],

  // --- software ------------------------------------------------------------
  ["coded for 3 hours", "software-development"],
  ["debugged an issue for 1 hour", "debugging"],
  ["fixed a bug", "debugging"],
  ["wrote tests for the api", "testing"],
  ["refactored the backend", "backend-development"],
  ["deployed to production", "devops"],
  ["reviewed a PR", "code-review"],
  ["worked on backend for 2 hours", "backend-development"],

  // --- learning ------------------------------------------------------------
  ["worked on my assignment", "studying"],
  ["worked on my thesis", "research"],
  ["watched a lecture", "online-course"],
  ["did leetcode for an hour", "dsa-practice"],
  ["read a book for 30 minutes", "reading"],

  // --- body ----------------------------------------------------------------
  ["went to the gym", "gym"],
  ["ran 5k", "running"],
  ["cycled to college", "cycling"],
  ["did yoga for 30 minutes", "yoga"],

  // --- everything else a day contains --------------------------------------
  ["cooked dinner", "cooking"],
  ["had dinner", "eating"],
  ["brushed my teeth", "personal-care"],
  ["paid my bills", "personal-finance"],
  ["played valorant for an hour", "gaming"],
  ["had a team meeting for an hour", "meetings"],
  ["did a client call", "meetings"],
  ["replied to emails", "admin-email"],
  ["attended a meetup", "networking"],
  ["made a reel", "content-creation"],
  ["prepared for interviews", "interview-prep"],
  ["slept for 8 hours", "sleep"],
];

describe("what the resolver makes of a real day", () => {
  for (const [phrase, slug] of EXPECTED) {
    test(`"${phrase}" -> ${slug}`, async () => {
      const resolution = await resolver.resolveDeterministic(phrase, "USR_corpus");
      assert.ok(resolution, `"${phrase}" should not need the model`);
      assert.equal(resolution.activity.slug, slug);
      assert.ok(
        resolution.confidence >= activities.CONFIRM_CONFIDENCE,
        `"${phrase}" resolved too weakly to offer (${resolution.confidence})`,
      );
    });
  }

  test("things that genuinely aren't activities are not forced into one", async () => {
    // Inventing an activity here would be worse than asking: the whole scoring
    // model rests on entries meaning what they say.
    for (const phrase of ["drank water", "did nothing", "asdfghjkl"]) {
      assert.equal(
        await resolver.resolveDeterministic(phrase, "USR_corpus"), null,
        `"${phrase}" should be asked about, not guessed`,
      );
    }
  });
});

describe("one sentence, several activities", () => {
  async function slugsOf(text: string): Promise<string[]> {
    const result = await activities.analyzeEntry("USR_corpus", text);
    if (result.status === "multi") return result.items.map((item) => item.activity.slug);
    return "activity" in result ? [result.activity.slug] : [];
  }

  const SPLITS: [string, string[]][] = [
    ["studied for 2 hours and went running", ["studying", "running"]],
    ["gym and read for 30 minutes", ["gym", "reading"]],
    ["cooked and cleaned", ["cooking", "cleaning"]],
    ["did yoga and meditated", ["yoga", "meditation"]],
    ["ran 5k and did 30 minutes of yoga", ["running", "yoga"]],
    ["read a book and went to sleep", ["reading", "sleep"]],
    ["went to the gym, then studied for 2 hours", ["gym", "studying"]],
    ["coded for 2 hours, went for a walk, then cooked dinner",
      ["software-development", "walking", "cooking"]],
  ];

  for (const [text, slugs] of SPLITS) {
    test(`"${text}" is ${slugs.length} entries`, async () => {
      assert.deepEqual(await slugsOf(text), slugs);
    });
  }

  const SINGLES: [string, string][] = [
    // A compound object names one activity and a part of it — splitting these
    // would invent an entry and double the XP for one afternoon.
    ["worked on backend and API for 4 hours", "backend-development"],
    // "and" inside a duration is not a connector.
    ["studied for 2 hours and 30 minutes", "studying"],
    ["read for an hour and a half", "reading"],
  ];

  for (const [text, slug] of SINGLES) {
    test(`"${text}" stays one entry`, async () => {
      assert.deepEqual(await slugsOf(text), [slug]);
    });
  }

  test("a split entry keeps each clause's own duration", async () => {
    const result = await activities.analyzeEntry("USR_corpus", "studied for 2 hours and ran for 30 minutes");
    assert.equal(result.status, "multi");
    if (result.status !== "multi") return;
    assert.deepEqual(
      result.items.map((item) => [item.activity.slug, item.durationMinutes]),
      [["studying", 120], ["running", 30]],
    );
  });
});
