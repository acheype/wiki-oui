// Build gate (ADR 0013): fails `pnpm build` when a ComponentBuilder descriptor
// drifts from its component, or when two modules claim the same tag (ADR 0002).
// Runs in prod-like env, so the loader's dev-only checks are off here and we
// invoke them explicitly. Both checks live in modules/authoring/verify.ts —
// this file only orders them and reports.
import { loadComponentBuilders } from "../modules/authoring/descriptors";
import {
  verifyDescriptorSignatures,
  verifyNoTagCollisions,
} from "../modules/authoring/verify";

async function main() {
  await verifyNoTagCollisions();
  const specs = await loadComponentBuilders();
  await verifyDescriptorSignatures(specs);
  console.log(`Verified ${specs.length} ComponentBuilder descriptor(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
