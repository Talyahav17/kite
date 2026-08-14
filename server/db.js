import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_ATTRACTIONS, CITY_COUNTRY } from "./seed-attractions.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Where durable state lives. In production this is a mounted volume (/data on
// Fly) — a container's own filesystem is wiped on every deploy, so a SQLite
// file written beside the code would silently lose every trip on release.
export const dataDir = process.env.KITE_DATA_DIR || dir;

// KITE_DB lets the test suite point at a throwaway file. Without it the app
// always uses the real database, so tests can never touch production data.
export const dbPath = process.env.KITE_DB || path.join(dataDir, "trips.db");
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    destination TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    date TEXT,                -- YYYY-MM-DD; NULL = trip-wide (e.g. travel insurance note)
    time TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'other',  -- city | attraction | hotel | transport | food | activity | other
    title TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    cost REAL,
    link TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
  CREATE INDEX IF NOT EXISTS idx_items_trip ON items(trip_id);

  -- P-031: places Kite can suggest, and what its own users thought of them.
  -- Every score shown is computed from the ratings table below; no third-party
  -- rating is ever stored here.
  CREATE TABLE IF NOT EXISTS attractions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    city_key TEXT NOT NULL,              -- lowercased city, for matching
    type TEXT NOT NULL DEFAULT 'attraction',
    UNIQUE(name, city_key)
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attraction_id INTEGER NOT NULL REFERENCES attractions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(attraction_id, user_id)       -- one rating per person per place
  );

  CREATE INDEX IF NOT EXISTS idx_attractions_city ON attractions(city_key);
  CREATE INDEX IF NOT EXISTS idx_ratings_attraction ON ratings(attraction_id);
`);

// Columns added after the first release. CREATE TABLE IF NOT EXISTS above will
// not touch an existing database, so each new column is added here on boot.
function addColumn(table, column, definition) {
  const exists = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumn("trips", "share_token", "TEXT"); // P-018: read-only share links
addColumn("trips", "budget", "REAL"); // P-020: target budget for the trip

// P-032: photo of the place, from Wikimedia Commons. The attribution columns
// are not optional decoration — CC BY-SA requires crediting the photographer
// and naming the licence wherever the image is shown.
addColumn("attractions", "image_url", "TEXT");
addColumn("attractions", "image_artist", "TEXT");
addColumn("attractions", "image_license", "TEXT");
addColumn("attractions", "image_license_url", "TEXT");
addColumn("attractions", "image_page", "TEXT");

// T-007: a trip labelled "France" should still surface Paris.
addColumn("attractions", "country", "TEXT");
addColumn("attractions", "country_key", "TEXT");

// Seed the starter places. Runs after the migrations above, so every column it
// writes exists. Insert-or-ignore keeps it safe on each boot and never
// overwrites a row a user has already rated.
{
  const insert = db.prepare(
    `INSERT OR IGNORE INTO attractions (name, city, city_key, type, country, country_key)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const backfill = db.prepare(
    "UPDATE attractions SET country = ?, country_key = ? WHERE city_key = ? AND country IS NULL"
  );
  for (const [name, city, type] of SEED_ATTRACTIONS) {
    const country = CITY_COUNTRY[city] || "";
    insert.run(name, city, city.trim().toLowerCase(), type, country, country.toLowerCase());
  }
  // rows seeded before the country columns existed
  for (const [city, country] of Object.entries(CITY_COUNTRY)) {
    backfill.run(country, country.toLowerCase(), city.toLowerCase());
  }
}

db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_share_token ON trips(share_token)"
);
