import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db.js";
import { scheduleBackups } from "./backup.js";
import { resolveJwtSecret, isProduction } from "./secret.js";
import { rateLimit } from "./rateLimit.js";
import { cityCover, coversEnabled, noteUsed } from "./covers.js";
import { buildPlan, planSummary, tripDays } from "./planner.js";
import {
  googleEnabled,
  redirectUri,
  authorizeUrl,
  exchangeCode,
  verifyIdToken,
} from "./oauth.js";
import {
  errorMiddleware,
  installProcessHandlers,
  recordError,
  recentErrors,
  errorSummary,
  pruneErrors,
} from "./errors.js";

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");

// Behind Fly's proxy every request arrives from the proxy's address. Without
// this, req.ip is identical for everyone and one visitor hitting the login
// limiter would lock out the entire internet. It also lets Express see that
// the original request was HTTPS, which the Secure cookie depends on.
if (isProduction || process.env.KITE_TRUST_PROXY) app.set("trust proxy", 1);
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

// Limits are env-tunable so the test suite can raise them (a run creates far
// more accounts than a person ever would) and lower them to prove the limiter
// actually fires. Defaults are the production values.
const limitFor = (name, fallback) => Number(process.env[name]) || fallback;

// Failed logins only — a correct password never spends the budget, so an
// ordinary user can sign in as often as they like while guessing gets capped.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: limitFor("KITE_LOGIN_LIMIT", 10),
  skipSuccessful: true,
  message: "Too many failed sign-in attempts. Please wait a few minutes and try again.",
});

// Signup is rarer, so this counts every attempt.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: limitFor("KITE_REGISTER_LIMIT", 5),
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

// ---------- sign in with Google (P-045) ----------

// The client asks what is available rather than guessing, so the button only
// appears when it will actually work.
app.get("/api/auth/providers", (req, res) => {
  res.json({ google: googleEnabled() });
});

const OAUTH_STATE = "kite_oauth_state";

app.get("/api/auth/google", (req, res) => {
  if (!googleEnabled())
    return res.status(503).json({ error: "Google sign-in is not configured" });

  // state ties the callback to this browser: without it, an attacker can feed
  // someone else's authorization code to a victim and sign them into the
  // attacker's account.
  const state = crypto.randomBytes(24).toString("base64url");
  res.cookie(OAUTH_STATE, state, {
    ...COOKIE_OPTIONS,
    maxAge: 10 * 60 * 1000, // the round trip should take seconds
  });
  res.redirect(authorizeUrl({ state, redirect: redirectUri(req) }));
});

app.get("/api/auth/google/callback", async (req, res, next) => {
  if (!googleEnabled())
    return res.status(503).json({ error: "Google sign-in is not configured" });

  const { code, state, error: providerError } = req.query;
  const expected = req.cookies[OAUTH_STATE];
  res.clearCookie(OAUTH_STATE, COOKIE_OPTIONS);

  // The user pressed cancel on Google's screen — not an error worth a page.
  if (providerError) return res.redirect("/?signin=cancelled");

  if (!code || !state || !expected || state !== expected)
    return res.status(400).json({ error: "Sign-in could not be verified. Please try again." });

  try {
    const tokens = await exchangeCode({ code, redirect: redirectUri(req) });
    const profile = await verifyIdToken(tokens.id_token);

    const user = findOrCreateGoogleUser(profile);
    setAuthCookie(res, user);
    res.redirect("/");
  } catch (err) {
    // A failed sign-in is worth recording, but the user gets a plain message.
    recordError(err, { source: "server", path: "/api/auth/google/callback", status: 400 });
    res.status(400).json({ error: "Google sign-in failed. Please try again." });
  }
});

/**
 * Find the account this Google profile belongs to, or make one.
 *
 * Linking by email is only safe because verifyIdToken refuses an unverified
 * address — otherwise anyone could create a Google account claiming an email
 * they do not own and take over the matching Kite account.
 */
function findOrCreateGoogleUser({ providerId, email, name }) {
  const byProvider = db
    .prepare("SELECT * FROM users WHERE auth_provider = 'google' AND provider_id = ?")
    .get(providerId);
  if (byProvider) return byProvider;

  const byEmail = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (byEmail) {
    // Existing password account, same verified address: link them rather than
    // creating a second account for the same person.
    db.prepare("UPDATE users SET auth_provider = 'google', provider_id = ? WHERE id = ?").run(
      providerId,
      byEmail.id
    );
    return { ...byEmail, auth_provider: "google", provider_id: providerId };
  }

  // No password: '' can never match a bcrypt comparison, so this account is
  // reachable only through Google.
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO users (email, password_hash, name, auth_provider, provider_id)
       VALUES (?, '', ?, 'google', ?)`
    )
    .run(email, name, providerId);

  return db.prepare("SELECT * FROM users WHERE id = ?").get(lastInsertRowid);
}

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

// ---------- day plans (P-047) ----------
//
// Proposes; never writes. The traveller sees the plan and decides — a planner
// that silently fills someone's itinerary is a planner they stop trusting.
app.get("/api/trips/:id/plan", requireAuth, (req, res) => {
  const trip = ownedTrip(req, res, req.params.id);
  if (!trip) return;

  const items = db
    .prepare("SELECT * FROM items WHERE trip_id = ? ORDER BY date IS NULL, date, time, id")
    .all(trip.id);

  const days = tripDays(trip.start_date, trip.end_date);

  // Where the itinerary already says the traveller will be, day by day.
  const cityForDay = {};
  for (const item of items) {
    if (item.type === "city" && item.date) cityForDay[item.date] = item.title.trim();
  }

  // Every place this trip could touch: its city items, plus its destination
  // split into parts, matched against city or country.
  const candidates = [
    ...items.filter((i) => i.type === "city").map((i) => i.title),
    ...String(trip.destination || "").split(/[,/&]|\band\b|→|->/),
  ]
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  const places = candidates.length
    ? db
        .prepare(
          `SELECT a.id, a.name, a.city, a.type, a.image_url,
                  ROUND(AVG(r.stars), 2) AS avg_stars,
                  COUNT(r.id) AS rating_count
           FROM attractions a
           LEFT JOIN ratings r ON r.attraction_id = a.id
           WHERE a.city_key IN (${candidates.map(() => "?").join(",")})
              OR a.country_key IN (${candidates.map(() => "?").join(",")})
           GROUP BY a.id`
        )
        .all(...candidates, ...candidates)
    : [];

  const hotel = items.find((i) => i.type === "hotel") || null;

  const plan = buildPlan({
    days,
    cityForDay,
    places,
    planned: items.map((i) => i.title.trim().toLowerCase()),
    hotel,
  });

  res.json({ plan, summary: planSummary(plan, { hotel }) });
});

// P-039: a cover photo for a trip, matched to where it goes.
//
// Two sources, tried in order. Unsplash gives the prettier, more generic
// travel shot but needs a key. Falling back to our own attraction photos means
// a trip to Italy wears a real photograph of somewhere in Italy — already
// licensed, already credited, and it works with no key at all. Failing both,
// 204 tells the client to keep its gradient.
function localCover(place) {
  const key = place.trim().toLowerCase();
  const row = db
    .prepare(
      `SELECT name, city, image_url, image_artist, image_license, image_page,
              (SELECT AVG(stars) FROM ratings r WHERE r.attraction_id = a.id) AS avg_stars
       FROM attractions a
       WHERE image_url IS NOT NULL AND (city_key = ? OR country_key = ?)
       ORDER BY avg_stars IS NULL, avg_stars DESC, id
       LIMIT 1`
    )
    .get(key, key);
  if (!row) return null;

  return {
    url: row.image_url,
    alt: `${row.name}, ${row.city}`,
    credit: `${row.name} · ${row.image_artist} (${row.image_license})`,
    credit_url: row.image_page,
    source: "wikimedia",
  };
}

app.get("/api/cover", requireAuth, async (req, res) => {
  const place = String(req.query.city || "").trim();
  if (!place) return res.status(400).json({ error: "A place is required" });

  if (coversEnabled()) {
    try {
      const cover = await cityCover(place);
      if (cover) {
        noteUsed(cover.download_location);
        const { download_location, ...safe } = cover;
        return res.json({
          cover: {
            ...safe,
            credit: `${safe.photographer} / Unsplash`,
            credit_url: safe.photographer_url,
            source: "unsplash",
          },
        });
      }
    } catch {
      /* fall through to the local photo */
    }
  }

  const local = localCover(place);
  if (local) return res.json({ cover: local });
  res.status(204).end(); // a photo is never worth failing a page over
});

// ---------- health ----------
//
// Deliberately cheap and unauthenticated: the platform calls it constantly.
// It touches the database, because a process that is up but cannot read its
// data is not actually healthy.
app.get("/healthz", (req, res) => {
  try {
    db.prepare("SELECT 1").get();
    // errors in the last hour are surfaced here so an uptime check can watch
    // one URL and notice a deploy that is up but failing every request
    res.json({ ok: true, db: "ok", errors: errorSummary() });
  } catch (err) {
    res.status(503).json({ ok: false, db: err.message });
  }
});

// ---------- error reporting (P-043) ----------

// The browser reports its own crashes here. Deliberately unauthenticated —
// the errors worth hearing about include the ones that stop a page loading at
// all — but rate limited, since anything open takes what it is given.
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many error reports.",
});

app.post("/api/client-error", clientErrorLimiter, (req, res) => {
  const { message, stack, path: where } = req.body || {};
  if (!message) return res.status(400).json({ error: "message is required" });

  recordError(
    { name: "ClientError", message: String(message), stack: stack && String(stack) },
    { source: "client", path: String(where || "").slice(0, 200) }
  );
  res.status(204).end();
});

// Reading the log is restricted to the address in KITE_ADMIN_EMAIL. With none
// set nobody can read it, which is the right default for a shared endpoint.
app.get("/api/errors", requireAuth, (req, res) => {
  const admin = process.env.KITE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin || req.user.email.toLowerCase() !== admin)
    return res.status(404).json({ error: "Not found" });

  res.json({ summary: errorSummary(), errors: recentErrors(req.query.limit) });
});

// ---------- the client, in production ----------
//
// One process serves both, so there is no CORS, no second service, and the
// cookie is same-origin. In development Vite serves the client and proxies
// /api here instead, so this block stays out of the way.
if (isProduction) {
  const clientDist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../client/dist"
  );

  if (fs.existsSync(clientDist)) {
    // hashed asset filenames may be cached hard; index.html must not be
    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
          else res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        },
      })
    );

    // Client-side routes (/trips/1, /s/<token>) must survive a refresh, but an
    // unknown /api path should still 404 rather than quietly return the page.
    app.get(/^(?!\/api\/).*/, (req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    console.warn(`No client build at ${clientDist} — serving the API only.`);
  }
}

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Last, and with four arguments — Express identifies an error handler by its
// arity, and anything registered after it would never see the error.
app.use(errorMiddleware(isProduction));

installProcessHandlers();

app.listen(PORT, HOST, () => {
  console.log(`Kite listening on http://${HOST}:${PORT}`);
  scheduleBackups(); // P-014: on boot, then daily
  pruneErrors();
});
