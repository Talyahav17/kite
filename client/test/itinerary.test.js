// P-042: ordering and place matching — the two rules behind T-006 and T-007.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortItems, citiesOf } from "../src/lib/itinerary.js";
import { coverFor, coverStyle } from "../src/covers.js";

const titles = (list) => sortItems(list).map((i) => i.title);

test("items sort by day, then time, then insertion — T-006", () => {
  const list = [
    { id: 3, date: "2026-10-02", time: "18:00", title: "Dinner" },
    { id: 1, date: "2026-10-01", time: "08:00", title: "Flight" },
    { id: 2, date: "2026-10-02", time: "10:30", title: "Museum" },
  ];
  assert.deepEqual(titles(list), ["Flight", "Museum", "Dinner"]);
});

test("moving an item to another day puts it in that day's order — T-006", () => {
  // exactly the case the tester hit: a 13:00 item moved onto a day holding 10:30
  const before = [
    { id: 1, date: "2026-10-02", time: "10:30", title: "Orsay" },
    { id: 2, date: "2026-10-01", time: "13:00", title: "Louvre" },
  ];
  const moved = before.map((i) => (i.id === 2 ? { ...i, date: "2026-10-02" } : i));
  assert.deepEqual(titles(moved), ["Orsay", "Louvre"], "10:30 comes before 13:00");
});

test("undated items sit after dated ones, never before", () => {
  const list = [
    { id: 1, date: null, time: "", title: "Someday" },
    { id: 2, date: "2026-10-01", time: "09:00", title: "Dated" },
  ];
  assert.deepEqual(titles(list), ["Dated", "Someday"]);
});

test("items sharing a day and time keep a stable order", () => {
  const list = [
    { id: 7, date: "2026-10-01", time: "09:00", title: "Second" },
    { id: 4, date: "2026-10-01", time: "09:00", title: "First" },
  ];
  assert.deepEqual(titles(list), ["First", "Second"], "id breaks the tie");
});

test("sorting does not mutate what it was given", () => {
  const list = [
    { id: 2, date: "2026-10-02", time: "", title: "B" },
    { id: 1, date: "2026-10-01", time: "", title: "A" },
  ];
  const snapshot = list.map((i) => i.title);
  sortItems(list);
  assert.deepEqual(
    list.map((i) => i.title),
    snapshot,
    "React state must not be reordered underneath us"
  );
});

test("a multi-city destination becomes several places — T-007", () => {
  assert.deepEqual(
    citiesOf({ destination: "France, Netherlands, Germany" }, []),
    ["France", "Netherlands", "Germany"],
    "the exact string that showed no suggestions at all"
  );
  assert.deepEqual(citiesOf({ destination: "Rome & Florence" }, []), ["Rome", "Florence"]);
  assert.deepEqual(citiesOf({ destination: "Tokyo and Kyoto" }, []), ["Tokyo", "Kyoto"]);
  assert.deepEqual(citiesOf({ destination: "Lisbon → Porto" }, []), ["Lisbon", "Porto"]);
});

test("city items outrank the destination field, without duplicating it", () => {
  const items = [
    { type: "city", title: "Rome" },
    { type: "city", title: "Rome" },
    { type: "attraction", title: "Colosseum" },
    { type: "city", title: "Florence" },
  ];
  assert.deepEqual(
    citiesOf({ destination: "Italy" }, items),
    ["Rome", "Florence", "Italy"],
    "cities first, no repeats, country still offered"
  );
});

test("an empty trip asks about nowhere", () => {
  assert.deepEqual(citiesOf({ destination: "" }, []), []);
  assert.deepEqual(citiesOf({}, []), []);
  assert.deepEqual(citiesOf({ destination: " , , " }, []), [], "punctuation alone is not a place");
});

test("a trip keeps its cover for life, and neighbours differ", () => {
  assert.deepEqual(coverFor(4), coverFor(4), "the same trip always looks the same");
  const consecutive = [1, 2, 3, 4, 5, 6].map((id) => coverFor(id).name);
  assert.equal(new Set(consecutive).size, 6, "trips made in a row never share a cover");

  const style = coverStyle(3);
  assert.match(style.backgroundImage, /^linear-gradient/);
  assert.ok(style.color, "covers carry the ink colour their text needs");
});
