// Build gate (ADR 0013): fails `pnpm build` when a ComponentBuilder descriptor
// drifts from its component. Runs in prod-like env, so the loader's dev-only
// signature check is off here and we invoke it explicitly.
import { loadComponentBuilders } from "../modules/authoring/descriptors";
import {
  listWikiComponentFiles,
  tagCollisionMessage,
} from "../modules/authoring/registry/scan";
import { verifyDescriptorSignatures } from "../modules/authoring/verify";

// A tag name can only ever resolve to one module's component. mdx.tsx's
// buildRegistry raises the very same message at first render in dev, where
// there is no cache to hide behind; this is that check's build-time twin,
// catching a collision before it ever reaches a page.
async function verifyNoTagCollisions(): Promise<void> {
  const collision = tagCollisionMessage(await listWikiComponentFiles(".tsx"));
  if (collision) throw new Error(collision);
}

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
