import { describe, expect, it } from "vitest";
import { entriesViewQuery } from "./field-references";

describe("entriesViewQuery", () => {
  it("collects every field-bearing prop in one place", () => {
    const query = entriesViewQuery(["actualites"], {
      form: "actualites",
      view: "grid",
      titleField: "title",
      subtitleField: "subtitle",
      visualField: "visual",
      textField: "text",
      footerField: "footer",
      badgeField: "badge",
      sumFields: ["amount", "tax"],
      hoverField: "hover",
      startDateField: "starts",
      endDateField: "ends",
      captionField: "caption",
      colorField: "color",
      iconField: "icon",
      periodField: "period",
      columns: [{ field: "column" }],
      filters: [{ field: "filter" }],
      sortOptions: [{ field: "visitor-sort" }],
      sortField: "$createdAt",
      search: true,
      searchFields: ["searchable"],
    });

    expect(query).toEqual({
      forms: ["actualites"],
      fields: [
        "$createdAt",
        "amount",
        "badge",
        "caption",
        "color",
        "column",
        "ends",
        "filter",
        "footer",
        "hover",
        "icon",
        "period",
        "searchable",
        "starts",
        "subtitle",
        "tax",
        "text",
        "title",
        "visitor-sort",
        "visual",
      ],
      allFields: false,
      allTextFields: false,
      mapFields: false,
    });
  });

  it("requests implicit fields for table, default search and map views", () => {
    expect(
      entriesViewQuery(["places"], {
        form: "places",
        view: "map",
        search: true,
      })
    ).toMatchObject({
      allFields: false,
      allTextFields: true,
      mapFields: true,
    });
    expect(
      entriesViewQuery(["people"], {
        form: "people",
        view: "table",
      }).allFields
    ).toBe(true);
  });
});
