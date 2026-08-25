// Build gate (issues #17 and #20): fails `pnpm build` when an exported read of
// Page or Form never reaches canRead, canWrite or isAdmin — the ADR 0025 door
// checked from the inside, which ESLint alone cannot do (see scan.ts).
import { verifyPageAccessGuards } from "./scan";

try {
  verifyPageAccessGuards();
  console.log("Verified every exported read of Page and Form decides who is asking.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
