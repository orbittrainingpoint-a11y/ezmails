import { test as setup, expect } from "@playwright/test";

const DEMO = {
  admin: { email: "admin@ezmails.local", password: "Admin@12345" },
  reseller: { email: "reseller@ezmails.local", password: "Reseller@123" },
  webmail: { email: "john@demo.local", password: "Demo@12345" },
} as const;

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.admin.email);
  await page.getByLabel("Password").fill(DEMO.admin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(dashboard)?$/);
  await page.context().storageState({ path: "e2e/.auth/admin.json" });
});

setup("authenticate as reseller", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.reseller.email);
  await page.getByLabel("Password").fill(DEMO.reseller.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(dashboard)?$/);
  await page.context().storageState({ path: "e2e/.auth/reseller.json" });
});

setup("authenticate as webmail user", async ({ page }) => {
  await page.goto("/webmail/login");
  await page.getByLabel("Email").fill(DEMO.webmail.email);
  await page.getByLabel("Password").fill(DEMO.webmail.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/webmail/);
  await page.context().storageState({ path: "e2e/.auth/webmail.json" });
});
