import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { scoreActivity, explainScore, deriveXpRate, MIN_XP_RATE, MAX_XP_RATE } from "../src/lib/scoring.ts";
import { getLevelFromXP, getLevelProgress } from "../src/lib/levels.ts";

describe("scoring engine", () => {
  test("rate × hours, the documented examples", () => {
    assert.equal(scoreActivity({ baseXpPerHour: 15, durationMinutes: 60 }), 15);
    assert.equal(scoreActivity({ baseXpPerHour: 15, durationMinutes: 240 }), 60);
    assert.equal(scoreActivity({ baseXpPerHour: 12, durationMinutes: 120 }), 24);
  });

  test("fractional XP rounds half-up to a whole number", () => {
    // 30 minutes of coding = 7.5 XP -> 8
    assert.equal(scoreActivity({ baseXpPerHour: 15, durationMinutes: 30 }), 8);
    assert.equal(scoreActivity({ baseXpPerHour: 15, durationMinutes: 10 }), 3); // 2.5 -> 3
    assert.equal(scoreActivity({ baseXpPerHour: 6, durationMinutes: 5 }), 1);   // 0.5 -> 1
  });

  test("is deterministic — same input, same output, every time", () => {
    const runs = Array.from({ length: 50 }, () =>
      scoreActivity({ baseXpPerHour: 14, durationMinutes: 95 }));
    assert.equal(new Set(runs).size, 1);
  });

  test("two users describing the same activity get identical XP", () => {
    const tanmay = scoreActivity({ baseXpPerHour: 15, durationMinutes: 240 });
    const aryan = scoreActivity({ baseXpPerHour: 15, durationMinutes: 240 });
    assert.equal(tanmay, aryan);
  });

  test("zero duration scores zero", () => {
    assert.equal(scoreActivity({ baseXpPerHour: 15, durationMinutes: 0 }), 0);
  });

  test("rejects nonsense input rather than producing a number", () => {
    assert.throws(() => scoreActivity({ baseXpPerHour: NaN, durationMinutes: 60 }));
    assert.throws(() => scoreActivity({ baseXpPerHour: 15, durationMinutes: -60 }));
  });

  test("explanation matches the score it explains", () => {
    const explanation = explainScore({ baseXpPerHour: 15, durationMinutes: 240 });
    assert.equal(explanation.xp, 60);
    assert.equal(explanation.formula, "4 h × 15 XP/h = 60 XP");
  });
});

describe("derived rates for new activities", () => {
  test("uses the median of its neighbours", () => {
    // Circuit 14, CAD 12, Hardware 14 -> 14
    assert.equal(deriveXpRate([14, 12, 14]), 14);
  });

  test("an outlier neighbour cannot drag the rate", () => {
    assert.equal(deriveXpRate([12, 13, 14, 200]), 14);
  });

  test("clamps into the range the taxonomy actually uses", () => {
    assert.ok(deriveXpRate([100, 100, 100])! <= MAX_XP_RATE);
    assert.ok(deriveXpRate([0.1, 0.2, 0.3])! >= MIN_XP_RATE);
  });

  test("refuses to guess from a single neighbour", () => {
    assert.equal(deriveXpRate([14]), null);
    assert.equal(deriveXpRate([]), null);
  });
});

describe("levels", () => {
  test("matches the published progression", () => {
    assert.equal(getLevelFromXP(0), 1);
    assert.equal(getLevelFromXP(99), 1);
    assert.equal(getLevelFromXP(100), 2);
    assert.equal(getLevelFromXP(249), 2);
    assert.equal(getLevelFromXP(250), 3);
    assert.equal(getLevelFromXP(500), 4);
    assert.equal(getLevelFromXP(800), 5);
  });

  test("crossing a threshold always advances exactly one level", () => {
    // Walked through the public surface rather than the private threshold
    // table, so the curve can be retuned without rewriting the test.
    let previousFloor = -1;
    for (let xp = 0; xp <= 60_000; xp += 97) {
      const progress = getLevelProgress(xp);
      assert.ok(progress.levelFloor >= previousFloor, "floors must not go backwards");
      previousFloor = progress.levelFloor;
      if (progress.nextLevelAt === null) continue;

      assert.equal(getLevelFromXP(progress.nextLevelAt), progress.level + 1);
      assert.equal(getLevelFromXP(progress.nextLevelAt - 1), progress.level);
    }
  });

  test("progress adds up", () => {
    const progress = getLevelProgress(400);
    assert.equal(progress.level, 3);
    assert.equal(progress.levelFloor, 250);
    assert.equal(progress.nextLevelAt, 500);
    assert.equal(progress.xpIntoLevel, 150);
    assert.equal(progress.xpToNext, 100);
    assert.equal(progress.percent, 60);
  });

  test("negative or junk XP is treated as zero", () => {
    assert.equal(getLevelFromXP(-500), 1);
    assert.equal(getLevelProgress(-10).percent, 0);
  });
});
