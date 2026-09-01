import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeStreak } from "../src/lib/streak.ts";
import { addDays, startOfWeek, daysBetween, localDay } from "../src/lib/dates.ts";

describe("streaks", () => {
  test("counts consecutive days ending today", () => {
    const result = computeStreak(["2026-08-14", "2026-08-15", "2026-08-16"], "2026-08-16");
    assert.equal(result.current, 3);
    assert.equal(result.atRisk, false);
  });

  test("survives today being empty, and says so", () => {
    const result = computeStreak(["2026-08-14", "2026-08-15"], "2026-08-16");
    assert.equal(result.current, 2);
    assert.equal(result.atRisk, true);
  });

  test("a missed day resets it", () => {
    const result = computeStreak(["2026-08-10", "2026-08-11", "2026-08-14"], "2026-08-16");
    assert.equal(result.current, 0);
    assert.equal(result.longest, 2);
  });

  test("longest streak is remembered after a reset", () => {
    const result = computeStreak(
      ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-08-16"],
      "2026-08-16",
    );
    assert.equal(result.current, 1);
    assert.equal(result.longest, 4);
  });

  test("no qualifying days means no streak", () => {
    assert.deepEqual(computeStreak([], "2026-08-16"), { current: 0, longest: 0, atRisk: false });
  });

  test("crosses month and year boundaries", () => {
    const result = computeStreak(["2025-12-30", "2025-12-31", "2026-01-01"], "2026-01-01");
    assert.equal(result.current, 3);
  });
});

describe("calendar helpers", () => {
  test("day arithmetic crosses boundaries", () => {
    assert.equal(addDays("2026-02-28", 1), "2026-03-01"); // 2026 is not a leap year
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
    assert.equal(daysBetween("2026-08-10", "2026-08-16"), 6);
  });

  test("weeks start on Monday", () => {
    assert.equal(startOfWeek("2026-08-16"), "2026-08-10"); // a Sunday
    assert.equal(startOfWeek("2026-08-10"), "2026-08-10"); // the Monday itself
  });

  test("local day respects the user's timezone", () => {
    // 23:30 UTC is already the next day in Kolkata (+5:30).
    const instant = new Date("2026-08-16T23:30:00Z");
    assert.equal(localDay(instant, "UTC"), "2026-08-16");
    assert.equal(localDay(instant, "Asia/Kolkata"), "2026-08-17");
  });

  test("an unknown timezone falls back rather than throwing", () => {
    assert.equal(localDay(new Date("2026-08-16T12:00:00Z"), "Not/AZone"), "2026-08-16");
  });
});
