import { test, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { freshUser, signUp, createTrip } from "./helpers.js";

// P-056 (T-008). The risky half of this feature is everything that must NOT
// happen: a wrong password destroying an account, or the confirmation looking
// like it worked when it did not.
test("a wrong password does not delete the account, and says so", async ({ page }) => {
  const user = freshUser("keepme");
  await signUp(page, user);

  await page.getByRole("link", { name: user.name }).click();
  await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
  await expect(page.getByText(user.email).first()).toBeVisible();

  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByLabel("Enter your password to confirm").fill("wrong-password");
  await page.getByRole("button", { name: "Delete for ever" }).click();

  // the modal stays open and explains itself — the account is still here
  await expect(page.locator(".modal .form-error")).toContainText(/password is not right/i);
  await expect(page.locator(".modal").getByRole("heading", { name: /^Delete “/ })).toBeVisible();

  await page.getByRole("button", { name: "Keep my account" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
});

test("deleting an account really removes it and everything in it", async ({ page }) => {
  const user = freshUser("goodbye");
  await signUp(page, user);
  await createTrip(page, {
    destination: "Japan",
    start: "2027-04-10",
    end: "2027-04-12",
    title: "Trip that goes with me",
  });

  await page.getByRole("link", { name: /All trips/ }).click();
  await page.getByRole("link", { name: user.name }).click();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByLabel("Enter your password to confirm").fill(user.password);
  await page.getByRole("button", { name: "Delete for ever" }).click();

  // signed out, back where a stranger starts
  await expect(page.getByRole("heading", { name: "Sign in to Kite." })).toBeVisible({
    timeout: 10_000,
  });

  // and the credentials no longer work
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Wrong email or password")).toBeVisible();
});

test("a deleted account's share link stops working", async ({ page, browser }) => {
  const user = freshUser("sharethengo");
  await signUp(page, user);
  await createTrip(page, {
    destination: "Japan",
    start: "2027-04-10",
    end: "2027-04-12",
    title: "Shared then deleted",
  });

  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  const url = await page.locator("input.share-link").inputValue();

  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(url);
  await expect(strangerPage.getByRole("heading", { name: "Shared then deleted" })).toBeVisible();

  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("link", { name: /All trips/ }).click();
  await page.getByRole("link", { name: user.name }).click();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByLabel("Enter your password to confirm").fill(user.password);
  await page.getByRole("button", { name: "Delete for ever" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Kite." })).toBeVisible({
    timeout: 10_000,
  });

  // the link somebody was holding must die with the trip
  await strangerPage.reload();
  await expect(strangerPage.getByRole("heading", { name: "Shared then deleted" })).toHaveCount(0);
  await stranger.close();
});

// P-059. The point of this feature is that the file is real and readable, so
// the test opens it rather than trusting that a download fired.
test("a traveller can download their trips before deleting anything", async ({ page }) => {
  const user = freshUser("export");
  await signUp(page, user);
  await createTrip(page, {
    destination: "Japan",
    start: "2027-04-10",
    end: "2027-04-12",
    title: "Trip worth keeping",
  });

  await page.getByText("Nothing planned yet — click to add something").first().click();
  await page.getByLabel("Title").fill("Golden Pavilion");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Golden Pavilion")).toBeVisible();

  await page.getByRole("link", { name: /All trips/ }).click();
  await page.getByRole("link", { name: user.name }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download my trips" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^kite-export-\d{4}-\d{2}-\d{2}\.json$/);

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));

  assert(data);
  expect(data.format).toBe("kite-export-v1");
  expect(data.account.email).toBe(user.email);
  expect(data.trips).toHaveLength(1);
  expect(data.trips[0].title).toBe("Trip worth keeping");
  expect(data.trips[0].items.map((i) => i.title)).toEqual(["Golden Pavilion"]);
  expect(JSON.stringify(data)).not.toContain("password");
});
