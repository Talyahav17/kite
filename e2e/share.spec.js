import { test, expect } from "@playwright/test";
import { freshUser, signUp, createTrip } from "./helpers.js";

// The share link has only ever been checked by hand, because it is the one
// flow that has to work for somebody who is not signed in.
test("a shared trip is readable by a stranger, and stops being readable when revoked", async ({
  page,
  browser,
}) => {
  await signUp(page, freshUser("share"));
  await createTrip(page, {
    destination: "Japan",
    start: "2027-04-10",
    end: "2027-04-12",
    title: "Kyoto in the rain",
  });

  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("button", { name: "Create link" }).click();

  const link = page.locator("input.share-link");
  await expect(link).toBeVisible();
  const url = await link.inputValue();
  expect(url).toMatch(/\/s\/[A-Za-z0-9_-]{16,}$/);

  // a genuinely separate browser: no cookie, no session, nothing carried over
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(url);

  await expect(strangerPage.getByRole("heading", { name: "Kyoto in the rain" })).toBeVisible();
  await expect(strangerPage.getByText("view only")).toBeVisible();
  await expect(strangerPage.getByRole("button", { name: "Plan my days" })).toHaveCount(0);

  // T-005: revoking is deliberately behind a confirmation
  await page.getByRole("button", { name: "Stop sharing this trip" }).click();
  await expect(page.getByRole("heading", { name: /Stop sharing/ })).toBeVisible();
  await page.getByRole("button", { name: "Stop sharing", exact: true }).click();

  await strangerPage.reload();
  await expect(strangerPage.getByRole("heading", { name: "Kyoto in the rain" })).toHaveCount(0);

  await stranger.close();
});
