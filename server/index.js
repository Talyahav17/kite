import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db.js";
import { scheduleBackups } from "./backup.js";
import { resolveJwtSecret } from "./secret.js";

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = resolveJwtSecret(); // P-001: never hard-coded; see secret.js
const COOKIE = "trip_token";

app.use(express.json());
app.use(cookieParser());

// ---------- auth helpers ----------

function setAuthCookie(res, user) {
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "30d",
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
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

app.post("/api/auth/register", (req, res) => {
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

app.post("/api/auth/login", (req, res) => {
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
  res.clearCookie(COOKIE);
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

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  scheduleBackups(); // P-014: on boot, then daily
});
