// P-047: the day planner's rules.
//
// buildPlan is pure, so these run against it directly. The behaviour that
// matters most is what it refuses to do: repeat a place, suggest something
// already on the itinerary, or invent a hotel it has no data for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, planSummary, tripDays, rank } from "../planner.js";

const place = (id, name, type, city, avg = null, count = 0) => ({
  id,
  name,
  type,
  city,
  avg_stars: avg,
  rating_count: count,
  image_url: null,
});

const ROME = [
  place(1, "Colosseum", "attraction", "Rome"),
  place(2, "Pantheon", "attraction", "Rome"),
  place(3, "Vatican Museums", "attraction", "Rome"),
  place(4, "Testaccio Market", "food", "Rome"),
  place(5, "Trastevere", "activity", "Rome"),
];

const titles = (plan) => plan.flatMap((d) => d.items.map((i) => i.title));

test("a day gets a morning, a lunch and an afternoon", () => {
  const [day] = buildPlan({ days: ["2026-09-10"], places: ROME });
  assert.deepEqual(
    day.items.map((i) => [i.time, i.type]),
    [
      ["09:30", "attraction"],
      ["13:00", "food"],
      ["15:30", "activity"],
    ],
    "morning sightseeing, lunch, then something in the afternoon"
  );
});

test("no place is ever suggested twice across a trip", () => {
  const plan = buildPlan({ days: tripDays("2026-09-10", "2026-09-14"), places: ROME });
  const all = titles(plan);
  assert.equal(new Set(all).size, all.length, "a repeat would send someone somewhere twice");
});

test("what is already on the itinerary is not suggested again", () => {
  const plan = buildPlan({
    days: ["2026-09-10", "2026-09-11"],
    places: ROME,
    // the fuzzy rule used elsewhere: this covers "Colosseum"
    planned: ["colosseum & forum", "trastevere"],
  });
  const all = titles(plan);
  assert.ok(!all.includes("Colosseum"), "already planned under a longer name");
  assert.ok(!all.includes("Trastevere"));
  assert.ok(all.includes("Pantheon"), "but everything else is still fair game");
});

test("a day with nothing left says so instead of padding", () => {
  const plan = buildPlan({ days: tripDays("2026-09-10", "2026-09-14"), places: ROME });
  const empty = plan.filter((d) => d.items.length === 0);
  assert.ok(empty.length >= 1, "five days and five places cannot all be filled");
  assert.equal(planSummary(plan, { hotel: null }).empty_days, empty.length);
});

test("the plan follows the cities the itinerary already names", () => {
  const places = [...ROME, place(6, "Uffizi Gallery", "attraction", "Florence")];
  const plan = buildPlan({
    days: ["2026-09-10", "2026-09-11"],
    cityForDay: { "2026-09-11": "Florence" },
    places,
  });
  assert.ok(plan[0].items.every((i) => i.location === "Rome"), "day one stays in Rome");
  assert.equal(plan[1].city, "Florence");
  assert.ok(plan[1].items.every((i) => i.location === "Florence"), "day two is in Florence");
});

test("better-rated places are offered first", () => {
  const places = [
    place(1, "Quiet Corner", "attraction", "Rome", 2, 4),
    place(2, "Everyone Loves This", "attraction", "Rome", 4.8, 12),
    place(3, "Nobody Has Been", "attraction", "Rome"),
  ];
  const [day] = buildPlan({ days: ["2026-09-10"], places });
  assert.equal(day.items[0].title, "Everyone Loves This");

  const sorted = [...places].sort(rank).map((p) => p.name);
  assert.deepEqual(sorted, ["Everyone Loves This", "Quiet Corner", "Nobody Has Been"]);
});

// The point of the whole design.
test("a hotel is never invented — it is carried, or its absence is stated", () => {
  const withHotel = buildPlan({
    days: ["2026-09-10"],
    places: ROME,
    hotel: { title: "Hotel Artemide", location: "Via Nazionale 22" },
  });
  assert.equal(withHotel[0].hotel.title, "Hotel Artemide", "the traveller's own hotel is used");

  const without = buildPlan({ days: ["2026-09-10"], places: ROME });
  assert.equal(without[0].hotel, null, "and never fabricated when there is none");

  const notes = planSummary(without, { hotel: null }).notes.join(" ");
  assert.match(notes, /doesn't know where you're staying/i, "the gap is said out loud");

  const quiet = planSummary(withHotel, { hotel: { title: "Hotel Artemide" } }).notes.join(" ");
  assert.ok(!/where you're staying/i.test(quiet), "and not mentioned when it is known");
});

test("a trip to somewhere Kite knows nothing about plans nothing", () => {
  const plan = buildPlan({ days: ["2026-09-10", "2026-09-11"], places: [] });
  assert.equal(titles(plan).length, 0, "better an empty plan than an invented one");
  assert.equal(plan.length, 2, "the days are still there to fill by hand");
});
