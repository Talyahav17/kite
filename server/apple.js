// P-061: Sign in with Apple.
//
// The same authorization-code shape as Google (oauth.js), but Apple differs in
// three ways that matter, and each one is a way to get this wrong:
//
//  1. The client secret is not a string you paste. It is a short-lived JWT you
//     sign yourself with an ES256 key from Apple, and it expires — six months
//     at the outside. It is minted per request here, so it can never go stale.
//  2. Apple returns to the app with a cross-site POST (response_mode=
//     form_post), not a redirect the browser treats as same-site. A SameSite
//     =Lax cookie is NOT sent on that POST, so the state cookie has to be
//     SameSite=None; Secure — which means Apple sign-in only works over HTTPS.
//     Apple refuses plain-http redirect URIs anyway, so this is consistent.
//  3. The person's name arrives once, in the body of that first POST, and
//     never again. Miss it and you have an account with no name for ever.
//
// Inert without APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID and
// APPLE_PRIVATE_KEY: /api/auth/providers reports apple:false and the client
// never shows the button.
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const AUTH_URL = "https://appleid.apple.com/auth/authorize";
const TOKEN_URL = "https://appleid.apple.com/auth/token";
const JWKS_URL = "https://appleid.apple.com/auth/keys";
const ISSUER = "https://appleid.apple.com";

const env = (name) => process.env[name]?.trim();

export const appleEnabled = () =>
  Boolean(
    env("APPLE_CLIENT_ID") &&
      env("APPLE_TEAM_ID") &&
      env("APPLE_KEY_ID") &&
      env("APPLE_PRIVATE_KEY")
  );

const clientId = () => env("APPLE_CLIENT_ID");

/** The .p8 file's contents. Newlines usually arrive escaped from a secret store. */
const privateKey = () => env("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");

export function redirectUri(req) {
  const base = env("KITE_BASE_URL");
  if (base) return `${base.replace(/\/$/, "")}/api/auth/apple/callback`;
  return `${req.protocol}://${req.get("host")}/api/auth/apple/callback`;
}

/**
 * Apple's client secret: a JWT we sign, not a password we hold.
 *
 * Minted fresh per exchange with a short life, so there is no stored secret to
 * expire quietly six months from now and take sign-in down with it.
 */
export function clientSecret() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: env("APPLE_TEAM_ID"),
      iat: now,
      exp: now + 5 * 60,
      aud: ISSUER,
      sub: clientId(),
    },
    privateKey(),
    { algorithm: "ES256", keyid: env("APPLE_KEY_ID") }
  );
}

export function authorizeUrl({ state, redirect }) {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirect,
    response_type: "code",
    // asking for name or email forces form_post; Apple rejects the pair
    // response_type=code with response_mode=query when a scope is requested
    response_mode: "form_post",
    scope: "name email",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeCode({ code, redirect }) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Apple rejected the code exchange (${res.status})`);

  const tokens = await res.json();
  if (!tokens.id_token) throw new Error("Apple returned no id_token");
  return tokens;
}

let jwksCache = { at: 0, keys: [] };
const JWKS_TTL = 60 * 60 * 1000;

async function signingKey(kid) {
  if (Date.now() - jwksCache.at > JWKS_TTL || !jwksCache.keys.length) {
    const res = await fetch(JWKS_URL);
    if (!res.ok) throw new Error(`Could not fetch Apple's keys (${res.status})`);
    jwksCache = { at: Date.now(), keys: (await res.json()).keys || [] };
  }

  const jwk = jwksCache.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error("Apple signed with a key we do not recognise");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

/**
 * Verify the ID token. Decoding without checking the signature would let
 * anyone mint a token claiming any address.
 *
 * `name` is not in the token — Apple sends it once, in the callback body, so
 * the caller passes whatever it managed to catch there.
 */
export async function verifyIdToken(idToken, nameFromCallback = "") {
  const header = jwt.decode(idToken, { complete: true })?.header;
  if (!header?.kid) throw new Error("Malformed id_token");

  const key = await signingKey(header.kid);
  const claims = jwt.verify(idToken, key, {
    algorithms: ["RS256"],
    audience: clientId(),
    issuer: ISSUER,
  });

  if (!claims.email) throw new Error("Apple did not return an email address");

  // Apple sends this as a string as often as a boolean. An unverified address
  // must never be trusted — it is how one account gets linked to someone else.
  if (claims.email_verified !== true && claims.email_verified !== "true")
    throw new Error("That Apple account's email address is not verified");

  const email = String(claims.email).trim().toLowerCase();
  return {
    providerId: claims.sub,
    email,
    name: nameFromCallback?.trim() || email.split("@")[0],
  };
}
