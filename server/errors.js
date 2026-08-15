// P-043: error monitoring.
//
// Three gaps this closes. A route that threw fell through to Express's default
// handler, which replies with an HTML stack trace — internals leaked straight
// to whoever triggered it. An async throw outside a request killed the process
// with nothing written down. And nothing anywhere told us either had happened.
//
// Errors are kept in Kite's own database rather than sent to a third party:
// no account to create, no key to hold, and nothing about a user's trips
// leaves the server. If that stops being enough, KITE_ALERT_WEBHOOK forwards
// a one-line summary to Slack or similar.
//
// PRIVACY: request bodies are never recorded. /api/auth/login carries a
// password in its body, so storing bodies would put plaintext passwords in the
// error log. Method, path and status only.
import { db } from "./db.js";

const KEEP = 500;
const WEBHOOK = () => process.env.KITE_ALERT_WEBHOOK?.trim();

db.exec(`
  CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL DEFAULT (datetime('now')),
    source TEXT NOT NULL,          -- server | client
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    stack TEXT,
    context TEXT                   -- JSON: method, path, status. Never a body.
  );
  CREATE INDEX IF NOT EXISTS idx_errors_at ON errors(at);
`);

const insert = db.prepare(
  "INSERT INTO errors (source, kind, message, stack, context) VALUES (?, ?, ?, ?, ?)"
);

// Don't let one broken deploy send a thousand alerts.
const recentlyAlerted = new Map();
const ALERT_COOLDOWN = 5 * 60 * 1000;

function alert(summary) {
  const url = WEBHOOK();
  if (!url) return;
  const last = recentlyAlerted.get(summary) || 0;
  if (Date.now() - last < ALERT_COOLDOWN) return;
  recentlyAlerted.set(summary, Date.now());

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `Kite: ${summary}` }),
  }).catch(() => {
    /* an alert that fails must never take the app down with it */
  });
}

/**
 * Write an error down. Never throws — a failure in here must not become the
 * thing that breaks the request it was trying to report on.
 */
export function recordError(err, { source = "server", ...context } = {}) {
  try {
    const kind = err?.name || "Error";
    const message = String(err?.message || err || "Unknown error").slice(0, 1000);
    const stack = err?.stack ? String(err.stack).slice(0, 4000) : null;

    insert.run(source, kind, message, stack, JSON.stringify(context));
    return { kind, message };
  } catch {
    return null;
  }
}

export function pruneErrors() {
  try {
    db.exec(
      `DELETE FROM errors WHERE id NOT IN
        (SELECT id FROM errors ORDER BY id DESC LIMIT ${KEEP})`
    );
  } catch {
    /* pruning is housekeeping; never let it matter */
  }
}

export function recentErrors(limit = 50) {
  return db
    .prepare("SELECT * FROM errors ORDER BY id DESC LIMIT ?")
    .all(Math.min(Number(limit) || 50, 200));
}

export function errorSummary() {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(at > datetime('now','-1 hour')) AS last_hour,
              SUM(at > datetime('now','-1 day')) AS last_day
       FROM errors`
    )
    .get();
  return {
    total: row.total || 0,
    last_hour: row.last_hour || 0,
    last_day: row.last_day || 0,
  };
}

/**
 * Express error handler. Must be registered last and must take four arguments,
 * or Express treats it as ordinary middleware and it never runs.
 */
export function errorMiddleware(isProduction) {
  return (err, req, res, next) => {
    const status = err.status || err.statusCode || 500;

    if (status >= 500) {
      recordError(err, {
        source: "server",
        method: req.method,
        path: req.originalUrl?.split("?")[0], // query strings can carry data
        status,
      });
      console.error(`[error] ${req.method} ${req.originalUrl} — ${err.message}`);
      alert(`${err.name || "Error"} on ${req.method} ${req.originalUrl}: ${err.message}`);
    }

    if (res.headersSent) return next(err);

    // Never return a stack to a user in production — that is how internals leak.
    res.status(status).json({
      error: status >= 500 ? "Something went wrong on our side." : err.message,
      ...(isProduction ? {} : { stack: err.stack }),
    });
  };
}

/**
 * Catch what escapes Express entirely. An unhandled rejection is recorded and
 * the process carries on; an uncaught exception leaves the process in an
 * unknown state, so it is recorded and then the process exits for the platform
 * to restart cleanly.
 */
export function installProcessHandlers() {
  process.on("unhandledRejection", (reason) => {
    console.error("[error] unhandled rejection —", reason);
    recordError(reason instanceof Error ? reason : new Error(String(reason)), {
      source: "server",
      path: "unhandledRejection",
    });
    alert(`Unhandled rejection: ${reason?.message || reason}`);
  });

  process.on("uncaughtException", (err) => {
    console.error("[error] uncaught exception —", err);
    recordError(err, { source: "server", path: "uncaughtException" });
    alert(`Uncaught exception, restarting: ${err.message}`);
    setTimeout(() => process.exit(1), 250); // give the write a moment to land
  });
}
