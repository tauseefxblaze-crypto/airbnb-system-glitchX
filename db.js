/* StayNest - SQLite database (Node's built-in node:sqlite, no native build needed). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );

    -- one row per signed-in device; only a SHA-256 of the cookie token is stored
    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_agent TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      last_seen  INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS password_resets (
      id         INTEGER PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      used_at    INTEGER
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id         INTEGER PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stay_id    TEXT NOT NULL,
      checkin    TEXT NOT NULL,
      checkout   TEXT NOT NULL,
      guests     INTEGER NOT NULL,
      total      INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bookings_user ON bookings(user_id);

    CREATE TABLE IF NOT EXISTS wishlist (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stay_id TEXT NOT NULL,
      PRIMARY KEY (user_id, stay_id)
    );
  `);
  return db;
}

module.exports = { openDb };
