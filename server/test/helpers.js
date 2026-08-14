// Shared plumbing for the API tests: start the real server against a throwaway
// database, and talk to it over HTTP with a per-user cookie jar.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function startServer({ port, env = {} } = {}) {
  const dbFile = path.join(os.tmpdir(), `kite-test-${process.pid}-${port}.db`);
  const base = `http://127.0.0.1:${port}`;

  const proc = spawn(process.execPath, ["index.js"], {
    cwd: serverDir,
    env: {
      ...process.env,
      KITE_DB: dbFile,
      PORT: String(port),
      JWT_SECRET: "test-secret-not-used-anywhere-real",
      NODE_ENV: "test",
      // a test run signs up far more often than a person; raise unless overridden
      KITE_REGISTER_LIMIT: "500",
      KITE_LOGIN_LIMIT: "500",
      ...env,
    },
    stdio: "ignore",
  });

  for (let i = 0; i < 80; i++) {
    try {
      await fetch(`${base}/api/auth/me`);
      return {
        base,
        dbFile, // tests may seed fixtures the API cannot create
        stop() {
          proc.kill();
          for (const s of ["", "-wal", "-shm"]) fs.rmSync(dbFile + s, { force: true });
        },
      };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  proc.kill();
  throw new Error("server did not start");
}

/** a client with its own cookie jar — one per user under test */
export function client(base) {
  let cookie = "";
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.()[0];
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      body: text ? JSON.parse(text) : null,
    };
  };
}
