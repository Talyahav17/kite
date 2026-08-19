// P-045: the guards around Google sign-in.
//
// The full handshake cannot be tested here — it needs real Google credentials
// and a real browser round trip. What is tested is everything that protects the
// account when something goes wrong, which is where the risk actually lives:
// a callback that accepts a mismatched state is an account-takeover vector.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { startServer, client } from "./helpers.js";

let off; // no credentials configured
let on; // credentials configured (fake — nothing real is contacted)

before(async () => {
  off = await startServer({ port: 4115 });
  on = await startServer({
    port: 4116,
    env: {
      GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      KITE_BASE_URL: "http://127.0.0.1:4116",
    },
  });
});

after(() => {
  off?.stop();
  on?.stop();
});

test("without credentials, Google sign-in is simply absent", async () => {
  const api = client(off.base);

  const providers = await api("GET", "/api/auth/providers");
  assert.equal(providers.status, 200);
  assert.equal(providers.body.google, false, "the client must not offer a button that cannot work");

  assert.equal(
    (await api("GET", "/api/auth/google")).status,
    503,
    "starting the flow is refused rather than half-attempted"
  );
  assert.equal((await api("GET", "/api/auth/google/callback?code=x&state=y")).status, 503);
});

test("with credentials, the flow starts and hands out a state cookie", async () => {
  const providers = await client(on.base)("GET", "/api/auth/providers");
  assert.equal(providers.body.google, true);

  // don't follow the redirect to Google; inspect what we send
  const res = await fetch(`${on.base}/api/auth/google`, { redirect: "manual" });
  assert.equal(res.status, 302);

  const location = new URL(res.headers.get("location"));
  assert.equal(location.origin + location.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(location.searchParams.get("client_id"), "test-client-id.apps.googleusercontent.com");
  assert.equal(location.searchParams.get("response_type"), "code");
  assert.match(location.searchParams.get("scope"), /openid/);
  assert.equal(
    location.searchParams.get("redirect_uri"),
    "http://127.0.0.1:4116/api/auth/google/callback",
    "the redirect must match what is registered with Google, exactly"
  );

  const state = location.searchParams.get("state");
  assert.ok(state && state.length >= 20, "state must be long enough not to guess");

  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("kite_oauth_state"));
  assert.ok(cookie, "state is remembered in a cookie so the callback can check it");
  assert.match(cookie, /HttpOnly/, "script must not be able to read it");
  assert.ok(cookie.includes(state), "the cookie holds the same state that was sent");
});

test("a callback whose state does not match is refused", async () => {
  const api = client(on.base);

  // no cookie at all — a link fired from somewhere else entirely
  const noCookie = await api("GET", "/api/auth/google/callback?code=stolen&state=attacker");
  assert.equal(noCookie.status, 400, "an unsolicited callback is not a sign-in");
  assert.match(noCookie.body.error, /could not be verified/i);

  // a cookie that disagrees with the query — the CSRF case
  const res = await fetch(`${on.base}/api/auth/google/callback?code=stolen&state=attacker`, {
    headers: { Cookie: "kite_oauth_state=something-else" },
    redirect: "manual",
  });
  assert.equal(res.status, 400, "mismatched state must never sign anybody in");
  assert.ok(
    !(res.headers.getSetCookie() || []).some((c) => c.startsWith("trip_token")),
    "and must not hand out a session"
  );
});

test("missing code is refused even when the state is right", async () => {
  const res = await fetch(`${on.base}/api/auth/google/callback?state=abc`, {
    headers: { Cookie: "kite_oauth_state=abc" },
    redirect: "manual",
  });
  assert.equal(res.status, 400);
});

test("pressing cancel on Google's screen returns the visitor quietly", async () => {
  const res = await fetch(`${on.base}/api/auth/google/callback?error=access_denied&state=abc`, {
    headers: { Cookie: "kite_oauth_state=abc" },
    redirect: "manual",
  });
  assert.equal(res.status, 302, "a cancelled sign-in is not an error page");
  assert.match(res.headers.get("location"), /signin=cancelled/);
});

test("an account with no password cannot be signed into with one", async () => {
  // this is what a Google-only account looks like in the database
  const db = new DatabaseSync(on.dbFile);
  db.prepare(
    `INSERT INTO users (email, password_hash, name, auth_provider, provider_id)
     VALUES ('social@example.com', '', 'Social User', 'google', 'google-123')`
  ).run();
  db.close();

  const api = client(on.base);
  for (const password of ["", " ", "password123", "null", "undefined"]) {
    const res = await api("POST", "/api/auth/login", {
      email: "social@example.com",
      password,
    });
    assert.equal(res.status, 401, `"${password}" must not open a passwordless account`);
  }
});
