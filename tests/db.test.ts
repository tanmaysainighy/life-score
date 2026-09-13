import { test } from "node:test";
import assert from "node:assert/strict";
import { toPositional } from "../src/lib/db.ts";

/**
 * Every query in the app passes through toPositional, so a bug here is a bug
 * everywhere. The comment cases are the ones that previously mis-numbered:
 * a `?` inside a comment consumed a placeholder index and shifted every
 * parameter after it.
 */

test("toPositional", async (t) => {
  await t.test("numbers placeholders in order", () => {
    assert.equal(
      toPositional("SELECT * FROM t WHERE a = ? AND b = ?"),
      "SELECT * FROM t WHERE a = $1 AND b = $2",
    );
  });

  await t.test("leaves single-quoted strings alone", () => {
    assert.equal(
      toPositional("SELECT * FROM t WHERE s = 'a ? mark' AND a = ?"),
      "SELECT * FROM t WHERE s = 'a ? mark' AND a = $1",
    );
  });

  await t.test("handles a doubled quote inside a string", () => {
    assert.equal(
      toPositional("SELECT * FROM t WHERE s = 'it''s a ? mark' AND a = ?"),
      "SELECT * FROM t WHERE s = 'it''s a ? mark' AND a = $1",
    );
  });

  await t.test("leaves double-quoted identifiers alone", () => {
    assert.equal(
      toPositional('SELECT "we?rd" FROM t WHERE a = ?'),
      'SELECT "we?rd" FROM t WHERE a = $1',
    );
  });

  await t.test("skips line comments", () => {
    assert.equal(
      toPositional("SELECT * FROM t -- was this ? once\n WHERE a = ?"),
      "SELECT * FROM t -- was this ? once\n WHERE a = $1",
    );
  });

  await t.test("skips block comments", () => {
    assert.equal(
      toPositional("SELECT /* ? legacy ? */ * FROM t WHERE a = ?"),
      "SELECT /* ? legacy ? */ * FROM t WHERE a = $1",
    );
  });

  await t.test("skips nested block comments", () => {
    assert.equal(
      toPositional("SELECT /* a /* ? */ b */ x FROM t WHERE a = ?"),
      "SELECT /* a /* ? */ b */ x FROM t WHERE a = $1",
    );
  });

  await t.test("skips dollar-quoted bodies", () => {
    assert.equal(
      toPositional("SELECT $$ a ? b $$ AS x WHERE a = ?"),
      "SELECT $$ a ? b $$ AS x WHERE a = $1",
    );
    assert.equal(
      toPositional("SELECT $tag$ ? $tag$ AS x WHERE a = ?"),
      "SELECT $tag$ ? $tag$ AS x WHERE a = $1",
    );
  });

  await t.test("?? escapes to a literal ? for the jsonb operator", () => {
    assert.equal(
      toPositional("SELECT * FROM t WHERE meta ?? 'key' AND a = ?"),
      "SELECT * FROM t WHERE meta ? 'key' AND a = $1",
    );
  });

  await t.test("unterminated string does not run off the end", () => {
    assert.equal(toPositional("SELECT 'oops ? "), "SELECT 'oops ? ");
  });
});
