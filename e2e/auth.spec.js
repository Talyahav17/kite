import { test, expect } from "@playwright/test";
import { freshUser, signUp, createTrip } from "./helpers.js";

test("a new traveller can create an account and lands on their trips", async ({ page }) => {
  const user = freshUser("signup");
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign in to Kite." })).toBeVisible();
  await expect(page.getByText("Your next trip is in the air.")).toBeVisible();

  await signUp(page, user);
  await expect(page.getByRole("heading", { name: `Where to next, E2E?` })).toBeVisible();
  await expect(page.getByText("🪁")).toBeVisible();
});

test("an existing traveller can sign out and back in", async ({ page }) => {
  const user = freshUser("signin");
  await signUp(page, user);

  await page.getByRole("button", { name: /Sign out|Log out/i }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Kite." })).toBeVisible();

  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Where to next/ })).toBeVisible();
});

test("a wrong password is refused and says so", async ({ page }) => {
  const user = freshUser("wrongpw");
  await signUp(page, user);
  await page.getByRole("button", { name: /Sign out|Log out/i }).click();

  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByText("Wrong email or password")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to Kite." })).toBeVisible();
});

// T-010. The trips page had no catch on its load, so a session that lapsed
// while the tab sat open left three skeleton cards spinning for ever and filed
// the rejection as a crash. Ninety-one tests missed it; this is why these exist.
test("a session that lapses mid-visit returns to sign-in, not endless skeletons", async ({
  page,
  context,
}) => {
  const user = freshUser("lapsed");
  await signUp(page, user);
  await createTrip(page, { destination: "Japan", start: "2027-04-10", end: "2027-04-12" });

  // the tab stays open; the cookie goes away underneath it
  await context.clearCookies();

  await page.getByRole("link", { name: /All trips/ }).click();

  await expect(page.getByRole("heading", { name: "Sign in to Kite." })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator(".skeleton")).toHaveCount(0);
});

// P-052. TripDetail caught every load failure as "Trip not found", so a lapsed
// session told the traveller their trip was gone. Navigated in-app rather than
// reloaded: a reload hits the sign-in gate before TripDetail ever loads, so it
// would pass without exercising the catch at all.
test("a lapsed session on a trip page returns to sign-in, not 'Trip not found'", async ({
  page,
  context,
}) => {
  const user = freshUser("lapsed-detail");
  await signUp(page, user);
  await createTrip(page, {
    destination: "Japan",
    start: "2027-04-10",
    end: "2027-04-12",
    title: "Nara day trip",
  });

  await page.getByRole("link", { name: /All trips/ }).click();
  await expect(page.getByText("Nara day trip")).toBeVisible();

  // the tab stays open; the session goes away underneath it
  await context.clearCookies();
  await page.getByText("Nara day trip").click();

  await expect(page.getByRole("heading", { name: "Sign in to Kite." })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Trip not found")).toHaveCount(0);
});
