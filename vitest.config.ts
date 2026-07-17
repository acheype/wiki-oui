import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the `@/*` path alias from tsconfig so tests can import modules the
// app-side code reaches through it (e.g. an API route pulling in @/lib/icons).
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
  test: {
    // The sandbox suites each pay a cold MDX compile plus the registry's
    // dynamic imports on their first render — seconds, and they run in
    // parallel. The 5s default made whichever got there first flake.
    testTimeout: 30_000,
  },
});
