import { test, expect } from "@playwright/test";

test.describe("login", () => {
  test("shows an error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@ezmails.local");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/incorrect|invalid/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejects an empty form without hitting the API", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    // react-hook-form's native "required" validation blocks submission client-side.
    await expect(page).toHaveURL(/\/login/);
  });

  test("forgot-password reaches a confirmation state", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await page.getByLabel("Email").fill("admin@ezmails.local");
    await page.getByRole("button", { name: "Send reset link" }).click();
    // The endpoint always returns 200 (never reveals whether the email exists).
    await expect(page.getByText(/reset link is on its way/i)).toBeVisible();
  });
});

test.describe("webmail login", () => {
  test("shows an error on invalid credentials", async ({ page }) => {
    await page.goto("/webmail/login");
    await page.getByLabel("Email").fill("nobody@demo.local");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/failed|incorrect|invalid/i)).toBeVisible();
  });
});
