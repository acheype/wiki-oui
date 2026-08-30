// Build gate (issues #17, #20 and #21): fails `pnpm build` when an exported
// function of the access layer reads or writes a watched table without
// reaching canRead, canWrite or isAdmin — the ADR 0025 access layer checked
// from the inside, which ESLint alone cannot do (see scan.ts).
import { verifyAccessGuards } from "./scan";

try {
  verifyAccessGuards();
  console.log("Verified every exported access to a watched table decides who is asking.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
