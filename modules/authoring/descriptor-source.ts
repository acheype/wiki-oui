import { LineCounter, isMap, isScalar, parseDocument } from "yaml";
import type { LineLookup } from "./descriptor";
import { type WikiComponentModule, readWikiComponentFile } from "./registry/scan";

// Reads a co-located descriptor YAML *with source positions* (ADR 0013): the
// raw parsed data for the meta-schema (ADR 0015 — typing happens at
// validateDescriptor, not here), plus a LineLookup that error messages use
// to point at the exact offending line. Shared by the loader (structural
// checks) and the signature verifier (dev + build).

export interface DescriptorSource {
  raw: unknown;
  lineOf: LineLookup;
}

export async function readDescriptorSource(
  module: WikiComponentModule,
  base: string
): Promise<DescriptorSource> {
  const text = await readWikiComponentFile(module, `${base}.yaml`);
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  return {
    raw: doc.toJS(),
    lineOf: (nodePath) => lineOfKey(doc, lineCounter, nodePath),
  };
}

// Line of the *key* at a descriptor path (its key node, so we point at e.g.
// the `type:` line rather than its nested value). Undefined when the path
// leads nowhere — the key is absent, or a parent is not a mapping.
function lineOfKey(
  doc: ReturnType<typeof parseDocument>,
  lineCounter: LineCounter,
  nodePath: (string | number)[]
): number | undefined {
  if (nodePath.length === 0) return undefined;
  const parentPath = nodePath.slice(0, -1);
  const parent = parentPath.length === 0 ? doc.contents : doc.getIn(parentPath, true);
  if (!isMap(parent)) return undefined;
  const lastKey = String(nodePath[nodePath.length - 1]);
  const pair = parent.items.find(
    (item) => isScalar(item.key) && String(item.key.value) === lastKey
  );
  if (!pair || !isScalar(pair.key) || !pair.key.range) return undefined;
  return lineCounter.linePos(pair.key.range[0]).line;
}
