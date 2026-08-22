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

// P-051. Priya pressed "Stop sharing" on a session that had quietly lapsed and
// got nothing back — no message, no sign-in prompt, the modal just sitting
// there. The link had not been revoked, but she could only establish that from
// the error log. An async click handler with no catch rejects into silence.
test("revoking on a lapsed session says so instead of failing silently", async ({
  page,
  context,
}) => {
  await signUp(page, freshUser("revoke-lapsed"));
  await createTrip(page, {
    destination: "Japan",
    start: "2027-04-10",
    end: "2027-04-12",
    title: "Osaka detour",
  });

  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.locator("input.share-link")).toBeVisible();

  // the tab stays open; the session goes away underneath it
  await context.clearCookies();

  await page.getByRole("button", { name: "Stop sharing this trip" }).click();
  await page.getByRole("button", { name: "Stop sharing", exact: true }).click();

  // a lapsed session belongs back at sign-in, as everywhere else in the app —
  // what it must never do is leave the modal open saying nothing at all.
  await expect(page.getByRole("heading", { name: "Sign in to Kite." })).toBeVisible({
    timeout: 10_000,
  });
});

// T-011 (P-055). Priya planned two days of a five-day trip, sent the link, and
// her friends could not tell whether the rest was unplanned, the trip ended
// early, or the page had failed to load — the days simply were not there,
// while the header still counted them.
test("a shared trip shows its unplanned days instead of hiding them", async ({
  page,
  browser,
}) => {
  await signUp(page, freshUser("empty-days"));
  await createTrip(page, {
    destination: "Japan",
    start: "2027-04-10",
    end: "2027-04-12",
    title: "Three days, one planned",
  });

  // plan the first day only
  await page.getByText("Nothing planned yet — click to add something").first().click();
  await page.getByLabel("Title").fill("Fushimi Inari");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Fushimi Inari")).toBeVisible();

  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  const url = await page.locator("input.share-link").inputValue();

  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(url);

  // the header promises three days, so all three must be accounted for
  await expect(strangerPage.getByText("3 days · 1 items")).toBeVisible();
  await expect(strangerPage.locator(".day")).toHaveCount(3);
  await expect(strangerPage.getByText("Fushimi Inari")).toBeVisible();
  await expect(strangerPage.getByText("Nothing planned for this day.")).toHaveCount(2);

  await stranger.close();
});
