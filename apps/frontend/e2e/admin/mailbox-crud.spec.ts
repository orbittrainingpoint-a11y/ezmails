import { test, expect } from "@playwright/test";

test.describe("mailbox CRUD", () => {
  test("create, suspend, and delete a mailbox on the demo domain", async ({ page }) => {
    await page.goto("/mailboxes");
    // Demo seed data creates a domain for john@demo.local — pick the first available domain.
    await page.locator("select").first().selectOption({ index: 1 });

    const localPart = `e2e-${Date.now()}`;
    await page.getByRole("button", { name: "New mailbox" }).click();
    await page.getByLabel("Address (local part)").fill(localPart);
    await page.getByLabel("Password").fill("E2ePassw0rd!23");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Mailbox created.")).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(localPart) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Active")).toBeVisible();

    await row.getByRole("button", { name: "Toggle suspend" }).click();
    await expect(page.getByText("Mailbox suspended.")).toBeVisible();
    await expect(row.getByText("Suspended")).toBeVisible();

    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).last().click();
    await expect(page.getByText("Mailbox deleted.")).toBeVisible();
    await expect(row).not.toBeVisible();
  });
});
