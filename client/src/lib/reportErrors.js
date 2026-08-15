// P-043: tell the server when the browser breaks.
//
// A server-side error log only sees half the story — a render that throws, or
// a failed import, leaves the user staring at a blank page while the server
// reports itself perfectly healthy.
//
// Rules this follows: never report the same error twice, never report more
// than a handful per page (a render loop can throw hundreds), and never let
// reporting throw, because an error handler that errors takes the page with it.
const MAX_PER_PAGE = 5;
const seen = new Set();
let sent = 0;

export function report(message, stack) {
  try {
    if (!message || sent >= MAX_PER_PAGE) return;
    const key = `${message}::${(stack || "").slice(0, 200)}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent++;

    // keepalive so the report survives the user navigating away from the crash
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({
        message: String(message).slice(0, 500),
        stack: stack ? String(stack).slice(0, 2000) : undefined,
        path: location.pathname, // never the query string; it can carry data
      }),
    }).catch(() => {});
  } catch {
    /* reporting must never be the thing that breaks the page */
  }
}

export function reportClientErrors() {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (e) => {
    report(e.message || "Uncaught error", e.error?.stack);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    report(reason?.message || `Unhandled rejection: ${reason}`, reason?.stack);
  });
}
