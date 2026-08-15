// P-043: error monitoring, proved rather than assumed.
//
// Runs with NODE_ENV=production, because the behaviour that matters — not
// returning a stack trace to whoever triggered the error — only applies there.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { startServer, client } from "./helpers.js";

let server;

before(async () => {
  server = await startServer({
    port: 4113,
    env: { NODE_ENV: "production", KITE_ADMIN_EMAIL: "boss@example.com" },
  });
});

after(() => server?.stop());

async function signedIn(email) {
  const api = client(server.base);
  await api("POST", "/api/auth/register", { name: email, email, password: "password123" });
  return api;
}

test("a thrown route returns a plain error, never a stack trace", async () => {
  const api = await signedIn("thrower@example.com");

  // /api/attractions/:id/rate reads req.body — sending a body that is valid
  // JSON but not an object is the kind of input that used to reach the default
  // Express handler.
  const res = await api("POST", "/api/attractions/notanumber/rate", { stars: 5 });
  assert.ok(res.status >= 400, "a bad request must fail");
  assert.ok(!JSON.stringify(res.body).includes("at Object"), "no stack frames in the response");
  assert.ok(!JSON.stringify(res.body).includes("/server/index.js"), "no file paths either");
});

test("the browser can report its own crashes, and they are stored", async () => {
  const anon = client(server.base);

  const res = await anon("POST", "/api/client-error", {
    message: "Cannot read properties of undefined (reading 'map')",
    stack: "at TripDetail (/assets/index-abc.js:120:9)",
    path: "/trips/1",
  });
  assert.equal(res.status, 204, "reporting works without an account — a crash may block login");

  const empty = await anon("POST", "/api/client-error", { stack: "x" });
  assert.equal(empty.status, 400, "a report with no message is refused");

  const db = new DatabaseSync(server.dbFile);
  const row = db
    .prepare("SELECT * FROM errors WHERE source = 'client' ORDER BY id DESC LIMIT 1")
    .get();
  db.close();

  assert.equal(row.kind, "ClientError");
  assert.match(row.message, /Cannot read properties/);
  assert.match(JSON.parse(row.context).path, /^\/trips\/1$/);
});

test("the error log is readable only by the admin address", async () => {
  const stranger = await signedIn("nosy@example.com");
  const boss = await signedIn("boss@example.com");

  const anon = client(server.base);
  assert.equal((await anon("GET", "/api/errors")).status, 401, "signed out: no");
  assert.equal(
    (await stranger("GET", "/api/errors")).status,
    404,
    "an ordinary user is not told the endpoint even exists"
  );

  const seen = await boss("GET", "/api/errors");
  assert.equal(seen.status, 200, "the admin can read it");
  assert.ok(Array.isArray(seen.body.errors));
  assert.ok(typeof seen.body.summary.total === "number");
});

test("health reports recent error counts so one URL can be watched", async () => {
  const anon = client(server.base);
  const health = await anon("GET", "/healthz");
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.db, "ok");
  assert.ok(health.body.errors, "health carries the error summary");
  assert.ok(health.body.errors.last_hour >= 1, "the client error above is counted");
});

test("passwords never reach the error log", async () => {
  const anon = client(server.base);
  // a failed login is the request most likely to be recorded with its body
  await anon("POST", "/api/auth/login", {
    email: "boss@example.com",
    password: "hunter2-should-never-be-stored",
  });

  const db = new DatabaseSync(server.dbFile);
  const rows = db.prepare("SELECT * FROM errors").all();
  db.close();

  const dump = JSON.stringify(rows);
  assert.ok(!dump.includes("hunter2"), "request bodies are never recorded");
});
