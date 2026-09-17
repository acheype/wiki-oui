import crypto from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Non-secret e2e config (DATABASE_URL), read from the project root where
// Playwright runs. CI overrides DATABASE_URL to its Postgres service; dotenv
// does not overwrite an already-set value, so that override wins.
dotenv.config({ path: ".env.test" });

// The one place the fixed port lives: baseURL and BETTER_AUTH_URL both derive
// from it, so BetterAuth's origin check always matches the real server — no
// dynamic port to chase, and nothing to keep in sync elsewhere.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// BetterAuth refuses to boot without a secret. An e2e run is thrown away with
// its database, so a per-run random one is enough and keeps secrets out of the
// repo. CI injects its own (openssl); this only fills the gap locally.
const authSecret =
  process.env.BETTER_AUTH_SECRET ?? crypto.randomBytes(32).toString("base64");

// CI builds in its own step, so a build failure reads as one there; locally the
// web server builds first, so `pnpm test:e2e` stays a single command.
const start = `pnpm start --port ${PORT}`;
const command = process.env.E2E_SKIP_BUILD ? start : `pnpm build && ${start}`;

export default defineConfig({
  testDir: "./e2e",
  // Keep the throwaway run outputs out of the project root, under one dir.
  outputDir: ".playwright/results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The html reporter gives CI an artifact to upload on failure (with traces).
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never", outputFolder: ".playwright/report" }]]
    : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /install\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: /.*\.spec\.ts/,
    },
  ],
  webServer: {
    command,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: authSecret,
      PORT: String(PORT),
    },
  },
});
