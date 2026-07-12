import { readFile } from "node:fs/promises";
import path from "node:path";
import { LineCounter, isMap, isScalar, parseDocument } from "yaml";
import type { ComponentDescriptor, LineLookup } from "./component-descriptor";

// Reads a co-located descriptor YAML *with source positions* (ADR 0013): the
// plain descriptor for the engine, plus a LineLookup that error messages use
// to point at the exact offending line. Shared by the loader (structural
// checks) and the signature verifier (dev + build).

const WIKI_COMPONENTS_DIR = path.join(process.cwd(), "components/wiki");

export interface DescriptorSource {
  descriptor: ComponentDescriptor;
  lineOf: LineLookup;
}

export async function readDescriptorSource(base: string): Promise<DescriptorSource> {
  const text = await readFile(
    path.join(WIKI_COMPONENTS_DIR, `${base}.yaml`),
    "utf8"
  );
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  return {
    descriptor: doc.toJS() as ComponentDescriptor,
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
