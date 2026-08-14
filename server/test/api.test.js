import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { startServer, client as makeClient } from "./helpers.js";

let server;
const client = () => makeClient(server.base);

before(async () => {
  server = await startServer({ port: 4111 });
});

after(() => server?.stop());

// ---------- accounts ----------

test("registration creates a session, and rejects bad input", async () => {
  const api = client();

  const short = await api("POST", "/api/auth/register", {
    name: "Ann",
    email: "ann@example.com",
    password: "short",
  });
  assert.equal(short.status, 400, "a short password must be refused");

  const ok = await api("POST", "/api/auth/register", {
    name: "Ann",
    email: "ann@example.com",
    password: "password123",
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, "ann@example.com");
  assert.ok(!("password_hash" in ok.body.user), "never return the password hash");

  const dupe = await api("POST", "/api/auth/register", {
    name: "Other",
    email: "ann@example.com",
    password: "password123",
  });
  assert.equal(dupe.status, 409, "duplicate email must be refused");
});

test("login requires the right password", async () => {
  const api = client();
  const wrong = await api("POST", "/api/auth/login", {
    email: "ann@example.com",
    password: "WRONG",
  });
  assert.equal(wrong.status, 401);

  const right = await api("POST", "/api/auth/login", {
    email: "ann@example.com",
    password: "password123",
  });
  assert.equal(right.status, 200);
});

test("everything private is behind auth", async () => {
  const anon = client();
  for (const url of ["/api/trips", "/api/auth/me", "/api/suggestions?city=Rome"]) {
    const res = await anon("GET", url);
    assert.equal(res.status, 401, `${url} must require a session`);
  }
});

// ---------- trips and items ----------

async function signedIn(email) {
  const api = client();
  await api("POST", "/api/auth/register", { name: email, email, password: "password123" });
  return api;
}

test("trips validate their dates", async () => {
  const api = await signedIn("dates@example.com");
  const backwards = await api("POST", "/api/trips", {
    title: "Backwards",
    start_date: "2026-10-05",
    end_date: "2026-10-01",
  });
  assert.equal(backwards.status, 400);

  const missing = await api("POST", "/api/trips", { title: "No dates" });
  assert.equal(missing.status, 400);
});

test("a trip keeps its items, and the budget maths is right", async () => {
  const api = await signedIn("budget@example.com");
  const { body } = await api("POST", "/api/trips", {
    title: "Sums",
    destination: "Italy",
    start_date: "2026-10-01",
    end_date: "2026-10-03",
    budget: 500,
  });
  const id = body.trip.id;

  const costs = [120.5, 80, 45.25];
  for (const [i, cost] of costs.entries()) {
    const res = await api("POST", `/api/trips/${id}/items`, {
      title: `Item ${i}`,
      date: "2026-10-01",
      time: "09:00",
      type: "food",
      cost,
    });
    assert.equal(res.status, 201);
  }

  const trip = await api("GET", `/api/trips/${id}`);
  assert.equal(trip.body.items.length, 3);
  const total = trip.body.items.reduce((sum, i) => sum + i.cost, 0);
  assert.equal(total, 245.75, "stored costs must add up exactly");
  assert.equal(trip.body.trip.budget, 500);
});

test("items require a title", async () => {
  const api = await signedIn("titles@example.com");
  const { body } = await api("POST", "/api/trips", {
    title: "T",
    start_date: "2026-10-01",
    end_date: "2026-10-02",
  });
  const res = await api("POST", `/api/trips/${body.trip.id}/items`, { type: "food" });
  assert.equal(res.status, 400);
});

test("items come back in itinerary order", async () => {
  const api = await signedIn("order@example.com");
  const { body } = await api("POST", "/api/trips", {
    title: "Order",
    start_date: "2026-10-01",
    end_date: "2026-10-03",
  });
  const id = body.trip.id;
  await api("POST", `/api/trips/${id}/items`, { title: "Late", date: "2026-10-02", time: "18:00" });
  await api("POST", `/api/trips/${id}/items`, { title: "Early", date: "2026-10-01", time: "08:00" });
  await api("POST", `/api/trips/${id}/items`, { title: "Someday" });

  const trip = await api("GET", `/api/trips/${id}`);
  assert.deepEqual(
    trip.body.items.map((i) => i.title),
    ["Early", "Late", "Someday"],
    "dated items first in date/time order, undated last"
  );
});

// ---------- the one that matters most ----------

test("one user cannot see or touch another's trip", async () => {
  const owner = await signedIn("owner@example.com");
  const stranger = await signedIn("stranger@example.com");

  const { body } = await owner("POST", "/api/trips", {
    title: "Private",
    start_date: "2026-10-01",
    end_date: "2026-10-02",
  });
  const id = body.trip.id;

  assert.equal((await stranger("GET", `/api/trips/${id}`)).status, 404, "cannot read");
  assert.equal(
    (await stranger("PUT", `/api/trips/${id}`, { title: "Hijacked" })).status,
    404,
    "cannot edit"
  );
  assert.equal((await stranger("DELETE", `/api/trips/${id}`)).status, 404, "cannot delete");
  assert.equal(
    (await stranger("POST", `/api/trips/${id}/items`, { title: "x" })).status,
    404,
    "cannot add items"
  );
  assert.equal(
    (await stranger("POST", `/api/trips/${id}/share`)).status,
    404,
    "cannot share someone else's trip"
  );

  const still = await owner("GET", `/api/trips/${id}`);
  assert.equal(still.body.trip.title, "Private", "the owner's trip is untouched");
});

// ---------- sharing ----------

test("a share link is public, read-only, and revocable", async () => {
  const owner = await signedIn("sharer@example.com");
  const { body } = await owner("POST", "/api/trips", {
    title: "Shared",
    start_date: "2026-10-01",
    end_date: "2026-10-02",
  });
  const id = body.trip.id;
  await owner("POST", `/api/trips/${id}/items`, { title: "Museum", cost: 20 });

  const share = await owner("POST", `/api/trips/${id}/share`);
  const token = share.body.share_token;
  assert.equal(token.length, 32, "token must be long enough not to guess");

  const again = await owner("POST", `/api/trips/${id}/share`);
  assert.equal(again.body.share_token, token, "re-sharing keeps the same link alive");

  const anon = client();
  const seen = await anon("GET", `/api/shared/${token}`);
  assert.equal(seen.status, 200, "no account needed");
  assert.equal(seen.body.items.length, 1);
  for (const leaked of ["user_id", "id", "share_token"]) {
    assert.ok(!(leaked in seen.body.trip), `public view must not expose ${leaked}`);
  }

  assert.equal((await anon("GET", "/api/shared/" + "0".repeat(32))).status, 404);

  await owner("DELETE", `/api/trips/${id}/share`);
  assert.equal(
    (await anon("GET", `/api/shared/${token}`)).status,
    404,
    "revoking kills the link immediately"
  );
});

// ---------- suggestions and ratings ----------

test("suggestions match a city or its country", async () => {
  const api = await signedIn("suggest@example.com");

  const rome = await api("GET", "/api/suggestions?city=Rome");
  assert.equal(rome.status, 200);
  assert.ok(rome.body.suggestions.length > 0, "seeded places should be found");

  const italy = await api("GET", "/api/suggestions?city=Italy");
  assert.ok(
    italy.body.suggestions.length >= rome.body.suggestions.length,
    "a country covers at least its cities — T-007"
  );

  const nowhere = await api("GET", "/api/suggestions?city=Narnia");
  assert.equal(nowhere.body.suggestions.length, 0);

  assert.equal((await api("GET", "/api/suggestions")).status, 400, "a place is required");
});

test("ratings average across people and stay anonymous", async () => {
  const one = await signedIn("rater1@example.com");
  const two = await signedIn("rater2@example.com");

  const list = await one("GET", "/api/suggestions?city=Rome");
  const place = list.body.suggestions[0];

  assert.equal((await one("POST", `/api/attractions/${place.id}/rate`, { stars: 0 })).status, 400);
  assert.equal((await one("POST", `/api/attractions/${place.id}/rate`, { stars: 6 })).status, 400);
  assert.equal((await one("POST", "/api/attractions/999999/rate", { stars: 5 })).status, 404);

  await one("POST", `/api/attractions/${place.id}/rate`, { stars: 5 });
  const second = await two("POST", `/api/attractions/${place.id}/rate`, { stars: 3 });
  assert.equal(second.body.attraction.avg_stars, 4, "5 and 3 average to 4");
  assert.equal(second.body.attraction.rating_count, 2);

  await one("POST", `/api/attractions/${place.id}/rate`, { stars: 1 });
  const after = await one("GET", "/api/suggestions?city=Rome");
  const again = after.body.suggestions.find((s) => s.id === place.id);
  assert.equal(again.rating_count, 2, "re-rating replaces, never adds a second vote");
  assert.equal(again.avg_stars, 2);

  const payload = JSON.stringify(after.body);
  assert.ok(!payload.includes("user_id"), "suggestions must not reveal who rated");
});

test("a trip gets a cover photo matching its destination", async () => {
  const api = await signedIn("cover@example.com");

  // A fresh database has the seeded place names but no photos — those are
  // fetched separately by `npm run photos` — so give one a photo here.
  const db = new DatabaseSync(server.dbFile);
  db.prepare(
    `UPDATE attractions
     SET image_url = 'https://upload.wikimedia.org/test.jpg',
         image_artist = 'A Photographer', image_license = 'CC BY-SA 4.0',
         image_page = 'https://commons.wikimedia.org/wiki/File:Test.jpg'
     WHERE id = (SELECT id FROM attractions WHERE city_key = 'rome' LIMIT 1)`
  ).run();
  db.close();

  const italy = await api("GET", "/api/cover?city=Italy");
  assert.equal(italy.status, 200, "a country finds a photo of one of its cities");
  assert.match(italy.body.cover.url, /^https:\/\//);
  assert.match(italy.body.cover.credit, /A Photographer/, "the photographer must be credited");
  assert.ok(italy.body.cover.credit_url, "and linked back to the source");

  const nowhere = await api("GET", "/api/cover?city=Narnia");
  assert.equal(nowhere.status, 204, "an unknown place falls back to the gradient");
});
