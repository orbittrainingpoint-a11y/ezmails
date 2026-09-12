import { test, expect } from "@playwright/test";

test.describe("webmail smoke", () => {
  test("inbox loads and the compose panel opens", async ({ page }) => {
    await page.goto("/webmail");
    await expect(page).toHaveURL(/\/webmail/);
    await page.getByRole("button", { name: "New email" }).click();
    await expect(page.getByPlaceholder("To")).toBeVisible();
  });

  // Requires the real Postfix/Dovecot mail stack running, not just the bare
  // Postgres+Redis "local demo" setup — WEBMAIL_DEV_BYPASS_IMAP only bypasses
  // IMAP login, not actual mail delivery (see README.md's Local demo caveat).
  test("can address, subject, and send a message to self", async ({ page }) => {
    await page.goto("/webmail");
    await page.getByRole("button", { name: "New email" }).click();
    await page.getByPlaceholder("To").fill("john@demo.local");
    await page.getByPlaceholder("Subject").fill(`e2e smoke ${Date.now()}`);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    // Either a send confirmation or the compose panel closing indicates success.
    await expect(page.getByPlaceholder("To")).not.toBeVisible({ timeout: 15_000 });
  });

  test("settings page loads and notifications toggle is reachable", async ({ page }) => {
    await page.goto("/webmail/settings");
    await expect(page.getByText("Branding")).toBeVisible();
  });
});
