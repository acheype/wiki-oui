import path from "node:path";
import {
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
  type Identifier,
  Node,
  Project,
  type SourceFile,
} from "ts-morph";

// One door to Page (ADR 0025): an ESLint rule keeps `prisma.page` out of
// every file but the five modules/pages/ split into (and modules/forms/forms.ts
// plus modules/forms/queries/queries.ts for Form). That rule is silent about what happens *inside* the door — a read
// that forgets to check who is asking compiles, passes lint, and leaks in
// silence. This module closes that gap, in the culture of ADR 0013 (parse the
// source with ts-morph, never import or run it).
//
// The three primitives every access decision in this codebase bottoms out on
// are canRead, canWrite and isAdmin (modules/permissions/decide/rules.ts) —
// every relay this file has today (ifReadable, assertCanWrite,
// assertStructuring, assertAdmin, assertAddress, currentWritableWhere,
// currentReadableWhere…) is, transitively, a call to one of the three. So rather than naming the relays — a list a
// future one would silently fall outside of — the check follows the call
// graph from each exported function until it finds one of the three, however
// many hops and files that takes.

type FunctionLike = FunctionDeclaration | FunctionExpression | ArrowFunction;

/** decide/rules.ts's own name — the primitives count only from there. */
const PRIMITIVES_FILE = "modules/permissions/decide/rules.ts";
const PRIMITIVES = new Set(["canRead", "canWrite", "isAdmin"]);

// Prisma methods that return rows rather than writing them (mirrors
// PRISMA_MODEL_METHODS in eslint.config.mjs, minus the write half).
const READ_METHODS = new Set([
  "aggregate",
  "count",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "groupBy",
]);

export interface AccessFinding {
  name: string;
  /** 1-based line of the exported declaration, for the thrown message. */
  line: number;
}

/** True import bindings resolve through this; local declarations pass through unchanged. */
function declarationOf(identifier: Identifier): Node | undefined {
  const symbol = identifier.getSymbol();
  if (!symbol) return undefined;
  const target = symbol.getAliasedSymbol() ?? symbol;
  return target.getDeclarations()[0];
}

/** Unwraps `cache(async () => …)`-style wrappers to the function actually called. */
function asFunctionLike(node: Node | undefined): FunctionLike | undefined {
  if (!node) return undefined;
  if (Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node) || Node.isArrowFunction(node)) {
    return node;
  }
  if (Node.isVariableDeclaration(node)) {
    return asFunctionLike(node.getInitializer());
  }
  if (Node.isCallExpression(node)) {
    for (const arg of node.getArguments()) {
      const found = asFunctionLike(arg);
      if (found) return found;
    }
  }
  return undefined;
}

/** `X.page.<read>()`, or `X.revision.<read>()` when the call also reaches for `page`. */
function isPageReadCall(call: Node): boolean {
  if (!Node.isCallExpression(call)) return false;
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return false;
  const method = callee.getName();
  if (!READ_METHODS.has(method)) return false;
  const object = callee.getExpression();
  if (!Node.isPropertyAccessExpression(object)) return false;
  const model = object.getName();
  if (model === "page") return true;
  if (model !== "revision") return false;
  // The relation escape ADR 0025's syntax rule cannot see (eslint.config.mjs):
  // `prisma.revision.findUnique({ include: { page: … } })` never spells
  // `.page.`, yet it hands the page back. Caught here by looking for a
  // `page` key among the call's own arguments.
  return call
    .getArguments()
    .some((arg) =>
      arg
        .getDescendants()
        .some(
          (node) =>
            (Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)) &&
            node.getName() === "page"
        )
    );
}

function isPrimitiveCall(call: Node): string | undefined {
  if (!Node.isCallExpression(call)) return undefined;
  const callee = call.getExpression();
  if (!Node.isIdentifier(callee)) return undefined;
  if (!PRIMITIVES.has(callee.getText())) return undefined;
  const declaration = declarationOf(callee);
  const file = declaration?.getSourceFile().getFilePath() ?? "";
  return file.endsWith(PRIMITIVES_FILE) ? callee.getText() : undefined;
}

/**
 * Walks the call graph reachable from one exported function: does it read
 * Page, and does that same reachable graph decide on the read anywhere? A
 * visited set (keyed by declaration position) makes the walk safe against the
 * mutual-recursion a relay could in principle form.
 */
function scanReachable(start: FunctionLike): { reads: boolean; guarded: boolean } {
  const visited = new Set<string>();
  const queue: Node[] = [start];
  let reads = false;
  let guarded = false;

  while (queue.length > 0 && !(reads && guarded)) {
    const node = queue.shift()!;
    for (const call of node.getDescendants().filter(Node.isCallExpression)) {
      if (isPageReadCall(call)) reads = true;
      if (isPrimitiveCall(call)) {
        guarded = true;
        continue;
      }
      const callee = call.getExpression();
      if (!Node.isIdentifier(callee)) continue;
      const declaration = declarationOf(callee);
      const fn = asFunctionLike(declaration);
      if (!fn) continue;
      const key = `${fn.getSourceFile().getFilePath()}:${fn.getPos()}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push(fn);
    }
  }
  return { reads, guarded };
}

/**
 * Every exported function of `sourceFile` that reads Page without its
 * reachable call graph ever deciding who is asking (see module doc). Pure —
 * takes a ts-morph SourceFile, never touches Prisma or a database.
 */
export function scanAccessGuards(sourceFile: SourceFile): AccessFinding[] {
  const findings: AccessFinding[] = [];
  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    for (const declaration of declarations) {
      const fn = asFunctionLike(declaration);
      if (!fn) continue;
      const { reads, guarded } = scanReachable(fn);
      if (reads && !guarded) {
        findings.push({ name, line: declaration.getStartLineNumber() });
      }
    }
  }
  return findings;
}

// --- the allowlist, run at prebuild ------------------------------------------

/**
 * Every exported read the scan above finds and does not itself decide on —
 * verified by hand, once, the day this check was added (issue #17). Kept
 * deliberately small: a new entry is a new read of everyone's Page, and this
 * is where a reviewer looks for it.
 */
const UNGUARDED_READS: Record<string, string> = {
  // Existence probe / write precursor (see the function's own docstring): the
  // content never reaches a caller that has not first asked assertCanWrite or
  // currentPermissions.
  getPage:
    "existence probe for a slug clash and the write paths' own read — callers assertCanWrite or currentPermissions before using the content",
  // Slugs only, readable or not (see the function's own docstring): what
  // modules/pages/lint.ts decides « cette page n'existe pas » against, never
  // content.
  listAllPageSlugs: "every slug, readable or not — the broken-link lint's own denominator, not content",
  // The site's chrome, not its content (see the function's own docstring):
  // submitting it to the rights would make the menu vanish for some readers.
  getLayoutContents: "the site's chrome (menu, footer…), not its content — deliberately shown to everyone",
  // A number, never the pages themselves — and both callers already decide
  // before asking: accountDeletionImpact behind assertAdmin, ownDeletionImpact
  // for the signed-in person's own account only (modules/accounts/queries/queries.ts).
  countOwnedByAccount: "a count, not the pages — both callers already gate on admin or on the person's own account",
  // A number, never the pages — and its one caller, getGroup, runs behind
  // getGroupDetail's own admin check first (modules/permissions/group-actions.ts).
  countPagesGrantingGroup: "a count, not the pages — its one caller already runs behind an admin check",
};

/**
 * The five files ADR 0029 split lib/pages.ts into: the door itself
 * (queries.ts, private to modules/pages/) plus the four root files that each
 * read or write Page (content.ts, revisions.ts, rights.ts, entries.ts). A
 * function moved from one to another keeps the same name, so UNGUARDED_READS
 * below did not need to change with the split — only this list of files did.
 */
const PAGE_ACCESS_FILES = [
  "modules/pages/queries/queries.ts",
  "modules/pages/content.ts",
  "modules/pages/revisions.ts",
  "modules/pages/rights.ts",
  "modules/pages/entries.ts",
];

/**
 * The prebuild gate itself (ADR 0013's culture, applied to ADR 0025's door):
 * throws with every exported read of modules/pages/ that does not decide who
 * is asking, and that this session has not already looked at and
 * allowlisted.
 */
export function verifyPageAccessGuards(): void {
  const project = new Project({
    tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });
  const findings = PAGE_ACCESS_FILES.flatMap((relativePath) => {
    const file = project.addSourceFileAtPath(path.join(process.cwd(), relativePath));
    return scanAccessGuards(file)
      .filter((finding) => !(finding.name in UNGUARDED_READS))
      .map((finding) => ({ ...finding, file: relativePath }));
  });
  if (findings.length > 0) {
    throw new Error(
      "modules/pages/ reads Page without deciding who is asking (ADR 0025's door has no filter on this):\n" +
        findings
          .map(
            (finding) =>
              `  - ${finding.name} (${finding.file}:${finding.line}) never reaches canRead, canWrite or isAdmin`
          )
          .join("\n") +
        "\nGuard the read, or — if it is deliberate — add it to UNGUARDED_READS in scripts/verify-access/scan.ts with why."
    );
  }
}
