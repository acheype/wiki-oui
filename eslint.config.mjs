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
// branches » — see anyClause() in modules/permissions/decide/rules.ts, which
// absorbs instead.
const ACCESS_CLAUSES = "readableWhere|writableWhere|currentReadableWhere";

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

// A specifier -> { module, first segment, root or not }; null when it lands
// outside modules/ (a package, another alias). Both spellings the repo uses
// resolve here: the "@/modules/…" alias, and a relative path resolved against
// the importing file. Relative used to be skipped, which made the seam blind
// to exactly the file that crosses it most — registry/sources.ts reaches every
// module's wiki-components/ through `../../<module>/wiki-components/…`.
// `source` may be a template literal's static prefix, hence the trailing
// slash kept through path.join, which would otherwise drop it and make
// "…/wiki-components/" read as a root file named "wiki-components".
function moduleImportTarget(source, filename) {
  let relative;
  if (source.startsWith("@/")) {
    relative = source.slice(2);
  } else if (source.startsWith(".")) {
    const dir = path.dirname(path.relative(process.cwd(), filename));
    const joined = path.join(dir, source).split(path.sep).join("/");
    relative = source.endsWith("/") ? `${joined}/` : joined;
  } else {
    return null; // a bare specifier: a package, not our code
  }
  const match = /^modules\/([^/]+)\/(.+)$/.exec(relative);
  if (!match) return null;
  const [, targetModule, rest] = match;
  const segments = rest.split("/");
  return { module: targetModule, first: segments[0], isRoot: segments.length === 1 };
}

// A module's interface is its root listing (ADR 0029): a file one hop below
// modules/<name>/ can be imported from elsewhere, a file under a sub-folder
// cannot. The door (ADR 0025, e.g. modules/pages/access/guards.ts) never
// sits at the root for exactly this reason — a door reached from outside its
// own module answers to nobody's rights but the caller's own module, so
// depth alone keeps it private, with no name to special-case. `app/` is the
// one composition root allowed past `ui/`, and only `ui/` — every other
// sub-folder stays private to its module even from `app/`.
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
      const filename = context.filename;
      const target = moduleImportTarget(source, filename);
      if (!target) return;
      if (moduleOfFile(filename) === target.module) return; // inside the module: no seam here
      if (target.isRoot) return; // a root file: this is a module's public interface
      if (target.first === "ui") {
        const fromApp = path.relative(process.cwd(), filename).split(path.sep).join("/").startsWith("app/");
        if (fromApp) return; // the sole exemption: app/ composes a module's ui/
      }
      const relative = path.relative(process.cwd(), filename).split(path.sep).join("/");
      // The registry's source table (ADR 0002) reaches into every module's
      // wiki-components/. It does name those modules — it is the table of them
      // — but it depends on none: it imports no symbol, only whatever component
      // the folder happens to hold. That is the registry itself, not a module
      // leaning on another's internals. Listed by file so a second reader shows
      // in the diff, the way ADR 0025's access-layer list works.
      const REGISTRY_LOADERS = ["modules/authoring/registry/sources.ts"];
      if (target.first === "wiki-components" && REGISTRY_LOADERS.includes(relative)) return;
      context.report({
        node,
        message: `modules/${target.module}/${target.first} is private (ADR 0029) — import a root file of the module instead.`,
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
      ImportExpression(node) {
        // A template literal is how a loader spells a path it computes
        // (`../../pages/wiki-components/${base}.tsx`). Its first quasi is the
        // static prefix, which already names the module and the sub-folder —
        // everything the seam judges. Reading only Literal here left every
        // such import unseen.
        if (node.source?.type === "TemplateLiteral") {
          const prefix = node.source.quasis[0]?.value?.cooked;
          if (typeof prefix === "string") check(node, prefix);
          return;
        }
        if (node.source?.type === "Literal" && typeof node.source.value === "string") {
          check(node, node.source.value);
        }
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
      // The access layer itself. lib/pages.ts split into five files at the
      // door (ADR 0029): modules/pages/access/guards.ts plus the four root
      // files that each read or write Page directly (content.ts,
      // revisions.ts, rights.ts, entries.ts) — this rule polices
      // `prisma.page`, not the ESLint module-seam privacy of guards.ts, so
      // all five need the exemption, not just the one that stayed private.
      "modules/pages/access/guards.ts",
      "modules/pages/content.ts",
      "modules/pages/revisions.ts",
      "modules/pages/rights.ts",
      "modules/pages/entries.ts",
      // lib/forms.ts split the same way at the door (ADR 0029): a private
      // access/guards.ts, holding the guards and the reads nothing outside the
      // module needs, plus the one root file left, forms.ts, that carries the
      // whole public API — small enough that a single file sufficed where Page
      // needed four.
      "modules/forms/forms.ts",
      "modules/forms/access/guards.ts",
      // Its neighbours behind the same door: BetterAuth owns the account
      // tables and touches nothing else (ADR 0023), the actor resolution
      // reads the session, the accounts and the groups are their own door —
      // every action on one is an administrator's or a link holder's,
      // checked there — and the installation flag is a single row no rule
      // applies to (ADR 0027). None of them reaches Page or Form except
      // through modules/pages/ and modules/forms/, which is why the counts
      // and the reassignment of an erased account live over there.
      // modules/settings/settings.ts stays a root file rather than a private
      // queries.ts: proxy.ts, outside every module, calls isInstalled() and
      // markInstalled() directly on every request.
      "modules/accounts/auth.ts",
      "modules/accounts/queries/queries.ts",
      "modules/permissions/groups-queries.ts",
      "modules/permissions/person.ts",
      "modules/settings/settings.ts",
      // Sweeps: they retcon a whole namespace in place, actor-free by nature
      // (ADR 0016/0017/0020/0024).
      "lib/slug-rename-db.ts",
      "modules/forms/entry-title/sweep.ts",
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
            "Page and Form are reached through modules/pages/ and lib/forms.ts only (ADR 0025). Add a function there rather than querying Prisma here.",
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
                "The Prisma client lives behind modules/pages/ and lib/forms.ts (ADR 0025). Sweep modules receive their client as a parameter.",
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
            "An access clause may be empty, and Prisma drops an empty branch from an OR — the branch that meant « everything » would vanish. Join with AND, which has no such trap; if it really has to be OR, the absorbing join is anyClause() in modules/permissions/decide/rules.ts, and reaching for it from another module means the clause belongs there too.",
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
