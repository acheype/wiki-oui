import path from "node:path";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

// Mirrors the `@/*` path alias from tsconfig so tests can import modules the
// app-side code reaches through it (e.g. an API route pulling in @/lib/icons).
const alias = { "@": path.resolve(import.meta.dirname, ".") };

// The sandbox suites each pay a cold MDX compile plus the registry's dynamic
// imports on their first render — seconds, and they run in parallel. The 5s
// default made whichever got there first flake.
const testTimeout = 30_000;

// Vitest doesn't load `.env`, so importing the BetterAuth instance
// (modules/accounts/auth.ts) warns about a missing base URL. No test dials
// this URL — it only feeds BetterAuth's baseURL at import so the warning
// doesn't drown the real ones, hence any well-formed value works. Defer to an
// env value when one exists. (The e2e chantier will drive a real Next server
// and must supply its actual, possibly dynamic, port — ADR 0032.)
const env = {
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
};

// Two engines by cost (ADR 0032). `unit` is Node by default, with jsdom opted
// into per file via the `// @vitest-environment jsdom` pragma. `browser` runs
// the fidelity tests (`*.browser.test.tsx`) in a real Chromium — the browser
// mode can't be a pragma, which is why it needs its own project. `pnpm test`
// runs `unit` alone to keep the daily loop fast; the browser binary is only
// paid by `pnpm test:browser` / `pnpm test:all`.
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          testTimeout,
          env,
          include: ["**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, "**/*.browser.test.tsx"],
        },
      },
      {
        // @vitejs/plugin-react + dedupe keep a single React copy in the
        // browser bundle; without it Base UI's hooks throw "Invalid hook
        // call" from a duplicated react-dom.
        plugins: [react()],
        resolve: { alias, dedupe: ["react", "react-dom"] },
        test: {
          name: "browser",
          testTimeout,
          env,
          include: ["**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
