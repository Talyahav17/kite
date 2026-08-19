// P-044: render smoke tests.
//
// T-009 got through 52 tests and a clean build: a component was referenced but
// no longer existed, and JSX only resolves that at runtime. Nothing here mocks
// a browser — react-dom/server renders the real components to markup, which is
// enough to catch a missing component, a bad prop access, or an import that
// silently resolved to undefined.
//
// What this does NOT cover, so it is not mistaken for more than it is: effects
// do not run, so anything that only happens after data arrives is untested,
// and nothing here clicks. It is a smoke test.
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { UserContext } from "../src/App.jsx";
import Trips, { TripCard } from "../src/Trips.jsx";
import TripDetail from "../src/TripDetail.jsx";
import SharedTrip from "../src/SharedTrip.jsx";
import Auth from "../src/Auth.jsx";
import KiteLogo from "../src/KiteLogo.jsx";
import SkyPanel from "../src/SkyPanel.jsx";
import ImportItems from "../src/ImportItems.jsx";
import { BudgetCard, DayRoute, ItemRow } from "../src/Itinerary.jsx";
import { Stars, StarPicker } from "../src/Stars.jsx";

const h = React.createElement;

/** Render inside a router and a signed-in user, the way the app runs. */
function render(element, { user = { id: 1, name: "Test User", email: "t@example.com" } } = {}) {
  return renderToStaticMarkup(
    h(
      MemoryRouter,
      null,
      h(UserContext.Provider, { value: { user, setUser() {} } }, element)
    )
  );
}

const TRIP = {
  id: 1,
  title: "Summer in Italy",
  destination: "Italy",
  start_date: "2026-09-10",
  end_date: "2026-09-14",
  notes: "Rome then Florence.",
  budget: 1500,
  item_count: 11,
  share_token: null,
};

const ITEMS = [
  { id: 1, date: "2026-09-10", time: "08:30", type: "transport", title: "Flight to Rome", location: "JFK", cost: 640, notes: "", link: "" },
  { id: 2, date: "2026-09-10", time: "15:00", type: "hotel", title: "Hotel Artemide", location: "Via Nazionale 22", cost: 180, notes: "", link: "https://example.com" },
  { id: 3, date: null, time: "", type: "other", title: "Print tickets", location: "", cost: null, notes: "", link: "" },
];

const DAYS = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"];

// ---------- the exact class of bug that got through ----------

test("a trip card renders — the render that broke in T-009", () => {
  const html = render(h(TripCard, { trip: TRIP }));
  assert.match(html, /Summer in Italy/);
  assert.match(html, /Italy/);
  assert.match(html, /Sep 10 – Sep 14/);
  assert.match(html, /5 days/);
  assert.match(html, /11 items/);
  assert.match(html, /href="\/trips\/1"/, "the whole card is a link into the trip");
});

test("a card copes with a trip that has barely been filled in", () => {
  const bare = { id: 2, title: "Untitled", start_date: "2026-10-01", end_date: "2026-10-01", item_count: 0 };
  const html = render(h(TripCard, { trip: bare }));
  assert.match(html, /Untitled/);
  assert.match(html, /1 day\b/, "one day, not '1 days'");
  assert.match(html, /0 items/);
});

// ---------- pages ----------

test("every page renders without throwing", () => {
  const pages = {
    "trips list": h(Trips),
    "trip detail": h(TripDetail),
    "shared trip": h(SharedTrip),
    "sign in": h(Auth),
    "paste import": h(ImportItems, { tripId: 1, days: DAYS, onClose() {}, onImported() {} }),
  };
  for (const [name, element] of Object.entries(pages)) {
    assert.doesNotThrow(() => render(element), `${name} must render`);
  }
});

test("the sign-in page shows what a signed-out visitor needs", () => {
  const html = render(h(Auth), { user: null });
  assert.match(html, /Sign in to Kite/);
  assert.match(html, /Create an account/);
  assert.match(html, /type="password"/);
  assert.match(html, /Your next trip is in the air/);
});

// ---------- itinerary pieces, with real data ----------

test("the budget card adds up and shows what is left", () => {
  const html = render(h(BudgetCard, { items: ITEMS, days: DAYS, budget: 1500 }));
  assert.match(html, /820/, "the day's spend");
  assert.match(html, /680/, "1500 - 820 remaining");
  assert.match(html, /left of your/);
});

test("a budget card with no target shows totals only", () => {
  const html = render(h(BudgetCard, { items: ITEMS, days: DAYS, budget: null }));
  assert.match(html, /Budget/);
  assert.ok(!html.includes("left of your"), "nothing to be left of");
});

test("an item row shows time, type, cost and its booking link", () => {
  const html = render(h("ul", null, h(ItemRow, { item: ITEMS[1], onEdit() {} })));
  assert.match(html, /15:00/);
  assert.match(html, /Hotel Artemide/);
  assert.match(html, /Via Nazionale 22/);
  assert.match(html, /180/);
  assert.match(html, /https:\/\/example\.com/);
});

test("an undated item still renders", () => {
  const html = render(h("ul", null, h(ItemRow, { item: ITEMS[2] })));
  assert.match(html, /Print tickets/);
  assert.match(html, /—/, "no time shows a dash rather than blank");
});

test("a day route appears only when there is a route to show", () => {
  assert.match(render(h(DayRoute, { items: ITEMS })), /Open route/);
  assert.equal(
    render(h(DayRoute, { items: [ITEMS[0]] })),
    "",
    "one stop is not a route"
  );
});

// ---------- ratings and brand ----------

test("stars show a score, or say plainly that there is none", () => {
  assert.match(render(h(Stars, { value: 4.5, count: 2 })), /4\.5/);
  assert.match(render(h(Stars, { value: null, count: 0 })), /Not rated yet/);
  assert.match(render(h(StarPicker, { value: 0, onPick() {} })), /aria-label="1 star"/);
});

test("the logo renders in both palettes, and the illustration draws", () => {
  const brand = render(h(KiteLogo, { height: 44 }));
  const reverse = render(h(KiteLogo, { height: 44, variant: "reverse" }));
  assert.match(brand, /<svg/);
  assert.match(brand, /Kite<\/text>/, "the wordmark is part of the artwork");
  assert.notEqual(brand, reverse, "the reversed palette is actually different");
  assert.match(render(h(SkyPanel)), /<svg/);
});

test("two logos on one page do not share gradient ids", () => {
  const html = render(h("div", null, h(KiteLogo, { height: 20 }), h(KiteLogo, { height: 20, variant: "reverse" })));
  // matched by shape, not by name, so renaming a gradient does not break this
  const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 2, "each logo defines its own gradients");
  assert.equal(new Set(ids).size, ids.length, "shared ids repaint one logo with the other's colours");
});
