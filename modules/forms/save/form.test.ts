import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormDescriptor } from "../form-descriptor";

const {
  db,
  tx,
  assertFormStructuringOf,
  editableForm,
  currentUsername,
  currentAllows,
  countTitles,
  rename,
  retitle,
  countConversions,
  convert,
} = vi.hoisted(() => {
    const transaction = {
      form: {
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
    };
    return {
      db: {
        ...transaction,
        $transaction: vi.fn(
          async (work: (tx: typeof transaction) => Promise<void>) =>
            work(transaction)
        ),
      },
      tx: transaction,
      assertFormStructuringOf: vi.fn(),
      editableForm: vi.fn(),
      currentUsername: vi.fn(),
      currentAllows: vi.fn(),
      countTitles: vi.fn(),
      rename: vi.fn(),
      retitle: vi.fn(),
      countConversions: vi.fn(),
      convert: vi.fn(),
    };
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/modules/forms/access/guards", () => ({
  assertFormStructuringOf,
  editableForm,
}));
vi.mock("@/modules/permissions/person", () => ({
  currentAllows,
  currentUsername,
}));
vi.mock("@/modules/forms/field-rename/sweep", () => ({
  sweepFieldRenames: rename,
}));
vi.mock("@/modules/forms/entry-title/sweep", () => ({
  countTitleRecompute: countTitles,
  sweepEntryTitles: retitle,
}));

vi.mock("@/modules/forms/temporal-value/sweep", () => ({
  countTemporalConversion: countConversions,
  sweepTemporalValues: convert,
}));

const { countSaveTemporalImpact, countSaveTitleImpact, saveFormDefinition } =
  await import("./form");

const descriptor = (template: string): FormDescriptor => ({
  fields: [
    {
      type: "title",
      name: "title",
      label: "Titre",
      automatic: true,
      template,
    },
    { type: "text", name: "name", label: "Nom" },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  assertFormStructuringOf.mockResolvedValue(undefined);
  currentUsername.mockResolvedValue("marie");
  currentAllows.mockResolvedValue(true);
  countTitles.mockResolvedValue({ updated: 3, skipped: 1 });
});

describe("saveFormDefinition", () => {
  it("derives and executes the complete save plan inside one transaction", async () => {
    db.form.findUniqueOrThrow.mockResolvedValue({
      schema: descriptor("{name}"),
    });
    const definition = {
      name: "Annuaire",
      schema: descriptor("Fiche de {name}"),
      template: null,
    };
    const renames = new Map([["nom", "name"]]);

    await saveFormDefinition("form-1", definition, renames);

    expect(assertFormStructuringOf).toHaveBeenCalledWith("form-1");
    expect(db.form.update).toHaveBeenCalledWith({
      where: { id: "form-1" },
      data: definition,
    });
    expect(rename).toHaveBeenCalledWith(tx, "form-1", renames);
    expect(retitle).toHaveBeenCalledWith(
      tx,
      "form-1",
      definition.schema,
      "marie"
    );
    expect(db.$transaction).toHaveBeenCalledOnce();
  });

  it("previews title work from the same persisted-definition rule", async () => {
    editableForm.mockResolvedValue({
      id: "form-1",
      schema: descriptor("{name}"),
    });
    const after = descriptor("Fiche de {name}");

    await expect(countSaveTitleImpact("annuaire", after)).resolves.toEqual({
      updated: 3,
      skipped: 1,
    });
    expect(countTitles).toHaveBeenCalledWith(db, "form-1", after);
  });

  it("does not plan title work when the title definition is unchanged", async () => {
    const unchanged = descriptor("{name}");
    editableForm.mockResolvedValue({ id: "form-1", schema: unchanged });

    await expect(
      countSaveTitleImpact("annuaire", unchanged)
    ).resolves.toBeNull();
    expect(countTitles).not.toHaveBeenCalled();
  });

  it("does not sweep titles when saving an unchanged title definition", async () => {
    const unchanged = descriptor("{name}");
    db.form.findUniqueOrThrow.mockResolvedValue({ schema: unchanged });

    await saveFormDefinition(
      "form-1",
      { name: "Annuaire", schema: unchanged, template: null },
      new Map()
    );

    expect(retitle).not.toHaveBeenCalled();
  });
});

describe("a change of Date / heure mode at save", () => {
  const dated = (format: "datetime" | "date"): FormDescriptor => ({
    fields: [
      { type: "title", name: "title", label: "Titre" },
      { type: "datetime", name: "quand", label: "Quand", format },
    ],
  });
  const change = { name: "quand", label: "Quand", settings: { format: "date" } };

  it("converts the stored values of the field whose mode changes", async () => {
    db.form.findUniqueOrThrow.mockResolvedValue({ schema: dated("datetime") });
    const definition = { name: "Agenda", schema: dated("date"), template: null };

    await saveFormDefinition("form-1", definition, new Map());

    expect(convert).toHaveBeenCalledWith(
      tx,
      "form-1",
      definition.schema,
      [change],
      "marie"
    );
  });

  it("leaves the values alone when no mode changes", async () => {
    db.form.findUniqueOrThrow.mockResolvedValue({ schema: dated("date") });

    await saveFormDefinition(
      "form-1",
      { name: "Agenda", schema: dated("date"), template: null },
      new Map()
    );

    expect(convert).not.toHaveBeenCalled();
  });

  it("previews the conversion against the stored definition", async () => {
    editableForm.mockResolvedValue({ id: "form-1", schema: dated("datetime") });
    const impact = [{ label: "Quand", timeDropped: 2, emptied: 0, timeMissing: 0 }];
    countConversions.mockResolvedValue(impact);

    await expect(
      countSaveTemporalImpact("agenda", dated("date"), new Map())
    ).resolves.toEqual(impact);
    expect(countConversions).toHaveBeenCalledWith(db, "form-1", [change]);
  });

  it("previews nothing when no mode changes", async () => {
    editableForm.mockResolvedValue({ id: "form-1", schema: dated("date") });

    await expect(
      countSaveTemporalImpact("agenda", dated("date"), new Map())
    ).resolves.toBeNull();
    expect(countConversions).not.toHaveBeenCalled();
  });
});
