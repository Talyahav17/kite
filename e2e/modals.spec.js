import { test, expect } from "@playwright/test";
import { freshUser, signUp, createTrip } from "./helpers.js";

// P-054 moved every modal onto one shell. Three of them had no coverage at
// all, including the two that submit a form — and the shell passes onSubmit
// through a props spread, so if that wiring broke, saving would silently stop
// working with nothing to catch it.
test.beforeEach(async ({ page }) => {
  await signUp(page, freshUser("modal"));
  await createTrip(page, {
    destination: "Japan",
    start: "2027-04-10",
    end: "2027-04-12",
    title: "Modal trip",
  });
});

test("an item can be added through the edit modal and then deleted", async ({ page }) => {
  await page.getByText("Nothing planned yet — click to add something").first().click();

  await expect(page.getByRole("heading", { name: "Add to itinerary" })).toBeVisible();
  await page.getByLabel("Title").fill("Ramen at Ichiran");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("Ramen at Ichiran")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Ramen at Ichiran")).toBeVisible();

  // and out again, through the confirmation that sits on top of the edit modal
  await page.getByText("Ramen at Ichiran").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Delete “Ramen at Ichiran”/ })).toBeVisible();
  // scoped to the top layer: the edit modal underneath has a Delete too, and
  // it is earlier in the DOM
  await page
    .locator(".modal-backdrop-top")
    .getByRole("button", { name: "Delete", exact: true })
    .click();

  await expect(page.getByText("Ramen at Ichiran")).toHaveCount(0);
});

test("a budget can be set through its modal and survives a reload", async ({ page }) => {
  await page.getByRole("button", { name: "Set budget" }).click();
  await expect(page.getByRole("heading", { name: "Trip budget" })).toBeVisible();

  await page.getByLabel("Budget ($)").fill("2400");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name: "Trip budget" })).toBeHidden();
  await page.reload();
  await expect(page.getByText(/2,400/)).toBeVisible();
});

test("clicking the backdrop closes a modal, clicking inside it does not", async ({ page }) => {
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share this trip" })).toBeVisible();

  // inside the card — must survive, or every form would close on first click
  await page.getByRole("heading", { name: "Share this trip" }).click();
  await expect(page.getByRole("heading", { name: "Share this trip" })).toBeVisible();

  await page.locator(".modal-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("heading", { name: "Share this trip" })).toBeHidden();
});

// The point of P-054. Three fixes were silently useless because the modal had
// nowhere to display an error, and no test would have noticed — so here is one.
// Two tabs, one session: the trip is deleted in the second while a modal is
// open in the first, so saving fails for a reason that is not a lapsed session
// and therefore has to be shown rather than redirected away from.
test("a modal shows the reason when its action fails", async ({ page, context }) => {
  await page.getByRole("button", { name: "Set budget" }).click();
  await page.getByLabel("Budget ($)").fill("2400");

  const otherTab = await context.newPage();
  await otherTab.goto(page.url());
  await otherTab.getByRole("button", { name: "Delete trip" }).first().click();
  await otherTab
    .getByRole("button", { name: "Delete trip", exact: true })
    .last()
    .click();
  await expect(otherTab).toHaveURL(/\/$/);
  await otherTab.close();

  await page.getByRole("button", { name: "Save" }).click();

  // the modal stays open and says what happened
  await expect(page.getByRole("heading", { name: "Trip budget" })).toBeVisible();
  await expect(page.locator(".modal .form-error")).toBeVisible();
  await expect(page.locator(".modal .form-error")).toContainText(/not found/i);
});

// P-060. Tab used to walk straight out of a modal and behind the backdrop, so
// a keyboard user lost the dialog while it was still covering the page and
// still the only thing they could act on.
test("focus stays inside a modal and comes back out where it started", async ({ page }) => {
  const insideModal = () =>
    page.evaluate(() => Boolean(document.activeElement?.closest(".modal")));

  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // more presses than there are controls, so it must have wrapped
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await insideModal()).toBe(true);
  }

  // and backwards past the start
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await insideModal()).toBe(true);
  }

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // the keyboard goes back where it was, not to the top of the document
  const returned = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(returned).toBe("Share");
});

test("a modal that opens on top of another traps focus in the top one", async ({ page }) => {
  await page.getByText("Nothing planned yet — click to add something").first().click();
  await page.getByLabel("Title").fill("Something to delete");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await page.getByText("Something to delete").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  // the confirmation is the top layer; Tab must not reach the edit form beneath
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const inTop = await page.evaluate(() =>
      Boolean(document.activeElement?.closest(".modal-backdrop-top"))
    );
    expect(inTop).toBe(true);
  }
});
