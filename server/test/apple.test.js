// P-061: the guards around Sign in with Apple.
//
// The full handshake needs a paid Apple developer account, an HTTPS callback
// and a real browser round trip, so it cannot run here. What is tested is
// everything that protects the account when something goes wrong — a callback
// that accepts a mismatched state is an account-takeover vector — plus the one
// piece of Apple-specific machinery that CAN be checked offline: the client
// secret is a JWT we sign ourselves, so a real key proves it is well formed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { startServer, client } from "./helpers.js";

// A genuine P-256 key, generated here. Nothing real is contacted.
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const APPLE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });

const APPLE_ENV = {
  APPLE_CLIENT_ID: "com.kite.web",
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_KEY_ID: "KEY1234567",
  APPLE_PRIVATE_KEY,
};

let off;
let on;

/** the error message out of a raw fetch response body */
const res_body = (text) => JSON.parse(text || "{}").error || "";

before(async () => {
  off = await startServer({ port: 4118 });
  on = await startServer({
    port: 4119,
    env: { ...APPLE_ENV, KITE_BASE_URL: "https://kite.example" },
  });
});

after(() => {
  off?.stop();
  on?.stop();
});

// ---------- unconfigured ----------

test("without credentials, Apple sign-in is simply absent", async () => {
  const api = client(off.base);

  const providers = await api("GET", "/api/auth/providers");
  assert.equal(providers.body.apple, false, "never offer a button that cannot work");

  assert.equal((await api("GET", "/api/auth/apple")).status, 503);
  assert.equal((await api("POST", "/api/auth/apple/callback")).status, 503);
});

test("Google and Apple are reported independently", async () => {
  const providers = await client(on.base)("GET", "/api/auth/providers");
  assert.equal(providers.body.apple, true);
  assert.equal(providers.body.google, false, "one provider being on must not switch the other on");
});

// ---------- starting the flow ----------

test("the flow starts at Apple, asks for form_post, and pins the browser", async () => {
  const res = await fetch(`${on.base}/api/auth/apple`, { redirect: "manual" });
  assert.equal(res.status, 302);

  const url = new URL(res.headers.get("location"));
  assert.equal(url.origin + url.pathname, "https://appleid.apple.com/auth/authorize");
  assert.equal(url.searchParams.get("client_id"), "com.kite.web");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(
    url.searchParams.get("response_mode"),
    "form_post",
    "Apple forces form_post as soon as a scope is requested"
  );
  assert.equal(url.searchParams.get("scope"), "name email");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://kite.example/api/auth/apple/callback"
  );

  const state = url.searchParams.get("state");
  assert.ok(state && state.length >= 24, "state must be long and random");

  // The cookie has to survive a cross-site POST, which Lax does not.
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("kite_apple_state="));
  assert.ok(cookie, "the browser must be pinned to this attempt");
  assert.match(cookie, /SameSite=None/i, "Lax is not sent on Apple's cross-site POST");
  assert.match(cookie, /Secure/i, "SameSite=None is only accepted alongside Secure");
  assert.match(cookie, /HttpOnly/i);
});

// ---------- the callback, which is where the risk lives ----------

test("a callback whose state does not match is refused", async () => {
  // redirect:"manual" throughout — following it would contact Apple for real
  // and, worse, read the Set-Cookie off Apple's response instead of ours.
  const start = await fetch(`${on.base}/api/auth/apple`, { redirect: "manual" });
  const cookie = start.headers
    .getSetCookie()
    .find((c) => c.startsWith("kite_apple_state="))
    .split(";")[0];

  const res = await fetch(`${on.base}/api/auth/apple/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: new URLSearchParams({ code: "stolen-code", state: "not-the-state-we-issued" }),
    redirect: "manual",
  });
  assert.equal(res.status, 400, "otherwise anyone can feed a victim their own code");
  // The message matters, not just the status: without the state check this
  // request still fails 400, only later and for a different reason. Asserting
  // the status alone let a sabotaged build pass.
  assert.match(res_body(await res.text()), /could not be verified/i);
});

test("a callback with no state cookie at all is refused", async () => {
  const res = await client(on.base)("POST", "/api/auth/apple/callback", {
    code: "some-code",
    state: "some-state",
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /could not be verified/i);
});

test("missing code is refused even when the state is right", async () => {
  const res = await fetch(`${on.base}/api/auth/apple`, { redirect: "manual" });
  const state = new URL(res.headers.get("location")).searchParams.get("state");
  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith("kite_apple_state="))
    .split(";")[0];

  const back = await fetch(`${on.base}/api/auth/apple/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: new URLSearchParams({ state }),
    redirect: "manual",
  });
  assert.equal(back.status, 400);
  assert.match(res_body(await back.text()), /could not be verified/i);
});

test("pressing cancel on Apple's screen returns the visitor quietly", async () => {
  const res = await fetch(`${on.base}/api/auth/apple/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ error: "user_cancelled_authorize" }),
    redirect: "manual",
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/?signin=cancelled");
});

// ---------- the client secret, which is the Apple-specific trap ----------

test("the client secret is a short-lived ES256 JWT Apple would accept", async () => {
  const { clientSecret } = await import("../apple.js");
  const restore = { ...process.env };
  Object.assign(process.env, APPLE_ENV);

  try {
    const secret = clientSecret();
    const decoded = jwt.decode(secret, { complete: true });

    assert.equal(decoded.header.alg, "ES256", "Apple accepts nothing else");
    assert.equal(decoded.header.kid, "KEY1234567", "Apple finds the key by kid");

    // verifies against the matching public key — a wrong key would not
    const claims = jwt.verify(secret, publicKey, { algorithms: ["ES256"] });
    assert.equal(claims.iss, "TEAM123456");
    assert.equal(claims.sub, "com.kite.web");
    assert.equal(claims.aud, "https://appleid.apple.com");

    const life = claims.exp - claims.iat;
    assert.ok(life > 0 && life <= 15777000, "Apple rejects a secret living beyond six months");
    assert.ok(life <= 600, "minted per request, so it should be minutes not months");
  } finally {
    process.env = restore;
  }
});
