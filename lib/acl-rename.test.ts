import { describe, expect, it } from "vitest";
import {
  type PrincipalChange,
  rewriteAccessRule,
  rewriteDescriptorRights,
  rewriteFieldRights,
  rewriteFormPermissions,
} from "./acl-rename";
import type { FormDescriptor, FormField } from "./form-descriptor";

const renameJean: PrincipalChange = {
  kind: "username",
  from: "jean-martin",
  to: "jean-m",
};
const eraseJean: PrincipalChange = {
  kind: "username",
  from: "jean-martin",
  to: null,
};
const renameBureau: PrincipalChange = {
  kind: "groupSlug",
  from: "bureau",
  to: "conseil",
};

describe("rewriteAccessRule", () => {
  it("renames the username it names, and keeps the others", () => {
    const rule = {
      scope: "restricted",
      usernames: ["jean-martin", "marie-durand"],
    } as const;
    expect(rewriteAccessRule(rule, renameJean)).toEqual({
      scope: "restricted",
      usernames: ["marie-durand", "jean-m"],
    });
  });

  it("removes the username on an erasure", () => {
    const rule = { scope: "restricted", usernames: ["jean-martin"] } as const;
    expect(rewriteAccessRule(rule, eraseJean)).toEqual({
      scope: "restricted",
      usernames: [],
    });
  });

  it("renames a group slug, and leaves usernames alone", () => {
    const rule = {
      scope: "restricted",
      usernames: ["marie-durand"],
      groupSlugs: ["bureau"],
    } as const;
    expect(rewriteAccessRule(rule, renameBureau)).toEqual({
      scope: "restricted",
      usernames: ["marie-durand"],
      groupSlugs: ["conseil"],
    });
  });

  it("dedupes when the target name is already in the list", () => {
    const rule = {
      scope: "restricted",
      usernames: ["jean-martin", "jean-m"],
    } as const;
    expect(rewriteAccessRule(rule, renameJean)).toEqual({
      scope: "restricted",
      usernames: ["jean-m"],
    });
  });

  it("returns null when the rule is not restricted", () => {
    expect(rewriteAccessRule({ scope: "everyone" }, renameJean)).toBeNull();
    expect(rewriteAccessRule({ scope: "authenticated" }, renameJean)).toBeNull();
  });

  it("returns null when this principal is absent — nothing to write", () => {
    const rule = { scope: "restricted", usernames: ["marie-durand"] } as const;
    expect(rewriteAccessRule(rule, renameJean)).toBeNull();
    expect(rewriteAccessRule({ scope: "restricted" }, renameJean)).toBeNull();
  });
});

const BUREAU_ONLY = { scope: "restricted", groupSlugs: ["bureau"] } as const;
const JEAN_ONLY = { scope: "restricted", usernames: ["jean-martin"] } as const;

describe("rewriteFieldRights", () => {
  const fields: FormField[] = [
    { type: "title", name: "title", label: "Titre" },
    { type: "text", name: "nom", label: "Nom" },
    {
      type: "text",
      name: "salaire",
      label: "Salaire",
      readAcl: BUREAU_ONLY,
      writeAcl: JEAN_ONLY,
    },
  ];

  it("rewrites the read and write rights of every field naming the principal", () => {
    const rewritten = rewriteFieldRights(fields, renameJean);
    const salaire = rewritten?.find((field) => field.name === "salaire");
    expect(salaire?.readAcl).toEqual(BUREAU_ONLY); // untouched
    expect(salaire?.writeAcl).toEqual({
      scope: "restricted",
      usernames: ["jean-m"],
    });
  });

  it("leaves fields naming nobody untouched", () => {
    const rewritten = rewriteFieldRights(fields, renameJean);
    expect(rewritten?.find((field) => field.name === "nom")).toBe(fields[1]);
  });

  it("returns null when no field names this principal", () => {
    expect(
      rewriteFieldRights(fields, {
        kind: "username",
        from: "marie-durand",
        to: "m-durand",
      })
    ).toBeNull();
  });
});

describe("rewriteFormPermissions", () => {
  const permissions = {
    createEntry: JEAN_ONLY,
    defaultEntryRead: { scope: "everyone" } as const,
    defaultEntryWrite: BUREAU_ONLY,
  };

  it("rewrites every rule naming the principal, and leaves the rest", () => {
    expect(rewriteFormPermissions(permissions, renameJean)).toEqual({
      createEntry: { scope: "restricted", usernames: ["jean-m"] },
      defaultEntryRead: { scope: "everyone" },
      defaultEntryWrite: BUREAU_ONLY,
    });
  });

  it("returns null when nothing in the defaults names this principal", () => {
    expect(
      rewriteFormPermissions(permissions, {
        kind: "username",
        from: "marie-durand",
        to: null,
      })
    ).toBeNull();
  });
});

describe("rewriteDescriptorRights", () => {
  const descriptor: FormDescriptor = {
    fields: [
      { type: "title", name: "title", label: "Titre" },
      { type: "text", name: "salaire", label: "Salaire", writeAcl: JEAN_ONLY },
    ],
    permissions: {
      createEntry: { scope: "everyone" },
      defaultEntryRead: { scope: "everyone" },
      defaultEntryWrite: JEAN_ONLY,
    },
  };

  it("rewrites both the fields and the defaults in one pass", () => {
    const rewritten = rewriteDescriptorRights(descriptor, renameJean);
    expect(
      rewritten?.fields.find((field) => field.name === "salaire")?.writeAcl
    ).toEqual({ scope: "restricted", usernames: ["jean-m"] });
    expect(rewritten?.permissions?.defaultEntryWrite).toEqual({
      scope: "restricted",
      usernames: ["jean-m"],
    });
  });

  it("removes the principal from both on an erasure", () => {
    const rewritten = rewriteDescriptorRights(descriptor, eraseJean);
    expect(
      rewritten?.fields.find((field) => field.name === "salaire")?.writeAcl
    ).toEqual({ scope: "restricted", usernames: [] });
    expect(rewritten?.permissions?.defaultEntryWrite).toEqual({
      scope: "restricted",
      usernames: [],
    });
  });

  it("returns null — writes nothing — for a principal absent from the descriptor", () => {
    expect(
      rewriteDescriptorRights(descriptor, {
        kind: "username",
        from: "marie-durand",
        to: null,
      })
    ).toBeNull();
  });

  it("returns null for a descriptor with no defaults tab saved yet", () => {
    const noPermissions: FormDescriptor = { fields: descriptor.fields.slice(0, 1) };
    expect(rewriteDescriptorRights(noPermissions, renameJean)).toBeNull();
  });
});
