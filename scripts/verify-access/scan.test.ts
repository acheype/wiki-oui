import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  FORM,
  GROUP_MEMBER,
  PAGE,
  PAGE_ACL,
  REVISION,
  SETTINGS,
  USER,
  scanAccessGuards,
} from "./scan";

// Builds an in-memory project with a stand-in decide/rules.ts
// (the three primitives) plus whatever modules/pages/content.ts-shaped source
// the test provides — the same in-memory pattern
// modules/authoring/verify.test.ts uses for cross-file resolution.
function projectWith(
  pagesSource: string,
  extraFiles: Record<string, string> = {},
  path = "modules/pages/content.ts"
) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(
    "modules/permissions/decide/rules.ts",
    `export function canRead(person: unknown, page: unknown): boolean { return true; }
     export function canWrite(person: unknown, page: unknown): boolean { return true; }
     export function isAdmin(person: unknown): boolean { return true; }`
  );
  project.createSourceFile(
    "modules/permissions/person.ts",
    `import { canRead, isAdmin } from "./decide/rules";
     export async function currentPerson(): Promise<unknown> { return {}; }
     export async function currentCanRead(page: unknown): Promise<boolean> {
       return canRead(await currentPerson(), page);
     }
     export async function assertAdmin(): Promise<void> {
       if (!isAdmin(await currentPerson())) throw new Error("refused");
     }`
  );
  for (const [path, source] of Object.entries(extraFiles)) {
    project.createSourceFile(path, source);
  }
  return project.createSourceFile(path, pagesSource);
}

describe("scanAccessGuards", () => {
  it("flags an exported function that reads Page and never decides on it", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function leaky(slug: string) {
         return prisma.page.findUnique({ where: { slug } });
       }`
    );
    const findings = scanAccessGuards(file, PAGE);
    expect(findings.map((f) => f.name)).toContain("leaky");
  });

  it("accepts a direct call to one of the three primitives", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       import { canRead } from "../../modules/permissions/decide/rules";
       async function currentPerson() { return {}; }
       export async function safe(slug: string) {
         const page = await prisma.page.findUnique({ where: { slug } });
         if (page && canRead(await currentPerson(), page)) return page;
         return null;
       }`
    );
    expect(scanAccessGuards(file, PAGE)).toEqual([]);
  });

  it("follows a relay two hops deep (assertStructuring -> ownsPage -> isAdmin)", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       import { isAdmin } from "../../modules/permissions/decide/rules";
       async function currentPerson() { return {}; }
       function ownsPage(person: unknown, page: unknown): boolean {
         return isAdmin(person);
       }
       async function assertStructuring(page: unknown): Promise<void> {
         if (!ownsPage(await currentPerson(), page)) throw new Error("refused");
       }
       export async function deleteIt(id: string) {
         const page = await prisma.page.findUniqueOrThrow({ where: { id } });
         await assertStructuring(page);
         return page;
       }`
    );
    expect(scanAccessGuards(file, PAGE)).toEqual([]);
  });

  it("follows a relay imported from another file (assertAdmin -> isAdmin)", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       import { assertAdmin } from "../../modules/permissions/person";
       export async function listAll() {
         await assertAdmin();
         return prisma.page.findMany({});
       }`
    );
    expect(scanAccessGuards(file, PAGE)).toEqual([]);
  });

  it("follows the hop person.ts adds (currentCanRead -> canRead)", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       import { currentCanRead } from "../../modules/permissions/person";
       export async function getPageWithCurrent(slug: string) {
         const page = await prisma.page.findUnique({ where: { slug } });
         return page && (await currentCanRead(page)) ? page : null;
       }`
    );
    expect(scanAccessGuards(file, PAGE)).toEqual([]);
  });

  it("does not flag a function with no Page read at all", () => {
    const file = projectWith(
      `export function pureHelper(a: number, b: number): number {
         return a + b;
       }`
    );
    expect(scanAccessGuards(file, PAGE)).toEqual([]);
  });

  it("flags a page read reached through a revision relation, unguarded", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function leakyRelation(id: string) {
         return prisma.revision.findUnique({
           where: { id },
           include: { page: true },
         });
       }`
    );
    const findings = scanAccessGuards(file, PAGE);
    expect(findings.map((f) => f.name)).toContain("leakyRelation");
  });

  it("accepts a page read through a revision relation once guarded", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       import { canRead } from "../../modules/permissions/decide/rules";
       async function currentPerson() { return {}; }
       export async function safeRelation(id: string) {
         const revision = await prisma.revision.findUnique({
           where: { id },
           include: { page: true },
         });
         if (revision && canRead(await currentPerson(), revision.page)) return revision;
         return null;
       }`
    );
    expect(scanAccessGuards(file, PAGE)).toEqual([]);
  });

  it("does not flag a revision read that never touches the page relation", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function countRevisions(username: string) {
         return prisma.revision.count({ where: { authorUsername: username } });
       }`
    );
    expect(scanAccessGuards(file, PAGE)).toEqual([]);
  });

  it("unwraps a cache()-wrapped exported const", () => {
    const file = projectWith(
      `import { cache } from "react";
       import { prisma } from "./prisma";
       import { canRead } from "../../modules/permissions/decide/rules";
       async function currentPerson() { return {}; }
       export const cached = cache(async (slug: string) => {
         const page = await prisma.page.findUnique({ where: { slug } });
         return page && canRead(await currentPerson(), page);
       });`
    );
    expect(scanAccessGuards(file, PAGE)).toEqual([]);
  });

  it("flags a cache()-wrapped exported const that stays unguarded", () => {
    const file = projectWith(
      `import { cache } from "react";
       import { prisma } from "./prisma";
       export const cachedLeaky = cache(async (slug: string) => {
         return prisma.page.findUnique({ where: { slug } });
       });`
    );
    const findings = scanAccessGuards(file, PAGE);
    expect(findings.map((f) => f.name)).toContain("cachedLeaky");
  });

  it("does not loop forever on a mutual recursion between relays", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       function guardA(page: unknown): boolean { return guardB(page); }
       function guardB(page: unknown): boolean { return guardA(page); }
       export async function stuck(slug: string) {
         const page = await prisma.page.findUnique({ where: { slug } });
         if (page && guardA(page)) return page;
         return null;
       }`
    );
    const findings = scanAccessGuards(file, PAGE);
    expect(findings.map((f) => f.name)).toContain("stuck");
  });

  it("flags a form read that never decides who is asking", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function everyDefinition() {
         return prisma.form.findMany({});
       }`,
      {},
      "modules/forms/forms.ts"
    );
    expect(scanAccessGuards(file, FORM).map((f) => f.name)).toContain(
      "everyDefinition"
    );
  });

  it("accepts a form read once the definition is cut to what is readable", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       import { isAdmin } from "../../modules/permissions/decide/rules";
       async function currentPerson() { return {}; }
       async function readableForm(schema: unknown) {
         return isAdmin(await currentPerson()) ? schema : null;
       }
       export async function readableFormBySlug(slug: string) {
         const form = await prisma.form.findUnique({ where: { slug } });
         return form && { ...form, seen: await readableForm(form.schema) };
       }`,
      {},
      "modules/forms/forms.ts"
    );
    expect(scanAccessGuards(file, FORM)).toEqual([]);
  });

  it("flags a form reached through a page relation, unguarded", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function leakyRelation(slug: string) {
         return prisma.page.findUnique({
           where: { slug },
           include: { form: true },
         });
       }`,
      {},
      "modules/forms/forms.ts"
    );
    expect(scanAccessGuards(file, FORM).map((f) => f.name)).toContain(
      "leakyRelation"
    );
  });

  it("flags an exported function that writes User and never decides on it", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function leaky(username: string) {
         await prisma.user.update({ where: { username }, data: { name: "x" } });
       }`,
      {},
      "modules/accounts/access/guards.ts"
    );
    const findings = scanAccessGuards(file, USER, "write");
    expect(findings.map((f) => f.name)).toContain("leaky");
  });

  it("accepts a write behind assertAdmin", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       import { assertAdmin } from "../../../modules/permissions/person";
       export async function safe(username: string) {
         await assertAdmin();
         await prisma.user.update({ where: { username }, data: { name: "x" } });
       }`,
      {},
      "modules/accounts/access/guards.ts"
    );
    expect(scanAccessGuards(file, USER, "write")).toEqual([]);
  });

  it("does not flag a read when checking for writes", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function readOnly(username: string) {
         return prisma.user.findUnique({ where: { username } });
       }`,
      {},
      "modules/accounts/access/guards.ts"
    );
    expect(scanAccessGuards(file, USER, "write")).toEqual([]);
  });

  it("flags a write through a transaction client (tx.model.method)", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function leaky(slug: string) {
         await prisma.$transaction(async (tx: any) => {
           await tx.groupMember.deleteMany({ where: { groupSlug: slug } });
         });
       }`,
      {},
      "modules/permissions/access/guards.ts"
    );
    const findings = scanAccessGuards(file, GROUP_MEMBER, "write");
    expect(findings.map((f) => f.name)).toContain("leaky");
  });

  it("does not flag a write on a different model than the watched one", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function writesOther(slug: string) {
         await prisma.group.create({ data: { slug, name: slug } });
       }`,
      {},
      "modules/permissions/access/guards.ts"
    );
    expect(scanAccessGuards(file, GROUP_MEMBER, "write")).toEqual([]);
  });

  // --- via extended to relation names (issue #23) ----------------------------

  it("flags a revision read reached through a page's 'current' relation, unguarded", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function leakyCurrent(slug: string) {
         return prisma.page.findUnique({
           where: { slug },
           include: { current: true },
         });
       }`
    );
    const findings = scanAccessGuards(file, REVISION);
    expect(findings.map((f) => f.name)).toContain("leakyCurrent");
  });

  it("flags a revision read reached through a page's 'revisions' relation, unguarded", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function leakyRevisions(slug: string) {
         return prisma.page.findUnique({
           where: { slug },
           include: { revisions: true },
         });
       }`
    );
    const findings = scanAccessGuards(file, REVISION);
    expect(findings.map((f) => f.name)).toContain("leakyRevisions");
  });

  it("accepts a revision read through 'current' once guarded", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       import { canRead } from "../../modules/permissions/decide/rules";
       async function currentPerson() { return {}; }
       export async function safeRevision(slug: string) {
         const page = await prisma.page.findUnique({
           where: { slug },
           include: { current: true },
         });
         if (page && canRead(await currentPerson(), page)) return page;
         return null;
       }`
    );
    expect(scanAccessGuards(file, REVISION)).toEqual([]);
  });

  it("does not flag a page read that does not include current or revisions as a Revision access", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function pageOnly(slug: string) {
         return prisma.page.findUnique({ where: { slug } });
       }`
    );
    expect(scanAccessGuards(file, REVISION)).toEqual([]);
  });

  it("flags a direct revision read, unguarded", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function directRevision(id: string) {
         return prisma.revision.findUnique({ where: { id } });
       }`
    );
    const findings = scanAccessGuards(file, REVISION);
    expect(findings.map((f) => f.name)).toContain("directRevision");
  });

  // --- new write-only tables (issue #23) -------------------------------------

  it("flags an unguarded PageAcl write", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function leaky(rows: any[]) {
         await prisma.pageAcl.createMany({ data: rows });
       }`,
      {},
      "modules/pages/rights.ts"
    );
    const findings = scanAccessGuards(file, PAGE_ACL, "write");
    expect(findings.map((f) => f.name)).toContain("leaky");
  });

  it("flags an unguarded Settings write", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function leaky() {
         await prisma.settings.upsert({
           where: { id: 1 },
           create: { id: 1, installedAt: new Date() },
           update: { installedAt: new Date() },
         });
       }`,
      {},
      "modules/settings/settings.ts"
    );
    const findings = scanAccessGuards(file, SETTINGS, "write");
    expect(findings.map((f) => f.name)).toContain("leaky");
  });
});
