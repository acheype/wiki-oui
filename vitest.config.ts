import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the `@/*` path alias from tsconfig so tests can import modules the
// app-side code reaches through it (e.g. an API route pulling in @/lib/icons).
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
