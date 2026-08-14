import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db.js";
import { scheduleBackups } from "./backup.js";
import { resolveJwtSecret, isProduction } from "./secret.js";
import { rateLimit } from "./rateLimit.js";
import { cityCover, coversEnabled, noteUsed } from "./covers.js";

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = resolveJwtSecret(); // P-001: never hard-coded; see secret.js
const COOKIE = "trip_token";

// P-026: `secure` keeps the session cookie off plaintext HTTP. It is only
// enabled in production — setting it in development would stop the browser
// sending the cookie over http://localhost, breaking login locally.
// clearCookie must be given the same attributes or logout fails to clear it.
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction,
  path: "/",
};

app.use(express.json());
app.use(cookieParser());

// ---------- rate limits (P-027) ----------

// Failed logins only — a correct password never spends the budget, so an
// ordinary user can sign in as often as they like while guessing gets capped.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessful: true,
  message: "Too many failed sign-in attempts. Please wait a few minutes and try again.",
});

// Signup is rarer, so this counts every attempt.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many accounts created from this network. Please try again later.",
});

// ---------- auth helpers ----------

function setAuthCookie(res, user) {
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "30d",
  });
  res.cookie(COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: "Not logged in" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired, please log in again" });
  }
}

// Loads the trip and verifies it belongs to the logged-in user.
function ownedTrip(req, res, tripId) {
  const trip = db
    .prepare("SELECT * FROM trips WHERE id = ? AND user_id = ?")
    .get(tripId, req.user.id);
  if (!trip) res.status(404).json({ error: "Trip not found" });
  return trip;
}

// ---------- auth routes ----------

app.post("/api/auth/register", registerLimiter, (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name)
    return res.status(400).json({ error: "Name, email and password are required" });
  if (password.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });

  const normalized = String(email).trim().toLowerCase();
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(normalized))
    return res.status(409).json({ error: "An account with that email already exists" });

  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)")
    .run(normalized, hash, String(name).trim());

  const user = { id: Number(lastInsertRowid), email: normalized, name };
  setAuthCookie(res, user);
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
});

app.post("/api/auth/login", loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(String(email || "").trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || "", user.password_hash))
    return res.status(401).json({ error: "Wrong email or password" });

  setAuthCookie(res, user);
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE, COOKIE_OPTIONS);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = db
    .prepare("SELECT id, email, name FROM users WHERE id = ?")
    .get(req.user.id);
  if (!user) return res.status(401).json({ error: "Account no longer exists" });
  res.json({ user });
});

// ---------- trips ----------

app.get("/api/trips", requireAuth, (req, res) => {
  const trips = db
    .prepare(
      `SELECT t.*, COUNT(i.id) AS item_count
       FROM trips t LEFT JOIN items i ON i.trip_id = t.id
       WHERE t.user_id = ?
       GROUP BY t.id
       ORDER BY t.start_date`
    )
    .all(req.user.id);
  res.json({ trips });
});

app.post("/api/trips", requireAuth, (req, res) => {
  const {
    title,
    destination = "",
    start_date,
    end_date,
    notes = "",
    budget = null,
  } = req.body || {};
  if (!title || !start_date || !end_date)
    return res.status(400).json({ error: "Title, start date and end date are required" });
  if (end_date < start_date)
    return res.status(400).json({ error: "End date must be on or after the start date" });

  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO trips (user_id, title, destination, start_date, end_date, notes, budget) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      req.user.id,
      title,
      destination,
      start_date,
      end_date,
      notes,
      budget === "" || budget == null ? null : Number(budget)
    );
  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(lastInsertRowid);
  res.status(201).json({ trip });
});

app.get("/api/trips/:id", requireAuth, (req, res) => {
  const trip = ownedTrip(req, res, req.params.id);
  if (!trip) return;
  const items = db
    .prepare(
      "SELECT * FROM items WHERE trip_id = ? ORDER BY date IS NULL, date, time, id"
    )
    .all(trip.id);
  res.json({ trip, items });
});

app.put("/api/trips/:id", requireAuth, (req, res) => {
  const trip = ownedTrip(req, res, req.params.id);
  if (!trip) return;
  const { title, destination, start_date, end_date, notes, budget } = {
    ...trip,
    ...req.body,
  };
  if (!title || !start_date || !end_date)
    return res.status(400).json({ error: "Title, start date and end date are required" });
  if (end_date < start_date)
    return res.status(400).json({ error: "End date must be on or after the start date" });
  db.prepare(
    "UPDATE trips SET title = ?, destination = ?, start_date = ?, end_date = ?, notes = ?, budget = ? WHERE id = ?"
  ).run(
    title,
    destination,
    start_date,
    end_date,
    notes,
    budget === "" || budget == null ? null : Number(budget),
    trip.id
  );
  res.json({ trip: db.prepare("SELECT * FROM trips WHERE id = ?").get(trip.id) });
});

// ---------- sharing (P-018) ----------

// Owner turns a share link on / off.
app.post("/api/trips/:id/share", requireAuth, (req, res) => {
  const trip = ownedTrip(req, res, req.params.id);
  if (!trip) return;
  const token = trip.share_token || crypto.randomBytes(16).toString("hex");
  db.prepare("UPDATE trips SET share_token = ? WHERE id = ?").run(token, trip.id);
  res.json({ share_token: token });
});

app.delete("/api/trips/:id/share", requireAuth, (req, res) => {
  const trip = ownedTrip(req, res, req.params.id);
  if (!trip) return;
  db.prepare("UPDATE trips SET share_token = NULL WHERE id = ?").run(trip.id);
  res.json({ ok: true });
});

// Public, read-only. No auth: possession of the 32-char token is the grant.
// Returns trip content only — never the owner's identity or account details.
app.get("/api/shared/:token", (req, res) => {
  const trip = db
    .prepare("SELECT * FROM trips WHERE share_token = ?")
    .get(req.params.token);
  if (!trip) return res.status(404).json({ error: "This shared trip is no longer available" });

  const items = db
    .prepare("SELECT * FROM items WHERE trip_id = ? ORDER BY date IS NULL, date, time, id")
    .all(trip.id);
  const { id, user_id, share_token, ...safe } = trip;
  res.json({ trip: safe, items });
});

app.delete("/api/trips/:id", requireAuth, (req, res) => {
  const trip = ownedTrip(req, res, req.params.id);
  if (!trip) return;
  db.prepare("DELETE FROM trips WHERE id = ?").run(trip.id);
  res.json({ ok: true });
});

// ---------- items ----------

const ITEM_TYPES = ["city", "attraction", "hotel", "transport", "food", "activity", "other"];

function itemFields(body, fallback = {}) {
  const src = { ...fallback, ...body };
  return {
    date: src.date || null,
    time: src.time || "",
    type: ITEM_TYPES.includes(src.type) ? src.type : "other",
    title: src.title,
    location: src.location || "",
    notes: src.notes || "",
    cost: src.cost === "" || src.cost == null ? null : Number(src.cost),
    link: src.link || "",
  };
}

app.post("/api/trips/:id/items", requireAuth, (req, res) => {
  const trip = ownedTrip(req, res, req.params.id);
  if (!trip) return;
  const f = itemFields(req.body);
  if (!f.title) return res.status(400).json({ error: "Title is required" });

  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO items (trip_id, date, time, type, title, location, notes, cost, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(trip.id, f.date, f.time, f.type, f.title, f.location, f.notes, f.cost, f.link);
  res
    .status(201)
    .json({ item: db.prepare("SELECT * FROM items WHERE id = ?").get(lastInsertRowid) });
});

function ownedItem(req, res, itemId) {
  const item = db
    .prepare(
      `SELECT i.* FROM items i JOIN trips t ON t.id = i.trip_id
       WHERE i.id = ? AND t.user_id = ?`
    )
    .get(itemId, req.user.id);
  if (!item) res.status(404).json({ error: "Item not found" });
  return item;
}

app.put("/api/items/:id", requireAuth, (req, res) => {
  const item = ownedItem(req, res, req.params.id);
  if (!item) return;
  const f = itemFields(req.body, item);
  if (!f.title) return res.status(400).json({ error: "Title is required" });
  db.prepare(
    "UPDATE items SET date = ?, time = ?, type = ?, title = ?, location = ?, notes = ?, cost = ?, link = ? WHERE id = ?"
  ).run(f.date, f.time, f.type, f.title, f.location, f.notes, f.cost, f.link, item.id);
  res.json({ item: db.prepare("SELECT * FROM items WHERE id = ?").get(item.id) });
});

app.delete("/api/items/:id", requireAuth, (req, res) => {
  const item = ownedItem(req, res, req.params.id);
  if (!item) return;
  db.prepare("DELETE FROM items WHERE id = ?").run(item.id);
  res.json({ ok: true });
});

// ---------- suggestions & ratings (P-031) ----------
//
// Scores are computed live from Kite's own ratings. Responses are aggregate
// only — never who rated what — so one user's history is not exposed to
// another. The caller's own rating is included, because it is theirs.

const ratingSummary = `
  SELECT a.id, a.name, a.city, a.type,
         a.image_url, a.image_artist, a.image_license, a.image_license_url, a.image_page,
         ROUND(AVG(r.stars), 2) AS avg_stars,
         COUNT(r.id) AS rating_count
  FROM attractions a
  LEFT JOIN ratings r ON r.attraction_id = a.id
`;

// What should I see in this city? Best-rated first, unrated last.
app.get("/api/suggestions", requireAuth, (req, res) => {
  const city = String(req.query.city || "").trim().toLowerCase();
  if (!city) return res.status(400).json({ error: "A city is required" });

  // Match a city or a country, so a trip labelled "France" still finds Paris.
  const rows = db
    .prepare(
      `${ratingSummary}
       WHERE a.city_key = ? OR a.country_key = ?
       GROUP BY a.id
       ORDER BY rating_count = 0, avg_stars DESC, rating_count DESC, a.name`
    )
    .all(city, city);

  const mine = db
    .prepare(
      `SELECT attraction_id, stars FROM ratings WHERE user_id = ? AND attraction_id IN
       (SELECT id FROM attractions WHERE city_key = ?)`
    )
    .all(req.user.id, city);
  const myStars = new Map(mine.map((m) => [m.attraction_id, m.stars]));

  res.json({
    city,
    suggestions: rows.map((r) => ({ ...r, your_rating: myStars.get(r.id) ?? null })),
  });
});

// Places the user has already been (item date in the past) that they have not
// rated yet — the "how was it?" prompt.
app.get("/api/ratings/pending", requireAuth, (req, res) => {
  // Real itineraries say "Colosseum & Forum", not "Colosseum", and their
  // destination is often a country ("Italy") rather than the city. So match
  // the place name *within* the item title, and accept the city either from
  // the trip's destination or from any city item on the trip.
  const rows = db
    .prepare(
      `SELECT DISTINCT a.id, a.name, a.city, a.type, i.date, i.title AS item_title,
              t.title AS trip_title
       FROM items i
       JOIN trips t ON t.id = i.trip_id
       JOIN attractions a ON (
              LOWER(TRIM(i.title)) = LOWER(a.name)
           OR (LENGTH(a.name) >= 5 AND INSTR(LOWER(i.title), LOWER(a.name)) > 0)
       )
       WHERE t.user_id = ?
         AND i.date IS NOT NULL
         AND i.date < date('now')
         AND (
              a.city_key = LOWER(TRIM(t.destination))
           OR EXISTS (
                SELECT 1 FROM items c
                WHERE c.trip_id = t.id AND c.type = 'city'
                  AND LOWER(TRIM(c.title)) = a.city_key
              )
         )
         AND NOT EXISTS (
           SELECT 1 FROM ratings r WHERE r.attraction_id = a.id AND r.user_id = ?
         )
       ORDER BY i.date DESC
       LIMIT 10`
    )
    .all(req.user.id, req.user.id);
  res.json({ pending: rows });
});

// Rate a place. One rating per person per place; re-rating replaces it.
app.post("/api/attractions/:id/rate", requireAuth, (req, res) => {
  const attraction = db
    .prepare("SELECT * FROM attractions WHERE id = ?")
    .get(req.params.id);
  if (!attraction) return res.status(404).json({ error: "Place not found" });

  const stars = Number(req.body?.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5)
    return res.status(400).json({ error: "A rating must be between 1 and 5 stars" });

  db.prepare(
    `INSERT INTO ratings (attraction_id, user_id, stars, note) VALUES (?, ?, ?, ?)
     ON CONFLICT(attraction_id, user_id)
     DO UPDATE SET stars = excluded.stars, note = excluded.note,
                   created_at = datetime('now')`
  ).run(attraction.id, req.user.id, stars, String(req.body?.note || ""));

  const summary = db
    .prepare(`${ratingSummary} WHERE a.id = ? GROUP BY a.id`)
    .get(attraction.id);
  res.json({ attraction: { ...summary, your_rating: stars } });
});

// P-032: a cover photo for a city. Returns 204 when Unsplash isn't configured,
// which the client treats as "keep the gradient" rather than an error.
app.get("/api/cover", requireAuth, async (req, res) => {
  const city = String(req.query.city || "").trim();
  if (!city) return res.status(400).json({ error: "A city is required" });
  if (!coversEnabled()) return res.status(204).end();

  try {
    const cover = await cityCover(city);
    if (!cover) return res.status(204).end();
    noteUsed(cover.download_location);
    const { download_location, ...safe } = cover;
    res.json({ cover: safe });
  } catch {
    res.status(204).end(); // a photo is never worth failing a page over
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  scheduleBackups(); // P-014: on boot, then daily
});
