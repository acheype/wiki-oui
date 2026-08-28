import path from "node:path";
import {
  type ArrowFunction,
  type CallExpression,
  type FunctionDeclaration,
  type FunctionExpression,
  type Identifier,
  Node,
  Project,
  type SourceFile,
} from "ts-morph";
import accessLayerFiles from "../../lib/access-layer-files.json";

// One access layer for Page, Form, Revision and the account tables (ADR 0025,
// issues #20, #21, #23): an ESLint rule keeps each model's Prisma calls inside
// a short list of files. That rule is silent about what happens *inside* them —
// a read that forgets to check who is asking compiles, passes lint, and leaks
// in silence; a write that forgets to check who is acting does the same. This
// module closes that gap, in the culture of ADR 0013 (parse the source with
// ts-morph, never import or run it).
//
// The list of files comes from lib/access-layer-files.json, shared with ESLint.
// Six files are excluded from the scan (sweeps, seed and auth.ts) — each one
// named in EXEMPTIONS with its reason. The remaining 13 files are scanned for
// every watched table.
//
// The three primitives every access decision in this codebase bottoms out on
// are canRead, canWrite and isAdmin (modules/permissions/decide/rules.ts) —
// every relay (ifReadable, assertCanWrite, assertAdmin, …) is, transitively,
// a call to one of the three. So rather than naming the relays — a list a
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

// Prisma methods that change rows (the other half of PRISMA_MODEL_METHODS).
const WRITE_METHODS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "delete",
  "deleteMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
]);

export type AccessMethod = "read" | "write";

export interface AccessFinding {
  name: string;
  /** 1-based line of the exported declaration, for the thrown message. */
  line: number;
}

/**
 * A neighbouring model whose read or write can carry a watched table's rows
 * along through a relation. Step 1 matches the model being queried; step 2
 * looks for one of the relation names in the call's arguments.
 *
 * Example: `prisma.page.findUnique({ include: { current: true } })` is a
 * Revision access because "page" matches `model` and "current" is in `as`.
 */
export interface ViaRelation {
  model: string;
  as: readonly string[];
}

/**
 * One table this check watches: what its rows are called in Prisma, the
 * neighbouring models whose reads hand its rows back through a relation,
 * and which kind of access to check (reads, writes, or both).
 */
export interface WatchedTable {
  /** As the domain names it, for the thrown message. */
  name: string;
  /** As Prisma names it: `prisma.<model>.findMany`. */
  model: string;
  /** Models whose own query can carry this one along, by relation. */
  via: readonly ViaRelation[];
  methods: ReadonlySet<AccessMethod>;
}

/**
 * A deliberate pass on a file or function the scan would otherwise flag.
 * Without `function`, the whole file is excluded from scanning. With it,
 * only that function in that file is passed over — tying the exemption to
 * its location so a duplicate name in another file never escapes.
 */
export interface Exemption {
  file: string;
  function?: string;
  reason: string;
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

/** Does the call name `key` anywhere in its arguments — `include: { page: … }`? */
function reachesFor(call: CallExpression, key: string): boolean {
  return call
    .getArguments()
    .some((arg) =>
      arg
        .getDescendants()
        .some(
          (node) =>
            (Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)) &&
            node.getName() === key
        )
    );
}

/** `X.<model>.<read>()`, or a neighbour's read that reaches for a relation. */
function isTableReadCall(call: Node, table: WatchedTable): boolean {
  if (!Node.isCallExpression(call)) return false;
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return false;
  const method = callee.getName();
  if (!READ_METHODS.has(method)) return false;
  const object = callee.getExpression();
  if (!Node.isPropertyAccessExpression(object)) return false;
  const model = object.getName();
  if (model === table.model) return true;
  const viaEntry = table.via.find((v) => v.model === model);
  if (!viaEntry) return false;
  // The relation escape ADR 0025's syntax rule cannot see (eslint.config.mjs):
  // `prisma.page.findUnique({ include: { current: true } })` never spells
  // `.revision.`, yet it hands the revision back — and the same holds of
  // `prisma.revision.findMany({ include: { page: true } })` for a page.
  return viaEntry.as.some((name) => reachesFor(call as CallExpression, name));
}

/** `X.<model>.<write>()` — no `via` for writes: nested Prisma writes are not the pattern here. */
function isTableWriteCall(call: Node, table: WatchedTable): boolean {
  if (!Node.isCallExpression(call)) return false;
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return false;
  const method = callee.getName();
  if (!WRITE_METHODS.has(method)) return false;
  const object = callee.getExpression();
  if (!Node.isPropertyAccessExpression(object)) return false;
  return object.getName() === table.model;
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
 * Walks the call graph reachable from one exported function: does it access
 * the table (read or write, depending on the detector), and does that same
 * reachable graph decide on the access anywhere? A visited set (keyed by
 * declaration position) makes the walk safe against the mutual-recursion a
 * relay could in principle form.
 *
 * Only calls count, never a function merely named: `rows.map(ifReadable)`
 * reads as unguarded where `rows.map((row) => ifReadable(row))` does not.
 * The check errs that way on purpose — following a reference that may never
 * be called is how a real leak would come to look guarded.
 */
function scanReachable(
  start: FunctionLike,
  table: WatchedTable,
  isTableAccess: (call: Node, table: WatchedTable) => boolean
): { accesses: boolean; guarded: boolean } {
  const visited = new Set<string>();
  const queue: Node[] = [start];
  let accesses = false;
  let guarded = false;

  while (queue.length > 0 && !(accesses && guarded)) {
    const node = queue.shift()!;
    for (const call of node.getDescendants().filter(Node.isCallExpression)) {
      if (isTableAccess(call, table)) accesses = true;
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
  return { accesses, guarded };
}

/**
 * Every exported function of `sourceFile` that accesses the table (reads it
 * or writes it, depending on `method`) without its reachable call graph ever
 * deciding who is asking (see module doc). Pure — takes a ts-morph
 * SourceFile, never touches Prisma or a database.
 */
export function scanAccessGuards(
  sourceFile: SourceFile,
  table: WatchedTable,
  method: AccessMethod = "read"
): AccessFinding[] {
  const isTableAccess = method === "read" ? isTableReadCall : isTableWriteCall;
  const findings: AccessFinding[] = [];
  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    for (const declaration of declarations) {
      const fn = asFunctionLike(declaration);
      if (!fn) continue;
      const { accesses, guarded } = scanReachable(fn, table, isTableAccess);
      if (accesses && !guarded) {
        findings.push({ name, line: declaration.getStartLineNumber() });
      }
    }
  }
  return findings;
}

// --- the tables, exemptions and prebuild gate (ADR 0025, issue #23) ----------

export const PAGE: WatchedTable = {
  name: "Page",
  model: "page",
  via: [{ model: "revision", as: ["page"] }],
  methods: new Set(["read", "write"]),
};

export const FORM: WatchedTable = {
  name: "Form",
  model: "form",
  via: [{ model: "page", as: ["form"] }],
  methods: new Set(["read", "write"]),
};

export const REVISION: WatchedTable = {
  name: "Revision",
  model: "revision",
  via: [{ model: "page", as: ["current", "revisions"] }],
  methods: new Set(["read", "write"]),
};

export const USER: WatchedTable = {
  name: "User",
  model: "user",
  via: [],
  methods: new Set(["read", "write"]),
};

export const ACCOUNT_LINK: WatchedTable = {
  name: "AccountLink",
  model: "accountLink",
  via: [],
  methods: new Set(["write"]),
};

export const SESSION: WatchedTable = {
  name: "Session",
  model: "session",
  via: [],
  methods: new Set(["write"]),
};

export const GROUP: WatchedTable = {
  name: "Group",
  model: "group",
  via: [],
  methods: new Set(["write"]),
};

export const GROUP_MEMBER: WatchedTable = {
  name: "GroupMember",
  model: "groupMember",
  via: [],
  methods: new Set(["write"]),
};

export const PAGE_ACL: WatchedTable = {
  name: "PageAcl",
  model: "pageAcl",
  via: [],
  methods: new Set(["write"]),
};

export const SETTINGS: WatchedTable = {
  name: "Settings",
  model: "settings",
  via: [],
  methods: new Set(["write"]),
};

const WATCHED: readonly WatchedTable[] = [
  PAGE,
  FORM,
  REVISION,
  USER,
  ACCOUNT_LINK,
  SESSION,
  GROUP,
  GROUP_MEMBER,
  PAGE_ACL,
  SETTINGS,
];

/**
 * Every deliberate pass on a file or function the scan would otherwise flag,
 * verified by hand the day each table was added (issues #17, #20, #21, #23).
 *
 * File-level exemptions remove an entire file from scanning — the file is
 * in the ESLint ignores (it touches Prisma) but has no person to check
 * against: sweeps retcon a namespace, the seed writes before anyone exists,
 * and BetterAuth manages its own tables.
 *
 * Function-level exemptions are scanned but passed over. Two questions
 * hold over the whole list: for reads, **does this function return
 * content?** For writes, **does this function act on behalf of another
 * person?** If the answer is yes, the function needs a guard, not an
 * exemption here.
 */
export const EXEMPTIONS: readonly Exemption[] = [
  // --- file-level: sweeps, seed, auth ----------------------------------------

  { file: "prisma/seed.ts", reason: "writes before any person exists (ADR 0027)" },
  { file: "modules/accounts/auth.ts", reason: "BetterAuth manages its own tables" },
  { file: "lib/slug-rename-db.ts", reason: "referential integrity — rewrites slug references, no person acts" },
  { file: "modules/forms/entry-title/sweep.ts", reason: "referential integrity — recomputes stored titles, no person acts" },
  { file: "modules/forms/field-rename/sweep.ts", reason: "referential integrity — renames field keys in carriers, no person acts" },
  { file: "modules/permissions/acl-rename-sweep.ts", reason: "referential integrity — rewrites principal names in ACLs, no person acts" },

  // --- Page reads ------------------------------------------------------------

  { file: "modules/pages/content.ts", function: "slugExists", reason: "a boolean saying an address is taken — never the page behind it" },
  { file: "modules/pages/content.ts", function: "listAllPageSlugs", reason: "every slug, readable or not — the broken-link lint's own denominator, not content" },
  { file: "modules/pages/rights.ts", function: "countOwnedByAccount", reason: "a count, not the pages — both callers already gate on admin or on the person's own account" },
  { file: "modules/pages/rights.ts", function: "countPagesGrantingGroup", reason: "a count, not the pages — its one caller already runs behind an admin check" },

  // --- Form reads ------------------------------------------------------------

  { file: "modules/forms/access/guards.ts", function: "formSlugExists", reason: "a boolean saying an identifier is taken — never the form behind it" },
  { file: "modules/forms/access/guards.ts", function: "listFormNames", reason: "slug and name only — what a picker needs to name a form, never its fields" },
  { file: "modules/forms/forms.ts", function: "countFormsOwnedByAccount", reason: "a count, not the forms — its caller runs behind an admin check" },
  { file: "modules/forms/forms.ts", function: "countFormSlugReferences", reason: "a headcount of references, not the rows that carry them" },

  // --- User reads (issue #23) ------------------------------------------------

  { file: "modules/permissions/groups-directory.ts", function: "grantTarget", reason: "a label for a permission picker — username and name, never content" },
  { file: "modules/permissions/groups-directory.ts", function: "listDirectory", reason: "the directory for granting permissions — the caller has verified the person can grant" },
  { file: "modules/permissions/groups-directory.ts", function: "existingPrincipals", reason: "Set<string> — do these names still exist? Never content" },
  { file: "modules/pages/access/guards.ts", function: "keepKnownPrincipals", reason: "filters ACL entries to principals that still exist — a pure filter, never content" },
  { file: "modules/pages/access/guards.ts", function: "bornWith", reason: "creates the rights a page is born with — the User read is keepKnownPrincipals, not content" },
  { file: "modules/pages/access/guards.ts", function: "bornWithDefaultRights", reason: "wrapper around bornWith for the wiki's defaults" },
  { file: "modules/accounts/access/guards.ts", function: "readAccountLink", reason: "the token is the whole credential — the User read checks if the email already has an account" },
  { file: "modules/accounts/access/guards.ts", function: "ownDeletionImpact", reason: "the person's own account — currentUsername() is the credential, not isAdmin" },

  // --- account table writes (issue #21) --------------------------------------

  { file: "modules/accounts/access/guards.ts", function: "deleteOwnAccount", reason: "the person's own account — currentUsername() is the credential, not isAdmin" },
  { file: "modules/accounts/access/guards.ts", function: "requestPasswordReset", reason: "no person — anyone can ask, the link goes by mail or nowhere, nothing is revealed" },
  { file: "modules/accounts/access/guards.ts", function: "clearAccountLink", reason: "no person — runs during free sign-up, spending the invitation the address carried" },
  { file: "modules/accounts/access/guards.ts", function: "acceptInvitation", reason: "no person — the single-use token is the credential, the account does not exist yet" },
  { file: "modules/accounts/access/guards.ts", function: "resetPasswordWithLink", reason: "no person — the single-use token is the credential" },
  { file: "modules/permissions/groups-onboarding.ts", function: "joinGroupOnInvitation", reason: "no person — the invitation named the group, the token authorized the join" },
  { file: "modules/permissions/groups-onboarding.ts", function: "createAdminsGroupWith", reason: "no person — runs at installation, before any administrator exists (ADR 0027)" },

  // --- Page writes (issue #23) ------------------------------------------------

  { file: "modules/pages/access/guards.ts", function: "mintRevision", reason: "the mechanical act of creating a revision and moving the pointer — every caller has already decided (assertCanWrite)" },
  { file: "modules/pages/rights.ts", function: "assignPagesOwner", reason: "no person — runs at installation to put special pages under the first administrator (ADR 0027)" },
  { file: "modules/pages/rights.ts", function: "reassignOwnedPages", reason: "reassignment during account deletion — its caller (deleteAccount) already gates on isAdmin" },

  // --- Form reads and writes (issue #23) -------------------------------------

  { file: "modules/pages/content.ts", function: "countPageSlugReferences", reason: "a headcount of references for the rename dialog, not the rows that carry them" },
  { file: "modules/forms/forms.ts", function: "countEntryTitleRecompute", reason: "a count of entries a title recompute would touch — the caller already gates on form structuring" },
  { file: "modules/forms/forms.ts", function: "reassignOwnedForms", reason: "reassignment during account deletion — its caller (deleteAccount) already gates on isAdmin" },

  // --- Settings writes (issue #23) -------------------------------------------

  { file: "modules/settings/settings.ts", function: "markInstalled", reason: "the one-way door — runs at installation, before any administrator exists (ADR 0027)" },
];

/**
 * The prebuild gate itself (ADR 0013's culture, applied to ADR 0025's access
 * layer): throws with every exported function of the access layer that
 * accesses rows without deciding who is asking, and that this session has
 * not already looked at and allowlisted.
 */
export function verifyAccessGuards(): void {
  const fileExemptions = new Set(
    EXEMPTIONS.filter((e) => !e.function).map((e) => e.file)
  );
  const functionExemptions = new Set(
    EXEMPTIONS.filter((e) => e.function).map((e) => `${e.file}:${e.function}`)
  );

  const scannedFiles = (accessLayerFiles as string[]).filter(
    (f) => !fileExemptions.has(f)
  );

  const project = new Project({
    tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });

  const findings = WATCHED.flatMap((table) =>
    [...table.methods].flatMap((method) => {
      const verb = method === "read" ? "reads" : "writes";
      return scannedFiles.flatMap((relativePath) => {
        const fullPath = path.join(process.cwd(), relativePath);
        const file =
          project.getSourceFile(fullPath) ??
          project.addSourceFileAtPath(fullPath);
        return scanAccessGuards(file, table, method)
          .filter(
            (finding) =>
              !functionExemptions.has(`${relativePath}:${finding.name}`)
          )
          .map((finding) => ({
            ...finding,
            file: relativePath,
            table: table.name,
            verb,
          }));
      });
    })
  );
  if (findings.length > 0) {
    throw new Error(
      "The access layer touches rows without deciding who is asking (its ESLint rule has no filter on this):\n" +
        findings
          .map(
            (finding) =>
              `  - ${finding.name} (${finding.file}:${finding.line}) ${finding.verb} ${finding.table} and never reaches canRead, canWrite or isAdmin`
          )
          .join("\n") +
        "\nGuard the access, or — if it is deliberate — add it to EXEMPTIONS in scripts/verify-access/scan.ts with its file, function name and reason." +
        "\nA guard only counts where it is called: rows.map(fn) reads as unguarded, rows.map((row) => fn(row)) does not."
    );
  }
}
