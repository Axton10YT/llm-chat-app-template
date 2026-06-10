-- GDPS database schema
-- Run with: wrangler d1 execute gdps-db --file=schema.sql

CREATE TABLE IF NOT EXISTS hidden_levels (
  level_id TEXT PRIMARY KEY,
  added_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS mod_users (
  account_id TEXT PRIMARY KEY,
  mod_level  INTEGER NOT NULL DEFAULT 1,   -- 1 = Mod, 2 = Elder Mod
  added_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
