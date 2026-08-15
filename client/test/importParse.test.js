// P-042: the paste importer. This is the only place Kite takes bulk free-form
// text, so it is the most likely thing to be handed something it did not expect
// — and a parser that quietly drops a row is worse than one that refuses it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows } from "../src/lib/importParse.js";

const DAYS = ["2026-10-01", "2026-10-02", "2026-10-03"];

test("a comma row becomes an item", () => {
  const [item] = parseRows("Colosseum, Day 2, 09:00, 35, attraction", DAYS);
  assert.equal(item.title, "Colosseum");
  assert.equal(item.date, "2026-10-02");
  assert.equal(item.time, "09:00");
  assert.equal(item.cost, "35");
  assert.equal(item.type, "attraction");
});

test("a tab row — what actually arrives from a spreadsheet — works too", () => {
  const [item] = parseRows("Dinner at Roscioli\tDay 2\t19:30\t90\tfood", DAYS);
  assert.equal(item.title, "Dinner at Roscioli");
  assert.equal(item.type, "food");
  assert.equal(item.cost, "90");
});

test("only the title is required", () => {
  const [item] = parseRows("Wander around", DAYS);
  assert.equal(item.title, "Wander around");
  assert.equal(item.date, "");
  assert.equal(item.cost, "");
  assert.equal(item.type, "other", "an unclassified item is a note");
});

test("blank lines and stray whitespace are skipped, not imported", () => {
  const rows = parseRows("\n  Louvre  \n\n   \nOrsay\n", DAYS);
  assert.deepEqual(
    rows.map((r) => r.title),
    ["Louvre", "Orsay"],
    "three blank lines must not become three empty items"
  );
});

test("dates are accepted as a real date or as a day number", () => {
  assert.equal(parseRows("X, 2026-10-03", DAYS)[0].date, "2026-10-03");
  assert.equal(parseRows("X, Day 3", DAYS)[0].date, "2026-10-03");
  assert.equal(parseRows("X, day 1", DAYS)[0].date, "2026-10-01", "case does not matter");
  assert.equal(
    parseRows("X, Day 9", DAYS)[0].date,
    "",
    "a day beyond the trip is ignored rather than guessed"
  );
  assert.equal(
    parseRows("X, 2026-12-25", DAYS)[0].date,
    "",
    "a date outside the trip is ignored too"
  );
});

test("money is read with or without a currency symbol", () => {
  assert.equal(parseRows("X, $35", DAYS)[0].cost, "35");
  assert.equal(parseRows("X, €12.50", DAYS)[0].cost, "12.50");
  assert.equal(parseRows("X, 8", DAYS)[0].cost, "8");
});

test("a leading number is a title, not a price", () => {
  const [item] = parseRows("101 Dalmatians Museum, 20", DAYS);
  assert.equal(item.title, "101 Dalmatians Museum", "the first cell is always the title");
  assert.equal(item.cost, "20");
});

test("times are normalised to two digits", () => {
  assert.equal(parseRows("X, 9:05", DAYS)[0].time, "09:05");
  assert.equal(parseRows("X, 19:30", DAYS)[0].time, "19:30");
});

test("quotes from a spreadsheet export are stripped", () => {
  const [item] = parseRows('"Hotel Artemide","Day 1","15:00"', DAYS);
  assert.equal(item.title, "Hotel Artemide");
  assert.equal(item.date, "2026-10-01");
  assert.equal(item.time, "15:00");
});

test("columns may arrive in any order", () => {
  const [item] = parseRows("Train to Florence, 55, 10:15, Day 2, transport", DAYS);
  assert.equal(item.title, "Train to Florence");
  assert.equal(item.cost, "55");
  assert.equal(item.time, "10:15");
  assert.equal(item.date, "2026-10-02");
  assert.equal(item.type, "transport");
});

test("a second unrecognised cell becomes the location", () => {
  const [item] = parseRows("Colosseum, Piazza del Colosseo, 09:00", DAYS);
  assert.equal(item.title, "Colosseum");
  assert.equal(item.location, "Piazza del Colosseo");
});

test("nothing at all parses to nothing at all", () => {
  for (const input of ["", "   ", "\n\n", null, undefined]) {
    assert.deepEqual(parseRows(input, DAYS), [], `${JSON.stringify(input)} yields no items`);
  }
});

test("a realistic paste imports every line", () => {
  const pasted = `Flight to Rome, Day 1, 08:30, 640, transport
Hotel Artemide, Day 1, 15:00, 180, hotel
Colosseum & Forum, Day 2, 09:00, 35, attraction
Dinner at Roscioli, Day 2, 19:30, 90, food
Print tickets`;
  const rows = parseRows(pasted, DAYS);
  assert.equal(rows.length, 5, "no line is silently dropped");
  assert.equal(rows[2].title, "Colosseum & Forum", "an ampersand is not a separator here");
  assert.equal(rows[4].type, "other");
  assert.equal(
    rows.reduce((sum, r) => sum + Number(r.cost || 0), 0),
    945,
    "the costs that arrive are the costs that were pasted"
  );
});
