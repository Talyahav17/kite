// P-042: dates, which is where Kite's first bug lived.
//
// T-001 shifted every day of a trip by one for anyone east of UTC, because a
// date was round-tripped through toISOString. These tests pin the behaviour
// that fix depends on; the timezone cases run in their own processes, since a
// process only reads TZ once at startup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ymd, tripDays, tripStatus, fmtRange, fmtDay } from "../src/lib/dates.js";

const libPath = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  "src/lib/dates.js"
);

test("ymd reads the local calendar date, not the UTC one", () => {
  // 1 January, ten minutes past midnight — the case that breaks under UTC
  assert.equal(ymd(new Date(2026, 0, 1, 0, 10)), "2026-01-01");
  assert.equal(ymd(new Date(2026, 11, 31, 23, 50)), "2026-12-31");
  assert.equal(ymd(new Date(2026, 8, 5)), "2026-09-05", "months are 1-based in the string");
});

test("a trip covers both its end days", () => {
  assert.deepEqual(tripDays("2026-09-10", "2026-09-14"), [
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
    "2026-09-13",
    "2026-09-14",
  ]);
  assert.deepEqual(tripDays("2026-09-10", "2026-09-10"), ["2026-09-10"], "a one-day trip");
  assert.deepEqual(tripDays("2026-09-10", "2026-09-09"), [], "backwards yields nothing");
});

test("day counting survives a month and a leap day", () => {
  assert.deepEqual(tripDays("2026-01-30", "2026-02-02"), [
    "2026-01-30",
    "2026-01-31",
    "2026-02-01",
    "2026-02-02",
  ]);
  assert.equal(tripDays("2028-02-27", "2028-03-01").length, 4, "2028 has a 29 February");
  assert.ok(tripDays("2026-01-01", "2027-01-01").length <= 120, "runaway ranges are capped");
});

// The regression that started it all — T-001.
for (const tz of ["Pacific/Kiritimati", "Asia/Tokyo", "UTC", "America/Los_Angeles", "Pacific/Midway"]) {
  test(`days are the same calendar days in ${tz}`, () => {
    const script = `
      import { tripDays } from ${JSON.stringify(libPath)};
      process.stdout.write(JSON.stringify(tripDays("2026-09-10", "2026-09-12")));
    `;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    });
    assert.deepEqual(
      JSON.parse(out),
      ["2026-09-10", "2026-09-11", "2026-09-12"],
      `${tz} must not shift the days — this is T-001`
    );
  });
}

test("trip status reads past, present and future", () => {
  const today = "2026-08-15";
  assert.equal(tripStatus("2026-07-01", "2026-07-10", today).kind, "past");
  assert.equal(tripStatus("2026-07-01", "2026-07-10", today).label, "Completed");

  const now = tripStatus("2026-08-13", "2026-08-17", today);
  assert.equal(now.kind, "now");
  assert.equal(now.label, "Day 3 of 5 · happening now");
  assert.ok(now.live, "a live trip drives the pulsing dot");

  assert.equal(
    tripStatus("2026-08-15", "2026-08-20", today).label,
    "Day 1 of 6 · happening now",
    "a trip starting today has already started"
  );
  assert.equal(tripStatus("2026-08-16", "2026-08-20", today).label, "Tomorrow");
  assert.equal(tripStatus("2026-08-25", "2026-08-30", today).label, "In 10 days");
  assert.equal(tripStatus("2026-08-25", "2026-08-30", today).kind, "soon");
  assert.equal(tripStatus("2026-12-20", "2026-12-28", today).kind, "future");
});

test("the boundaries between statuses are exact", () => {
  const today = "2026-08-15";
  assert.equal(tripStatus("2026-08-14", "2026-08-14", today).kind, "past", "ended yesterday");
  assert.equal(tripStatus("2026-08-15", "2026-08-15", today).kind, "now", "a single day, today");
  assert.equal(tripStatus("2026-09-14", "2026-09-20", today).kind, "soon", "30 days is still soon");
  assert.equal(tripStatus("2026-09-15", "2026-09-20", today).kind, "future", "31 days is not");
});

test("ranges read as a person would write them", () => {
  const thisYear = new Date(2026, 0, 1);
  assert.equal(fmtRange("2026-09-10", "2026-09-14", thisYear), "Sep 10 – Sep 14");
  assert.equal(
    fmtRange("2027-01-02", "2027-01-06", thisYear),
    "Jan 2 – Jan 6, 2027",
    "another year is spelled out"
  );
  assert.match(fmtDay("2026-09-10"), /Thursday/, "day names come from the calendar date");
});
