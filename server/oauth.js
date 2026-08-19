// P-045: Sign in with Google.
//
// The authorization-code flow, server side, with no new dependency: Node's
// crypto can build a public key from Google's JWKS and jsonwebtoken verifies
// the RS256 signature. Rolling this by hand is only reasonable because the
// verification is done properly — signature, issuer, audience and expiry are
// all checked, and an unverified email is refused.
//
// Inert without GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: /api/auth/providers
// reports google:false and the client never shows the button.
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const googleEnabled = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());

const clientId = () => process.env.GOOGLE_CLIENT_ID.trim();
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET.trim();

/**
 * Where Google sends the browser back. It must match a redirect URI registered
 * in the Google console exactly, so it is derived from an explicit base URL
 * when one is set rather than guessed from a header an attacker can spoof.
 */
export function redirectUri(req) {
  const base = process.env.KITE_BASE_URL?.trim();
  if (base) return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
  return `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
}

export function authorizeUrl({ state, redirect }) {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirect,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
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
  if (!res.ok) throw new Error(`Google rejected the code exchange (${res.status})`);

  const tokens = await res.json();
  if (!tokens.id_token) throw new Error("Google returned no id_token");
  return tokens;
}

// Google rotates its signing keys, so the set is cached briefly rather than
// pinned — but never trusted beyond its lifetime.
let jwksCache = { at: 0, keys: [] };
const JWKS_TTL = 60 * 60 * 1000;

async function signingKey(kid) {
  if (Date.now() - jwksCache.at > JWKS_TTL || !jwksCache.keys.length) {
    const res = await fetch(JWKS_URL);
    if (!res.ok) throw new Error(`Could not fetch Google's keys (${res.status})`);
    jwksCache = { at: Date.now(), keys: (await res.json()).keys || [] };
  }

  const jwk = jwksCache.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error("Google signed with a key we do not recognise");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

/**
 * Verify the ID token properly. Decoding it without checking the signature
 * would let anyone mint a token claiming to be any email address.
 */
export async function verifyIdToken(idToken) {
  const header = jwt.decode(idToken, { complete: true })?.header;
  if (!header?.kid) throw new Error("Malformed id_token");

  const key = await signingKey(header.kid);
  const claims = jwt.verify(idToken, key, {
    algorithms: ["RS256"],
    audience: clientId(),
    issuer: ISSUERS,
  });

  if (!claims.email) throw new Error("Google did not return an email address");

  // An unverified address must never be trusted: it is how one account gets
  // linked to another person's email.
  if (claims.email_verified !== true && claims.email_verified !== "true")
    throw new Error("That Google account's email address is not verified");

  return {
    providerId: claims.sub,
    email: String(claims.email).trim().toLowerCase(),
    name: claims.name || claims.given_name || claims.email.split("@")[0],
  };
}
