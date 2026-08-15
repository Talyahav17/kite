// Date handling, kept apart from the components so it can be tested directly.
//
// This is the code that produced T-001, where every day of a trip shifted by
// one for anyone east of UTC, so it is worth reading carefully: dates here are
// plain calendar days ("2026-09-10"), never instants. Anything that converts
// through UTC will reintroduce that bug.

/** Local calendar date as YYYY-MM-DD. toISOString would shift east of UTC. */
export function ymd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayYmd() {
  return ymd(new Date());
}

/** Every calendar day of the trip, inclusive of both ends. */
export function tripDays(start, end) {
  const days = [];
  const d = new Date(start + "T00:00:00");
  const stop = new Date(end + "T00:00:00");
  while (d <= stop && days.length < 120) {
    days.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Where the trip sits relative to today, so a card can say something live. */
export function tripStatus(start, end, today = todayYmd()) {
  if (today > end) return { kind: "past", label: "Completed" };
  if (today >= start) {
    const days = tripDays(start, end);
    const n = days.indexOf(today) + 1;
    return { kind: "now", label: `Day ${n} of ${days.length} · happening now`, live: true };
  }
  // Anything from here is still in the future: a trip starting today already
  // matched `today >= start` above and reads as "Day 1 of N · happening now",
  // which is both true and more useful than "Starts today".
  const diff = Math.round(
    (new Date(start + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000
  );
  if (diff === 1) return { kind: "soon", label: "Tomorrow" };
  if (diff <= 30) return { kind: "soon", label: `In ${diff} days` };
  return { kind: "future", label: `In ${diff} days` };
}

export function fmtRange(start, end, now = new Date()) {
  const opts = { month: "short", day: "numeric" };
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const year = e.getFullYear() !== now.getFullYear() ? `, ${e.getFullYear()}` : "";
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}${year}`;
}

export function fmtDay(date) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
