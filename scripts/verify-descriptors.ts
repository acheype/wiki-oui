// Build gate (ADR 0013): fails `pnpm build` when a ComponentBuilder descriptor
// drifts from its component. Runs in prod-like env, so the loader's dev-only
// signature check is off here and we invoke it explicitly.
import { loadComponentBuilders } from "../modules/authoring/descriptors";
import { verifyDescriptorSignatures } from "../modules/authoring/verify";

async function main() {
  const specs = await loadComponentBuilders();
  await verifyDescriptorSignatures(specs);
  console.log(`Verified ${specs.length} ComponentBuilder descriptor(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
