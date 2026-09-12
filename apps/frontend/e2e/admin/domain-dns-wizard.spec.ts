import { test, expect } from "@playwright/test";

function uniqueDomain(prefix: string): string {
  return `${prefix}-${Date.now()}.test`;
}

test.describe("domain creation + DNS wizard", () => {
  test("a vps_hosted domain requires an MX record", async ({ page }) => {
    const domainName = uniqueDomain("e2e-vps");
    await page.goto("/domains");
    await page.getByRole("button", { name: "Add domain" }).click();
    await page.getByLabel("Domain name").fill(domainName);
    await page.getByLabel("Source").selectOption("vps_hosted");
    await page.getByRole("button", { name: "Add domain" }).click();
    await expect(page.getByText("Domain added. Configure its DNS records next.")).toBeVisible();

    await page.getByRole("row", { name: new RegExp(domainName) }).click();
    await expect(page.getByRole("heading", { name: domainName })).toBeVisible();

    // DNS setup tab is the default.
    await expect(page.getByText("MX", { exact: true })).toBeVisible();
    await expect(page.getByText("SPF", { exact: true })).toBeVisible();
    await expect(page.getByText("DKIM", { exact: true })).toBeVisible();
    await expect(page.getByText("DMARC", { exact: true })).toBeVisible();
    // A freshly created domain has a mailbox-less delivery test disabled until one exists.
    await expect(page.getByRole("button", { name: "Send test email" })).toBeDisabled();
  });

  test("an external domain does not require an MX record", async ({ page }) => {
    const domainName = uniqueDomain("e2e-external");
    await page.goto("/domains");
    await page.getByRole("button", { name: "Add domain" }).click();
    await page.getByLabel("Domain name").fill(domainName);
    await page.getByLabel("Source").selectOption("external");
    await page.getByRole("button", { name: "Add domain" }).click();
    await expect(page.getByText("Domain added. Configure its DNS records next.")).toBeVisible();

    await page.getByRole("row", { name: new RegExp(domainName) }).click();
    await expect(page.getByRole("heading", { name: domainName })).toBeVisible();

    await expect(page.getByText(/no MX record is needed here/i)).toBeVisible();
    await expect(page.getByText("MX", { exact: true })).not.toBeVisible();
    await expect(page.getByText("SPF", { exact: true })).toBeVisible();
    // Outbound-only domains don't offer the inbound delivery test at all.
    await expect(page.getByText("Send a live test email")).not.toBeVisible();
  });

  test("rejects an invalid domain name client-side", async ({ page }) => {
    await page.goto("/domains");
    await page.getByRole("button", { name: "Add domain" }).click();
    await page.getByLabel("Domain name").fill("not a domain");
    await page.getByRole("button", { name: "Add domain" }).click();
    await expect(page.getByText(/enter a valid domain name/i)).toBeVisible();
  });
});

test.describe("DomainsPage DNS health", () => {
  test("the needs-attention filter narrows the list", async ({ page }) => {
    await page.goto("/domains");
    await page.getByRole("button", { name: "Needs attention only" }).click();
    await expect(page).toHaveURL(/health=attention/);
  });
});
