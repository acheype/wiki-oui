import { describe, expect, it } from "vitest";
import {
  canReadField,
  canWriteField,
  mergedEntryData,
  readOnlyFields,
  readableDescriptor,
  readableEntryData,
  writableDescriptor,
} from "./field-level";
import type { FormDescriptor, FormField } from "@/modules/forms/form-descriptor";
import { type Person, ADMINS_GROUP } from "@/modules/permissions/rules";

const VISITOR: Person = { username: null, groupSlugs: [] };
const MARIE: Person = { username: "marie-durand", groupSlugs: [] };
const JEAN: Person = { username: "jean-martin", groupSlugs: ["bureau"] };
const ADMIN: Person = { username: "wiki-admin", groupSlugs: [ADMINS_GROUP.slug] };

const BUREAU = { scope: "restricted", groupSlugs: ["bureau"] } as const;

/** A payroll form: a title, a name anyone fills, and a salary @Bureau's alone. */
function payroll(salary: Partial<FormField> = {}): FormDescriptor {
  return {
    fields: [
      { type: "title", name: "title", label: "Titre" },
      { type: "text", name: "nom", label: "Nom" },
      {
        type: "text",
        name: "salaire",
        label: "Salaire",
        readAcl: BUREAU,
        writeAcl: BUREAU,
        ...salary,
      } as FormField,
    ],
  };
}

const names = (fields: FormField[]) => fields.map((field) => field.name);

describe("a field with no rule posed on it", () => {
  const open: FormField = { type: "text", name: "nom", label: "Nom" };

  it("is read and filled by a visitor", () => {
    expect(canReadField(VISITOR, open)).toBe(true);
    expect(canWriteField(VISITOR, open)).toBe(true);
  });
});

describe("a restricted field", () => {
  const [, , salary] = payroll().fields;

  it("closes to whoever the rule leaves out", () => {
    expect(canReadField(VISITOR, salary)).toBe(false);
    expect(canReadField(MARIE, salary)).toBe(false);
  });

  it("opens to whom it names", () => {
    expect(canReadField(JEAN, salary)).toBe(true);
    expect(canWriteField(JEAN, salary)).toBe(true);
  });

  // Administration is not a scope (docs/permissions.md § Le droit): their
  // access is the invariant every rule stands on.
  it("stays open to an administrator", () => {
    expect(canReadField(ADMIN, salary)).toBe(true);
    expect(canWriteField(ADMIN, salary)).toBe(true);
  });

  // The direction that closed a hole a browser run found: an unposed writing
  // must not answer « tout le monde » and hand back, through « écrire implique
  // lire », the very field the reading had just closed. Reading is the base:
  // nobody fills in what they cannot see.
  it("stays closed to a reader the writing alone would have let in", () => {
    const [, , salary] = payroll({ writeAcl: undefined }).fields;
    expect(canReadField(VISITOR, salary)).toBe(false);
    expect(canWriteField(VISITOR, salary)).toBe(false);
  });

  it("is not filled by whoever may not see it, whatever the writing says", () => {
    const [, , salary] = payroll({ writeAcl: { scope: "everyone" } }).fields;
    expect(canReadField(VISITOR, salary)).toBe(false);
    expect(canWriteField(VISITOR, salary)).toBe(false);
  });

  // And the reverse pairing, which is the ordinary one: everyone reads the
  // salary column, @Bureau alone moves it.
  it("shows a field whose writing alone is restricted", () => {
    const [, , salary] = payroll({ readAcl: undefined }).fields;
    expect(canReadField(VISITOR, salary)).toBe(true);
    expect(canWriteField(VISITOR, salary)).toBe(false);
  });
});

describe("what a screen is handed", () => {
  it("leaves an unreadable field out of the descriptor, order kept", () => {
    expect(names(readableDescriptor(VISITOR, payroll()).fields)).toEqual([
      "title",
      "nom",
    ]);
    expect(names(readableDescriptor(JEAN, payroll()).fields)).toEqual([
      "title",
      "nom",
      "salaire",
    ]);
  });

  it("keeps everything else of the descriptor", () => {
    const descriptor: FormDescriptor = {
      ...payroll(),
      permissions: {
        createEntry: { scope: "everyone" },
        defaultEntryRead: { scope: "everyone" },
        defaultEntryWrite: { scope: "restricted" },
      },
    };
    expect(readableDescriptor(VISITOR, descriptor).permissions).toEqual(
      descriptor.permissions
    );
  });

  it("leaves an unreadable value out of the data", () => {
    const data = { title: "Paie", nom: "Marie", salaire: 42000 };
    expect(readableEntryData(VISITOR, payroll(), data)).toEqual({
      title: "Paie",
      nom: "Marie",
    });
    expect(readableEntryData(JEAN, payroll(), data)).toEqual(data);
  });

  // A value whose field has gone answers to no rule, and the snapshots keep
  // it (docs/forms.md): dropping it here would be this module inventing a
  // verdict on something nobody posed a right on.
  it("keeps a value no field claims", () => {
    const data = { title: "Paie", ancien: "valeur orpheline" };
    expect(readableEntryData(VISITOR, payroll(), data)).toEqual(data);
  });

  it("names the fields shown greyed: readable, and not fillable", () => {
    const descriptor = payroll({ readAcl: { scope: "everyone" } });
    expect(names(readOnlyFields(MARIE, descriptor))).toEqual(["salaire"]);
    // Whoever cannot see it has nothing greyed: it is simply absent.
    expect(names(readOnlyFields(VISITOR, payroll()))).toEqual([]);
    expect(names(readOnlyFields(JEAN, descriptor))).toEqual([]);
  });

  it("derives what may be filled from the fields that may be", () => {
    expect(names(writableDescriptor(MARIE, payroll()).fields)).toEqual([
      "title",
      "nom",
    ]);
  });
});

describe("the merge at the write", () => {
  const current = { title: "Paie de Marie", nom: "Marie", salaire: 42000 };

  it("starts from the current revision and overlays what may be written", () => {
    expect(
      mergedEntryData(MARIE, payroll(), current, {
        title: "Paie de Marie Durand",
        nom: "Marie Durand",
      })
    ).toEqual({
      title: "Paie de Marie Durand",
      nom: "Marie Durand",
      salaire: 42000,
    });
  });

  // « Ce que le client envoie sur les autres est ignoré, pas refusé » (docs/
  // permissions.md § Champ): a difference of rights must never be what makes
  // a save fail — the value is simply not the sender's to move.
  it("ignores what the client sends on a field it may not write", () => {
    expect(
      mergedEntryData(MARIE, payroll(), current, { salaire: 0 }).salaire
    ).toBe(42000);
  });

  it("lets whoever may write it move it", () => {
    expect(mergedEntryData(JEAN, payroll(), current, { salaire: 45000 })).toEqual(
      { ...current, salaire: 45000 }
    );
  });

  // A field readable but not writable is on screen, greyed: the value comes
  // back from the browser all the same, and is dropped just the same.
  it("ignores a greyed field sent back unchanged", () => {
    const descriptor = payroll({ readAcl: { scope: "everyone" } });
    expect(
      mergedEntryData(MARIE, descriptor, current, { salaire: 99 }).salaire
    ).toBe(42000);
  });

  it("writes nothing on a field no descriptor claims", () => {
    expect(mergedEntryData(MARIE, payroll(), current, { inconnu: "x" })).toEqual(
      current
    );
  });

  it("holds nothing back from an administrator", () => {
    expect(
      mergedEntryData(ADMIN, payroll(), current, { salaire: 50000 }).salaire
    ).toBe(50000);
  });
});
