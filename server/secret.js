// P-001: the session signing key. It never lives in source.
//
// Order of resolution:
//   1. JWT_SECRET in the environment (how production must supply it)
//   2. JWT_SECRET in server/.env (git-ignored; how development supplies it)
//   3. development only — generate one and write it to server/.env
//
// In production, a missing secret is fatal. Booting with a predictable key
// would let anyone forge a session cookie for any account.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(dir, ".env");

if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const isProduction = process.env.NODE_ENV === "production";

function generateSecret() {
  return crypto.randomBytes(48).toString("base64url");
}

export function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;

  if (isProduction) {
    console.error(
      [
        "",
        "FATAL: JWT_SECRET is not set.",
        "",
        "Kite refuses to start in production without one — the fallback that",
        "used to be hard-coded here let anyone forge a session for any account.",
        "",
        "Generate one and set it in the environment:",
        "",
        `  JWT_SECRET=${generateSecret()}`,
        "",
        "Changing this value signs everyone out; that is expected.",
        "",
      ].join("\n")
    );
    process.exit(1);
  }

  // development convenience: mint one and persist it so sessions survive restarts
  const secret = generateSecret();
  fs.appendFileSync(
    envPath,
    `${fs.existsSync(envPath) ? "\n" : ""}JWT_SECRET=${secret}\n`,
    { mode: 0o600 }
  );
  console.warn(`[auth] generated a development JWT_SECRET in ${envPath}`);
  return secret;
}

export { isProduction };
