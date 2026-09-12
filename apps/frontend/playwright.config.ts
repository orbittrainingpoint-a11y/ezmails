import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the local "combined router" dev stack (README.md's Local
 * demo section): admin-api :4002, webmail-api :4003, frontend :5173, seeded
 * via `npm run seed:demo -w @ezmails/db`. This repo doesn't yet have a single
 * command that brings up Postgres/Redis + seeds + starts all three apps, so
 * unlike a fully self-contained CI config, these tests assume that stack is
 * already running (see README.md) rather than trying to boot it themselves —
 * a `webServer` block that silently mis-starts is worse than none at all.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "admin",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
      testMatch: /admin\/.*\.spec\.ts/,
    },
    {
      name: "reseller",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/reseller.json" },
      dependencies: ["setup"],
      testMatch: /reseller\/.*\.spec\.ts/,
    },
    {
      name: "webmail",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/webmail.json" },
      dependencies: ["setup"],
      testMatch: /webmail\/.*\.spec\.ts/,
    },
    {
      name: "unauthenticated",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /unauthenticated\/.*\.spec\.ts/,
    },
  ],
});
