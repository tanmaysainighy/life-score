import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseDuration, formatDuration, formatDurationLong } from "../src/lib/duration.ts";

describe("duration parsing", () => {
  const cases: [string, number | null][] = [
    ["Worked on my AI agent for 4 hours", 240],
    ["coded for 3 hours", 180],
    ["studied ML for 2 hours", 120],
    ["ran for 45 minutes", 45],
    ["gym 90 mins", 90],
    ["1.5 hours of reading", 90],
    ["2h30m of backend work", 150],
    ["3h deep work", 180],
    ["worked out for an hour", 60],
    ["read for half an hour", 30],
    ["meditated for 20 min", 20],
    ["four hours on the backend", 240],
    ["an hour and a half of piano", 90],
    ["coded for an hour and a half", 90],
    ["ran for one and a half hours", 90],
    ["two and a half hours of gym", 150],
    ["30m standup", 30],
  ];

  for (const [input, expected] of cases) {
    test(`"${input}" -> ${expected}`, () => {
      assert.equal(parseDuration(input), expected);
    });
  }

  test("returns null rather than guessing when no duration is stated", () => {
    assert.equal(parseDuration("Had a productive afternoon"), null);
    assert.equal(parseDuration("worked on my startup"), null);
    assert.equal(parseDuration("went for a run"), null);
    assert.equal(parseDuration(""), null);
  });

  test("formatting round-trips sensibly", () => {
    assert.equal(formatDuration(240), "4h");
    assert.equal(formatDuration(45), "45m");
    assert.equal(formatDuration(150), "2h 30m");
    assert.equal(formatDurationLong(240), "4 hours");
    assert.equal(formatDurationLong(90), "1 hour 30 minutes");
  });
});
