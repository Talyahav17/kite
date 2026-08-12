// P-027: in-memory rate limiting for the auth endpoints.
//
// Deliberately dependency-free and per-process. That is sufficient for Kite
// today (one API process, one SQLite file); if Kite is ever run as more than
// one process, the counters stop being shared and this needs to move to a
// store both processes can see.
//
// NOTE: keyed on req.ip. Behind a proxy or load balancer, Express reports the
// proxy's address for every request and one client could lock out everyone —
// set `app.set("trust proxy", 1)` there so req.ip is the real client.

const MINUTE = 60 * 1000;

export function rateLimit({ windowMs, max, message, skipSuccessful = false }) {
  /** @type {Map<string, number[]>} key -> timestamps of counted requests */
  const hits = new Map();

  // drop keys that have aged out, so the map cannot grow without bound
  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) {
      const live = times.filter((t) => t > cutoff);
      if (live.length) hits.set(key, live);
      else hits.delete(key);
    }
  }, 5 * MINUTE);
  sweep.unref();

  return function limiter(req, res, next) {
    const now = Date.now();
    const key = req.ip || "unknown";
    const times = (hits.get(key) || []).filter((t) => t > now - windowMs);

    if (times.length >= max) {
      const retryAfter = Math.ceil((times[0] + windowMs - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: message,
        retry_after_seconds: retryAfter,
      });
    }

    times.push(now);
    hits.set(key, times);

    // A correct password shouldn't spend the budget — only failures should.
    if (skipSuccessful) {
      res.on("finish", () => {
        if (res.statusCode < 400) {
          const remaining = (hits.get(key) || []).filter((t) => t !== now);
          if (remaining.length) hits.set(key, remaining);
          else hits.delete(key);
        }
      });
    }

    next();
  };
}
