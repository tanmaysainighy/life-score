-- LifeScore schema (PostgreSQL).
--
-- Timestamps are ISO-8601 UTC strings and "day" columns are 'YYYY-MM-DD' in the
-- *user's* local timezone, computed server-side at write time so streaks and
-- daily totals match the day the user actually lived. They are TEXT on purpose:
-- the comparisons are all lexicographic range scans on a fixed-width label, and
-- storing them as dates would invite the server's timezone into the answer.
--
-- Every statement is idempotent — this runs on each boot.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------------------------------------------------------------------------
-- Global activity taxonomy. This is the shared vocabulary: one row per
-- canonical activity, hierarchical via parent_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
  id               TEXT PRIMARY KEY,          -- ACT_00123
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  parent_id        TEXT REFERENCES activities(id) ON DELETE SET NULL,
  category         TEXT NOT NULL,             -- top-level category slug
  base_xp_per_hour DOUBLE PRECISION NOT NULL,
  icon             TEXT NOT NULL DEFAULT '✨',
  keywords         TEXT NOT NULL DEFAULT '',  -- space-separated, for matching
  status           TEXT NOT NULL DEFAULT 'active',  -- active | disabled
  scoring_version  INTEGER NOT NULL DEFAULT 1,
  origin           TEXT NOT NULL DEFAULT 'seed',    -- seed | derived
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- Alternate names that map onto a canonical activity. The cheapest hit in the
-- resolver cascade after an exact slug/name match.
CREATE TABLE IF NOT EXISTS activity_aliases (
  alias       TEXT PRIMARY KEY,               -- normalized text
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  source      TEXT NOT NULL DEFAULT 'seed',   -- seed | llm | admin
  created_at  TEXT NOT NULL
);

-- Per-user phrasing memory. Improves classification only; never affects XP.
CREATE TABLE IF NOT EXISTS user_activity_memory (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phrase      TEXT NOT NULL,                  -- stemmed tokens, space-joined
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  hits        INTEGER NOT NULL DEFAULT 1,
  last_used   TEXT NOT NULL,
  PRIMARY KEY (user_id, phrase)
);

-- ---------------------------------------------------------------------------
-- Activity logs: the actual scored entries. XP is written by the server only.
-- base_xp_per_hour and scoring_version are SNAPSHOTS taken at scoring time, so
-- historical entries never change when the taxonomy is re-priced.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id                     TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id            TEXT NOT NULL REFERENCES activities(id),
  raw_text               TEXT NOT NULL,
  duration_minutes       INTEGER NOT NULL,
  xp                     INTEGER NOT NULL,
  base_xp_per_hour       DOUBLE PRECISION NOT NULL,
  scoring_version        INTEGER NOT NULL,
  resolution_method      TEXT NOT NULL,       -- exact | alias | memory | keyword | llm | manual
  confidence             DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  local_day              TEXT NOT NULL,       -- YYYY-MM-DD in user's timezone
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
-- Leaderboards and dashboards are all (user, day) range scans.
CREATE INDEX IF NOT EXISTS idx_logs_user_day    ON activity_logs(user_id, local_day);
CREATE INDEX IF NOT EXISTS idx_logs_user_created ON activity_logs(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  invite_code TEXT NOT NULL UNIQUE,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL DEFAULT '🏆',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',   -- owner | member
  joined_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_gm_user  ON group_members(user_id);

-- ---------------------------------------------------------------------------
-- Daily targets: the things you have committed to doing every day.
-- target_minutes is optional — NULL means "just do it at all".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_targets (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id    TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  target_minutes INTEGER,
  created_at     TEXT NOT NULL,
  PRIMARY KEY (user_id, activity_id)
);

-- Achievements are derived from the stats the profile already computes (see
-- achievements.ts), so there is no table for them — nothing to keep in sync.

-- Indexes carried by earlier versions that no query uses. Postgres cannot
-- express "create only these", and the schema runs on every boot, so dropping
-- them explicitly is what actually removes them from an existing database.
--
-- Why each went:
--   activities.*      111 rows, fully cached in memory; a scan beats a seek
--   aliases_activity  read once per process as a hash join
--   memory_user       redundant: user_id already leads the primary key
--   gm_group          redundant: group_id already leads the primary key
--   logs_day          only the global leaderboard scanned by day, and it is gone
--   logs_activity     nothing queries logs by activity, and it cost every insert
DROP INDEX IF EXISTS idx_activities_parent;
DROP INDEX IF EXISTS idx_activities_category;
DROP INDEX IF EXISTS idx_activities_status;
DROP INDEX IF EXISTS idx_aliases_activity;
DROP INDEX IF EXISTS idx_memory_user;
DROP INDEX IF EXISTS idx_gm_group;
DROP INDEX IF EXISTS idx_logs_day;
DROP INDEX IF EXISTS idx_logs_activity;
