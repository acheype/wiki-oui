// Build gate (issue #17): fails `pnpm build` when an exported read of
// lib/pages.ts never reaches canRead, canWrite or isAdmin — the ADR 0025 door
// checked from the inside, which ESLint alone cannot do (see lib/verify-access.ts).
import { verifyPageAccessGuards } from "../lib/verify-access";

try {
  verifyPageAccessGuards();
  console.log("Verified every exported read of lib/pages.ts decides who is asking.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
