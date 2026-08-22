// P-056 (T-008): deleting an account, and the guards around it.
//
// The dangerous half of this feature is not the delete — it is everything that
// must NOT be deletable: someone else's account, or your own on the strength of
// a borrowed session alone.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { startServer, client as makeClient } from "./helpers.js";

let server;
const client = () => makeClient(server.base);

before(async () => {
  server = await startServer({ port: 4117 });
});

after(() => server?.stop());

/** Register a user who owns a trip with an item in it. */
async function userWithTrip(email) {
  const api = client();
  await api("POST", "/api/auth/register", { name: "Test", email, password: "password123" });
  const { body } = await api("POST", "/api/trips", {
    title: "Trip",
    destination: "Japan",
    start_date: "2027-04-10",
    end_date: "2027-04-12",
  });
  await api("POST", `/api/trips/${body.trip.id}/items`, { title: "Museum", type: "attraction" });
  return { api, tripId: body.trip.id };
}

test("the wrong password does not delete the account", async () => {
  const { api } = await userWithTrip("keep@example.com");

  const res = await api("DELETE", "/api/auth/me", { password: "not-the-password" });
  assert.equal(res.status, 401);

  const me = await api("GET", "/api/auth/me");
  assert.equal(me.status, 200, "still signed in and still exists");
  assert.equal(me.body.user.email, "keep@example.com");
});

test("no password at all does not delete the account", async () => {
  const { api } = await userWithTrip("nopw@example.com");

  assert.equal((await api("DELETE", "/api/auth/me", {})).status, 401);
  assert.equal((await api("DELETE", "/api/auth/me")).status, 401);

  assert.equal((await api("GET", "/api/auth/me")).status, 200);
});

test("a signed-out request cannot delete anything", async () => {
  await userWithTrip("stranger-target@example.com");

  const anon = client();
  const res = await anon("DELETE", "/api/auth/me", { password: "password123" });
  assert.equal(res.status, 401, "no session, no deletion");
});

test("the right password deletes the account and everything in it", async () => {
  const { api } = await userWithTrip("goodbye@example.com");

  const res = await api("DELETE", "/api/auth/me", { password: "password123" });
  assert.equal(res.status, 200);

  // the session is dead
  assert.equal((await api("GET", "/api/auth/me")).status, 401);

  // and so is the account — the same address can be registered fresh
  const again = client();
  const reg = await again("POST", "/api/auth/register", {
    name: "Someone Else",
    email: "goodbye@example.com",
    password: "password123",
  });
  assert.equal(reg.status, 200, "the address is free again, so the row really went");

  const trips = await again("GET", "/api/trips");
  assert.deepEqual(trips.body.trips, [], "the new account does not inherit the old one's trips");
});

test("deleting an account takes its trips, items and ratings with it", async () => {
  const { api, tripId } = await userWithTrip("cascade@example.com");

  const places = await api("GET", "/api/suggestions?city=Tokyo");
  const attraction = places.body.suggestions[0];
  await api("POST", `/api/attractions/${attraction.id}/rate`, { stars: 5 });

  const db = new DatabaseSync(server.dbFile);
  const count = (sql, ...args) => db.prepare(sql).get(...args).n;
  const userId = db.prepare("SELECT id FROM users WHERE email = ?").get("cascade@example.com").id;

  assert.equal(count("SELECT COUNT(*) n FROM items WHERE trip_id = ?", tripId), 1);
  assert.equal(count("SELECT COUNT(*) n FROM ratings WHERE user_id = ?", userId), 1);

  assert.equal((await api("DELETE", "/api/auth/me", { password: "password123" })).status, 200);

  assert.equal(count("SELECT COUNT(*) n FROM users WHERE id = ?", userId), 0);
  assert.equal(count("SELECT COUNT(*) n FROM trips WHERE user_id = ?", userId), 0);
  assert.equal(count("SELECT COUNT(*) n FROM items WHERE trip_id = ?", tripId), 0, "no orphaned items");
  assert.equal(count("SELECT COUNT(*) n FROM ratings WHERE user_id = ?", userId), 0);
  db.close();
});

test("a shared link stops working once the owner deletes their account", async () => {
  const { api, tripId } = await userWithTrip("shared-then-gone@example.com");
  const { body } = await api("POST", `/api/trips/${tripId}/share`);
  const token = body.share_token;

  const anon = client();
  assert.equal((await anon("GET", `/api/shared/${token}`)).status, 200);

  await api("DELETE", "/api/auth/me", { password: "password123" });

  assert.equal(
    (await anon("GET", `/api/shared/${token}`)).status,
    404,
    "the trip is gone, so the link people were holding must die with it"
  );
});

test("a Google-only account confirms by typing its address, not a password", async () => {
  const api = client();
  await api("POST", "/api/auth/register", {
    name: "Goog",
    email: "goog@example.com",
    password: "password123",
  });

  // make it look like the Google path did: no usable password
  const db = new DatabaseSync(server.dbFile);
  db.prepare("UPDATE users SET password_hash = '', auth_provider = 'google' WHERE email = ?").run(
    "goog@example.com"
  );
  db.close();

  // an empty password must not sail through the empty hash
  assert.equal((await api("DELETE", "/api/auth/me", { password: "" })).status, 400);
  assert.equal((await api("DELETE", "/api/auth/me", { password: "anything" })).status, 400);
  assert.equal(
    (await api("DELETE", "/api/auth/me", { confirmEmail: "wrong@example.com" })).status,
    400
  );
  assert.equal((await api("GET", "/api/auth/me")).status, 200, "still there");

  const ok = await api("DELETE", "/api/auth/me", { confirmEmail: "GOOG@example.com " });
  assert.equal(ok.status, 200, "case and whitespace are forgiven, the address is not");
  assert.equal((await api("GET", "/api/auth/me")).status, 401);
});

// ---------- P-059: export before delete ----------

test("an export carries the traveller's own trips, items and ratings", async () => {
  const api = client();
  await api("POST", "/api/auth/register", {
    name: "Exporter",
    email: "export@example.com",
    password: "password123",
  });
  const { body } = await api("POST", "/api/trips", {
    title: "Kyoto",
    destination: "Japan",
    start_date: "2027-04-10",
    end_date: "2027-04-12",
    notes: "cherry blossom",
  });
  await api("POST", `/api/trips/${body.trip.id}/items`, {
    title: "Fushimi Inari",
    type: "attraction",
    date: "2027-04-10",
    time: "09:30",
    cost: 0,
  });

  const places = await api("GET", "/api/suggestions?city=Tokyo");
  await api("POST", `/api/attractions/${places.body.suggestions[0].id}/rate`, {
    stars: 4,
    note: "worth the queue",
  });

  const res = await api("GET", "/api/export");
  assert.equal(res.status, 200);
  assert.equal(res.body.format, "kite-export-v1");
  assert.equal(res.body.account.email, "export@example.com");

  assert.equal(res.body.trips.length, 1);
  assert.equal(res.body.trips[0].title, "Kyoto");
  assert.equal(res.body.trips[0].notes, "cherry blossom");
  assert.equal(res.body.trips[0].items.length, 1);
  assert.equal(res.body.trips[0].items[0].title, "Fushimi Inari");

  assert.equal(res.body.ratings.length, 1);
  assert.equal(res.body.ratings[0].stars, 4);
  assert.ok(res.body.ratings[0].place, "a rating without the place name is a meaningless id");

  assert.match(
    res.headers.get("content-disposition") || "",
    /attachment; filename="kite-export-\d{4}-\d{2}-\d{2}\.json"/
  );
});

test("an export never carries a password hash or anyone else's trips", async () => {
  const mine = client();
  await mine("POST", "/api/auth/register", {
    name: "Mine",
    email: "mine@example.com",
    password: "password123",
  });
  await mine("POST", "/api/trips", {
    title: "Mine only",
    start_date: "2027-04-10",
    end_date: "2027-04-11",
  });

  const theirs = client();
  await theirs("POST", "/api/auth/register", {
    name: "Theirs",
    email: "theirs@example.com",
    password: "password123",
  });
  await theirs("POST", "/api/trips", {
    title: "Somebody else's secret trip",
    start_date: "2027-05-01",
    end_date: "2027-05-02",
  });

  const res = await mine("GET", "/api/export");
  const dump = JSON.stringify(res.body);

  assert.ok(!/password_hash/.test(dump), "the hash must never leave the server");
  assert.ok(!/Somebody else/.test(dump), "one account's export cannot contain another's trips");
  assert.ok(!/theirs@example\.com/.test(dump));
  assert.equal(res.body.trips.length, 1);
  assert.equal(res.body.trips[0].title, "Mine only");
});

test("a signed-out visitor cannot export anything", async () => {
  const anon = client();
  assert.equal((await anon("GET", "/api/export")).status, 401);
});
