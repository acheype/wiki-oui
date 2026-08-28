import { describe, expect, it } from "vitest";
import { leadingHeading } from "./mdx";

// The title a page opens with, taken off for a container that shows it
// itself (`?title=hidden`, app/(bare)/[slug]/iframe). Parsed to mdast like
// firstHeadingText, so a `#` inside a code fence is never a heading — and
// unlike it, only a heading the page *opens* with counts.
describe("leadingHeading", () => {
  it("takes the heading a page opens with, and leaves the rest verbatim", () => {
    const found = leadingHeading("# Aide-mémoire\n\nDu texte.\n");
    expect(found?.title).toBe("Aide-mémoire");
    expect(found?.body).toBe("\n\nDu texte.\n");
  });

  it("reads the heading's text through its marks", () => {
    expect(leadingHeading("## Un **gras** ici\n")?.title).toBe("Un gras ici");
  });

  it("ignores a heading that is not the first block", () => {
    expect(leadingHeading("Une phrase.\n\n# Titre\n")).toBeNull();
  });

  it("sees past a leading comment, which renders to nothing", () => {
    const found = leadingHeading("{/* note */}\n\n# Titre\n\nSuite.\n");
    expect(found?.title).toBe("Titre");
    // The comment stays: only the heading's own span is cut.
    expect(found?.body).toBe("{/* note */}\n\n\n\nSuite.\n");
  });

  it("is null on a page with no title", () => {
    expect(leadingHeading("Juste un paragraphe.\n")).toBeNull();
    expect(leadingHeading("")).toBeNull();
  });

  it("is null on a `#` that only looks like one", () => {
    expect(leadingHeading("```\n# pas un titre\n```\n")).toBeNull();
  });

  it("is null on a heading with no text", () => {
    expect(leadingHeading("#\n\nSuite.\n")).toBeNull();
  });
});
