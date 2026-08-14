// P-040: the auth rate limits, proved rather than assumed. Runs its own server
// with deliberately tiny limits — the main suite raises them, and a limiter you
// only ever raise is a limiter nobody has tested.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, client } from "./helpers.js";

let server;

before(async () => {
  server = await startServer({
    port: 4112,
    env: { KITE_REGISTER_LIMIT: "2", KITE_LOGIN_LIMIT: "3" },
  });
});

after(() => server?.stop());

test("registration is capped per network", async () => {
  const api = client(server.base);

  for (let i = 1; i <= 2; i++) {
    const res = await api("POST", "/api/auth/register", {
      name: `User ${i}`,
      email: `capped${i}@example.com`,
      password: "password123",
    });
    assert.equal(res.status, 200, `signup ${i} should be allowed`);
  }

  const blocked = await api("POST", "/api/auth/register", {
    name: "Third",
    email: "capped3@example.com",
    password: "password123",
  });
  assert.equal(blocked.status, 429, "the third signup is refused");
  assert.ok(blocked.headers.get("retry-after"), "must say when to come back");
  assert.match(blocked.body.error, /too many/i);
});

test("failed sign-ins are capped, but successful ones never count", async () => {
  const api = client(server.base);

  // succeed far more often than the cap — a real user must never lock themselves out
  for (let i = 0; i < 6; i++) {
    const ok = await api("POST", "/api/auth/login", {
      email: "capped1@example.com",
      password: "password123",
    });
    assert.equal(ok.status, 200, "a correct password never spends the budget");
  }

  for (let i = 1; i <= 3; i++) {
    const bad = await api("POST", "/api/auth/login", {
      email: "capped1@example.com",
      password: "WRONG",
    });
    assert.equal(bad.status, 401, `failure ${i} is rejected, not throttled yet`);
  }

  const throttled = await api("POST", "/api/auth/login", {
    email: "capped1@example.com",
    password: "WRONG",
  });
  assert.equal(throttled.status, 429, "the fourth failure is throttled");

  // and once throttled, even the right password is refused — that is the point
  const correct = await api("POST", "/api/auth/login", {
    email: "capped1@example.com",
    password: "password123",
  });
  assert.equal(correct.status, 429, "an attacker who guesses right is still stopped");
});
