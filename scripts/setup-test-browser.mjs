// postinstall: install the Chromium the `browser` Vitest project needs (ADR
// 0032), so `pnpm test` works everywhere without a manual step.
//
// Guarded so it never runs where it shouldn't:
//   - PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set — the Docker build sets it, so
//     the production image never pulls ~180 MB of browser it never runs.
//   - playwright isn't installed — a --prod install has no devDependencies,
//     so there's nothing to drive; skip quietly.
// CI sets neither, so it installs there and can run the browser suite.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) process.exit(0);

const playwrightInstalled = existsSync(
  new URL("../node_modules/playwright/package.json", import.meta.url)
);
if (!playwrightInstalled) process.exit(0);

try {
  execSync("playwright install chromium", { stdio: "inherit" });
} catch {
  // A download failure shouldn't break `pnpm install`; the browser suite will
  // fail with its own clear message, and `pnpm test:setup` retries.
  console.warn(
    "\n[setup-test-browser] Could not install Chromium. Run `pnpm test:setup` before the browser tests.\n"
  );
}
