import { test, expect } from "@playwright/test";
import { freshUser, signUp, createTrip } from "./helpers.js";

// P-047. The planner has unit tests over buildPlan, but nothing until now has
// opened the dialog, unticked a suggestion and checked that exactly the rest
// reach the itinerary.
test("a proposed plan can be reviewed and added to the trip", async ({ page }) => {
  await signUp(page, freshUser("plan"));
  await createTrip(page, { destination: "Japan", start: "2027-04-10", end: "2027-04-12" });

  await page.getByRole("button", { name: "Plan my days" }).click();
  await expect(page.getByRole("heading", { name: "A plan for each day" })).toBeVisible();

  const suggestions = page.locator(".plan-item");
  await expect(suggestions.first()).toBeVisible();
  const offered = await suggestions.count();
  expect(offered).toBeGreaterThan(0);

  // drop one, and the button must count down with it
  await suggestions.first().getByRole("checkbox").uncheck();
  const add = page.getByRole("button", { name: /Add \d+ to my trip/ });
  await expect(add).toHaveText(`Add ${offered - 1} to my trip`);

  await add.click();
  await expect(page.getByRole("heading", { name: "A plan for each day" })).toBeHidden();

  // nothing is written until the traveller says so, and then it is written
  await expect(page.locator(".item-list li")).toHaveCount(offered - 1);
  await page.reload();
  await expect(page.locator(".item-list li")).toHaveCount(offered - 1);
});

test("closing the planner adds nothing", async ({ page }) => {
  await signUp(page, freshUser("plannope"));
  await createTrip(page, { destination: "Japan", start: "2027-04-10", end: "2027-04-11" });

  await page.getByRole("button", { name: "Plan my days" }).click();
  await expect(page.locator(".plan-item").first()).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();

  await page.reload();
  await expect(page.locator(".item-list li")).toHaveCount(0);
});
