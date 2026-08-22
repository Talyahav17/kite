import { expect } from "@playwright/test";

// Every run makes its own accounts on a throwaway database. Nothing here goes
// near test@example.com or the "Summer in Italy" trip — those are the CEO's
// demo data and are off limits to anything automated.
export function freshUser(tag) {
  const id = `${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    name: `E2E ${tag}`,
    email: `${id}@example.test`,
    password: "not-a-real-password-1",
  };
}

/** Create an account through the real form and wait until the trips page is up. */
export async function signUp(page, user) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Name", { exact: true }).fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: /Where to next/ })).toBeVisible();
}

/**
 * Fill in the new-trip form and open the trip it creates.
 * The destination is picked from the autocomplete rather than typed blind, so
 * this exercises the same path a person takes.
 */
export async function createTrip(page, { destination, start, end, title }) {
  await page.getByRole("button", { name: "+ New trip" }).click();
  await page.getByLabel("Start date").fill(start);
  await page.getByLabel("End date").fill(end);

  const field = page.getByRole("combobox");
  await field.fill(destination.slice(0, 3));
  await page.getByRole("option", { name: destination, exact: true }).click();

  if (title) await page.getByLabel("Trip name").fill(title);

  await page.getByRole("button", { name: "Create trip" }).click();
  await expect(page).toHaveURL(/\/trips\/\d+$/);
}
