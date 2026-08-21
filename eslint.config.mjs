import path from "node:path";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Prisma model methods: the leaf of `<client>.page.findMany(…)`. Matching on
// the method (and not on `.page` alone) keeps `page.form`, `source.page.slug`
// and friends out of the rule's way.
const PRISMA_MODEL_METHODS = [
  "aggregate",
  "count",
  "create",
  "createMany",
  "createManyAndReturn",
  "delete",
  "deleteMany",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
].join("|");

// Catches `prisma.page.…` as well as `tx.form.…` inside a transaction.
const directPageOrFormAccess =
  "MemberExpression[object.property.name=/^(page|form)$/]" +
  `[property.name=/^(${PRISMA_MODEL_METHODS})$/]`;

// The three clauses that may come out empty, `{}` meaning « every row » for
// an actor who reads or writes everything. Prisma drops an empty branch from
// an `OR`, so joining one by hand turns « everything » into « only the other
// branches » — see anyClause() in lib/permissions.ts, which absorbs instead.
const ACCESS_CLAUSES = "readableWhere|writableWhere|listReadableWhere|currentReadableWhere";

// An `OR: [ … ]` holding a call to one of them, however deep in the array.
const accessClauseInsideOr =
  `Property[key.name='OR'] > ArrayExpression CallExpression[callee.name=/^(${ACCESS_CLAUSES})$/],` +
  `Property[key.name='OR'] > ArrayExpression AwaitExpression > CallExpression[callee.name=/^(${ACCESS_CLAUSES})$/]`;

// modules/<name>/<rest…> -> the module a file belongs to; null outside modules/.
function moduleOfFile(filename) {
  const relative = path.relative(process.cwd(), filename).split(path.sep).join("/");
  const match = relative.match(/^modules\/([^/]+)\//);
  return match ? match[1] : null;
}

// "@/modules/<name>/<rest…>" -> { module, first segment, root or not }; null
// for anything else (a bare specifier, a relative import, another alias).
function moduleImportTarget(source) {
  const match = /^@\/modules\/([^/]+)\/(.+)$/.exec(source);
  if (!match) return null;
  const [, targetModule, rest] = match;
  const segments = rest.split("/");
  return { module: targetModule, first: segments[0], isRoot: segments.length === 1 };
}

// A module's interface is its root listing (ADR 0029): a file one hop below
// modules/<name>/ can be imported from elsewhere, a file under a sub-folder
// cannot, and queries.ts — root or not — never can, since it is the door
// (ADR 0025) and a door reached from outside its own module answers to nobody's
// rights but the caller's own module. `app/` is the one composition root
// allowed past `ui/`, and only `ui/` — every other sub-folder stays private to
// its module even from `app/`.
const moduleSeamRule = {
  meta: {
    type: "problem",
    docs: {
      description: "A module's interface is its root listing, not its sub-folders (ADR 0029).",
    },
    schema: [],
  },
  create(context) {
    function check(node, source) {
      const target = moduleImportTarget(source);
      if (!target) return;
      const filename = context.filename;
      if (moduleOfFile(filename) === target.module) return; // inside the module: no seam here
      const bareFirst = target.first.replace(/\.tsx?$/, "");
      if (target.isRoot && bareFirst !== "queries") return; // a root file, and not the door
      if (target.first === "ui") {
        const fromApp = path.relative(process.cwd(), filename).split(path.sep).join("/").startsWith("app/");
        if (fromApp) return; // the sole exemption: app/ composes a module's ui/
      }
      const what = bareFirst === "queries" && target.isRoot ? "queries.ts is the door" : `${target.first} is private`;
      context.report({
        node,
        message: `modules/${target.module}/${what} (ADR 0029) — import a root file of the module instead.`,
      });
    }
    return {
      ImportDeclaration(node) {
        if (typeof node.source?.value === "string") check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (typeof node.source?.value === "string") check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (typeof node.source?.value === "string") check(node, node.source.value);
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: "wikioui/module-seam",
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { wikioui: { rules: { "module-seam": moduleSeamRule } } },
    rules: {
      "wikioui/module-seam": "error",
    },
  },
  {
    name: "wikioui/access-layer",
    // One door to Page and Form (ADR 0025): every other module asks the access
    // layer, so the permission checks it will host cannot be bypassed by a
    // caller that forgot them — a forgotten read leaks in silence, and no test
    // reddens. Exceptions stay few, so that adding one is visible in review.
    ignores: [
      // The access layer itself.
      "lib/pages.ts",
      "lib/forms.ts",
      // Its neighbours behind the same door: BetterAuth owns the account
      // tables and touches nothing else (ADR 0023), the actor resolution
      // reads the session, the accounts and the groups are their own door —
      // every action on one is an administrator's or a link holder's,
      // checked there — and the installation flag is a single row no rule
      // applies to (ADR 0027). None of them reaches Page or Form except
      // through lib/pages.ts and lib/forms.ts, which is why the counts and
      // the reassignment of an erased account live over there.
      "lib/auth.ts",
      "lib/accounts-db.ts",
      "modules/permissions/groups-queries.ts",
      "modules/permissions/person.ts",
      "lib/settings.ts",
      // Sweeps: they retcon a whole namespace in place, actor-free by nature
      // (ADR 0016/0017/0020/0024).
      "lib/slug-rename-db.ts",
      "lib/entry-title-db.ts",
      "modules/permissions/acl-rename-sweep.ts",
      // The seed writes without an actor, before anyone can be one.
      "prisma/seed.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: directPageOrFormAccess,
          message:
            "Page and Form are reached through lib/pages.ts and lib/forms.ts only (ADR 0025). Add a function there rather than querying Prisma here.",
        },
      ],
      // The syntax rule reads names, so it says nothing about a Page reached
      // through a relation (`prisma.revision.findMany({ include: { page } })`)
      // nor about raw SQL on "Page". Holding the client itself behind the two
      // doors closes both: outside them there is nothing to query with.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/prisma",
              message:
                "The Prisma client lives behind lib/pages.ts and lib/forms.ts (ADR 0025). Sweep modules receive their client as a parameter.",
            },
          ],
        },
      ],
    },
  },
  {
    name: "wikioui/access-clauses",
    // Deliberately without the exemptions above: the access layer is where
    // this join is written, so it is the first place the rule has to reach.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: accessClauseInsideOr,
          message:
            "An access clause may be empty, and Prisma drops an empty branch from an OR — the branch that meant « everything » would vanish. Compose with anyClause() from lib/permissions.ts.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Upstream YesWiki code, copied as migration reference. It stays
    // identical to its source: we read it, we do not style it.
    "docs/reference/**",
  ]),
]);

export default eslintConfig;
