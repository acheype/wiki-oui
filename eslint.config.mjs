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

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
      // Sweeps: they retcon a whole namespace in place, actor-free by nature
      // (ADR 0016/0017/0020). Future ones (acl-rename-db) belong here too.
      "lib/slug-rename-db.ts",
      "lib/entry-title-db.ts",
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
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
