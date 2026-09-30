import { describe, expect, it } from "vitest";
import type { EntriesViewData } from "./actions";
import { fieldOptions } from "./options";

const data: EntriesViewData = {
  fields: [
    {
      name: "status",
      label: "Statut",
      type: "list",
      options: { draft: "Brouillon", published: "Publié" },
    },
    { name: "tags", label: "Mots-clés", type: "tags" },
  ],
  entries: [
    { slug: "one", title: "Une", values: { tags: ["zèbre", "alpha"] } },
    { slug: "two", title: "Deux", values: { tags: ["alpha", "bravo"] } },
  ],
  sample: false,
  formNames: { associations: "Associations", events: "Événements" },
  permissions: {},
};

describe("fieldOptions", () => {
  it("uses the same labels for forms, declared options and observed values", () => {
    expect(fieldOptions(data, "$form")).toEqual([
      ["associations", "Associations"],
      ["events", "Événements"],
    ]);
    expect(fieldOptions(data, "status")).toEqual([
      ["draft", "Brouillon"],
      ["published", "Publié"],
    ]);
    expect(fieldOptions(data, "tags")).toEqual([
      ["alpha", "alpha"],
      ["bravo", "bravo"],
      ["zèbre", "zèbre"],
    ]);
  });
});
