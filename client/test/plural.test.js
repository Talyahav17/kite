import { test } from "node:test";
import assert from "node:assert/strict";
import { plural } from "../src/lib/plural.js";

test("one is singular, everything else is not", () => {
  assert.equal(plural(1, "item"), "1 item");
  assert.equal(plural(2, "item"), "2 items");
  assert.equal(plural(0, "item"), "0 items", "zero takes the plural");
  assert.equal(plural(1, "day"), "1 day");
  assert.equal(plural(11, "day"), "11 days");
});

test("an irregular plural can be given explicitly", () => {
  assert.equal(plural(1, "city", "cities"), "1 city");
  assert.equal(plural(3, "city", "cities"), "3 cities");
});
