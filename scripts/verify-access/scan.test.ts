import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { scanAccessGuards } from "./scan";

// Builds an in-memory project with a stand-in decide/rules.ts
// (the three primitives) plus whatever modules/pages/content.ts-shaped source
// the test provides — the same in-memory pattern
// modules/authoring/verify.test.ts uses for cross-file resolution.
function projectWith(pagesSource: string, extraFiles: Record<string, string> = {}) {
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
  return project.createSourceFile("modules/pages/content.ts", pagesSource);
}

describe("scanAccessGuards", () => {
  it("flags an exported function that reads Page and never decides on it", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function leaky(slug: string) {
         return prisma.page.findUnique({ where: { slug } });
       }`
    );
    const findings = scanAccessGuards(file);
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
    expect(scanAccessGuards(file)).toEqual([]);
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
    expect(scanAccessGuards(file)).toEqual([]);
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
    expect(scanAccessGuards(file)).toEqual([]);
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
    expect(scanAccessGuards(file)).toEqual([]);
  });

  it("does not flag a function with no Page read at all", () => {
    const file = projectWith(
      `export function pureHelper(a: number, b: number): number {
         return a + b;
       }`
    );
    expect(scanAccessGuards(file)).toEqual([]);
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
    const findings = scanAccessGuards(file);
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
    expect(scanAccessGuards(file)).toEqual([]);
  });

  it("does not flag a revision read that never touches the page relation", () => {
    const file = projectWith(
      `import { prisma } from "./prisma";
       export async function countRevisions(username: string) {
         return prisma.revision.count({ where: { authorUsername: username } });
       }`
    );
    expect(scanAccessGuards(file)).toEqual([]);
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
    expect(scanAccessGuards(file)).toEqual([]);
  });

  it("flags a cache()-wrapped exported const that stays unguarded", () => {
    const file = projectWith(
      `import { cache } from "react";
       import { prisma } from "./prisma";
       export const cachedLeaky = cache(async (slug: string) => {
         return prisma.page.findUnique({ where: { slug } });
       });`
    );
    const findings = scanAccessGuards(file);
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
    const findings = scanAccessGuards(file);
    expect(findings.map((f) => f.name)).toContain("stuck");
  });
});
