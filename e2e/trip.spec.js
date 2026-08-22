import { test, expect } from "@playwright/test";
import { freshUser, signUp, createTrip } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await signUp(page, freshUser("trip"));
});

// P-046. Neither of these behaviours is reachable by the render smoke tests:
// the list only appears once a keystroke lands, and the name only changes as a
// consequence of choosing from it.
test("typing a few letters offers matching countries", async ({ page }) => {
  await page.getByRole("button", { name: "+ New trip" }).click();
  const field = page.getByRole("combobox");

  await expect(field).toHaveAttribute("aria-expanded", "false");

  await field.fill("jap");
  await expect(page.getByRole("option", { name: "Japan", exact: true })).toBeVisible();
  await expect(field).toHaveAttribute("aria-expanded", "true");

  await field.fill("zzzzzz");
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("the trip names itself from the destination and the dates", async ({ page }) => {
  await page.getByRole("button", { name: "+ New trip" }).click();
  await page.getByLabel("Start date").fill("2027-04-10");
  await page.getByLabel("End date").fill("2027-04-14");

  await page.getByRole("combobox").fill("jap");
  await page.getByRole("option", { name: "Japan", exact: true }).click();

  await expect(page.getByLabel("Trip name")).toHaveValue("Spring in Japan");
});

test("a name the traveller types themselves is left alone", async ({ page }) => {
  await page.getByRole("button", { name: "+ New trip" }).click();
  await page.getByLabel("Trip name").fill("Dad's 60th");
  await page.getByLabel("Start date").fill("2027-04-10");
  await page.getByLabel("End date").fill("2027-04-14");

  await page.getByRole("combobox").fill("jap");
  await page.getByRole("option", { name: "Japan", exact: true }).click();

  await expect(page.getByLabel("Trip name")).toHaveValue("Dad's 60th");
});

test("a created trip opens, and is still there after a refresh", async ({ page }) => {
  await createTrip(page, {
    destination: "Japan",
    start: "2027-04-10",
    end: "2027-04-12",
    title: "Cherry blossom run",
  });

  await expect(page.getByRole("heading", { name: "Cherry blossom run" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Cherry blossom run" })).toBeVisible();

  await page.getByRole("link", { name: /All trips/ }).click();
  await expect(page.getByText("Cherry blossom run")).toBeVisible();
});

// The other half of P-052: a trip that genuinely is not there must still say
// so. Fixing the lapsed-session case is worthless if it swallows a real 404.
test("a trip that does not exist still says so", async ({ page }) => {
  await page.goto("/trips/999999");
  await expect(page.getByText("Trip not found")).toBeVisible();
  await expect(page.getByRole("link", { name: /Back to trips/ })).toBeVisible();
});
