// P-046: destination search and the suggested trip name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchDestinations, COUNTRIES } from "../src/lib/countries.js";
import { suggestTripName, seasonOf } from "../src/lib/tripName.js";

// ---------- searching ----------

test("typing narrows to matching places", () => {
  const names = (q) => searchDestinations(q).map((p) => p.name);
  assert.ok(names("jap").includes("Japan"));
  assert.ok(names("gree").includes("Greece"));
  assert.ok(names("united").includes("United Kingdom"));
  assert.ok(names("united").includes("United States"));
});

test("a name that starts with the query comes first", () => {
  const [first] = searchDestinations("ind");
  assert.equal(first.name, "India", "not Finland, which merely contains 'ind'");
});

test("matching ignores case and stray spaces", () => {
  assert.equal(searchDestinations("  ITALY ")[0].name, "Italy");
  assert.equal(searchDestinations("jApAn")[0].name, "Japan");
});

test("cities Kite knows about are offered and labelled", () => {
  const rome = searchDestinations("rom").find((p) => p.name === "Rome");
  assert.ok(rome, "Rome is offered even though it is not a country");
  assert.equal(rome.kind, "city", "so the list can say which it is");
});

test("an empty query suggests nothing, and nonsense finds nothing", () => {
  assert.deepEqual(searchDestinations(""), []);
  assert.deepEqual(searchDestinations("   "), []);
  assert.deepEqual(searchDestinations("zzzzq"), []);
});

test("the list is capped so it cannot cover the form", () => {
  assert.ok(searchDestinations("a").length <= 8);
  assert.ok(COUNTRIES.length > 150, "and is a real list, not a sample");
});

// ---------- naming ----------

test("a name reads like the examples asked for", () => {
  assert.equal(
    suggestTripName({ destination: "Japan", start_date: "2027-04-02", end_date: "2027-04-12" }),
    "Spring in Japan"
  );
  assert.equal(
    suggestTripName({ destination: "Greece", start_date: "2027-07-10", end_date: "2027-07-20" }),
    "Summer in Greece"
  );
  assert.equal(
    suggestTripName({ destination: "Italy", start_date: "2026-09-10", end_date: "2026-09-14" }),
    "Autumn in Italy"
  );
});

test("seasons are flipped below the equator", () => {
  assert.equal(seasonOf(0, "Norway"), "Winter", "January up north");
  assert.equal(seasonOf(0, "Australia"), "Summer", "January in Sydney is not winter");
  assert.equal(
    suggestTripName({ destination: "Australia", start_date: "2027-01-05", end_date: "2027-01-20" }),
    "Summer in Australia"
  );
});

test("a short break over a weekend is a weekend", () => {
  // Fri 2 Oct 2026 → Sun 4 Oct 2026
  assert.equal(
    suggestTripName({ destination: "Lisbon", start_date: "2026-10-02", end_date: "2026-10-04" }),
    "Weekend in Lisbon"
  );
  // the same length midweek is not
  assert.equal(
    suggestTripName({ destination: "Lisbon", start_date: "2026-10-06", end_date: "2026-10-08" }),
    "Autumn in Lisbon"
  );
});

test("what is written in the notes outranks the season", () => {
  const trip = { destination: "Greece", start_date: "2027-07-10", end_date: "2027-07-20" };
  assert.equal(suggestTripName({ ...trip, notes: "our honeymoon!" }), "Honeymoon in Greece");
  assert.equal(suggestTripName({ ...trip, notes: "10th anniversary" }), "Anniversary in Greece");
  assert.equal(
    suggestTripName({ ...trip, notes: "client meetings in Athens" }),
    "Business trip to Greece",
    "'trip' takes 'to', not 'in'"
  );
  assert.equal(
    suggestTripName({ ...trip, notes: "the kids are coming" }),
    "Family trip to Greece"
  );
  assert.equal(suggestTripName({ ...trip, notes: "skiing" }), "Ski trip to Greece");
});

test("a multi-country destination names the first place", () => {
  assert.equal(
    suggestTripName({ destination: "France, Netherlands, Germany", start_date: "2026-10-03" }),
    "Autumn in France",
    "'Autumn in France, Netherlands, Germany' is not a name"
  );
});

test("it never invents what it does not know", () => {
  assert.equal(suggestTripName({ destination: "" }), "", "nowhere to go, nothing to name");
  assert.equal(suggestTripName({}), "");
  assert.equal(
    suggestTripName({ destination: "Japan" }),
    "Trip to Japan",
    "no dates yet, so no season is claimed"
  );
  assert.equal(
    suggestTripName({ destination: "Japan", start_date: "not-a-date" }),
    "Trip to Japan",
    "a broken date must not produce a broken name"
  );
});
