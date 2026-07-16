import { describe, expect, it } from "vitest";
import { isResizable, parseResizeRequest, variantKey } from "./image-resize";

// The stamp is what makes a recycled name a different resource: ADR 0012
// forbids overwriting, but deleting frees the name for other bytes.
const STAMP = { mtimeMs: 1_700_000_000_000, size: 48_213 };

describe("variantKey", () => {
  it("is stable for the same file and box", () => {
    expect(variantKey("logo.png", { width: 400 }, STAMP)).toBe(
      variantKey("logo.png", { width: 400 }, STAMP)
    );
  });

  it("separates the boxes of one file", () => {
    const keys = new Set([
      variantKey("logo.png", {}, STAMP),
      variantKey("logo.png", { width: 400 }, STAMP),
      variantKey("logo.png", { height: 400 }, STAMP),
      variantKey("logo.png", { width: 400, height: 400 }, STAMP),
    ]);
    expect(keys.size).toBe(4);
  });

  it("changes when a new file takes the name", () => {
    const before = variantKey("logo.png", { width: 400 }, STAMP);
    const after = variantKey("logo.png", { width: 400 }, {
      ...STAMP,
      mtimeMs: STAMP.mtimeMs + 1,
    });
    expect(after).not.toBe(before);
  });

  it("changes on size alone, when mtime ties", () => {
    // Delete + reupload inside the same millisecond: mtime cannot tell them
    // apart, size still can. This is why the stamp carries both.
    const before = variantKey("logo.png", { width: 400 }, STAMP);
    const after = variantKey("logo.png", { width: 400 }, { ...STAMP, size: 9 });
    expect(after).not.toBe(before);
  });

  it("separates two files stamped alike", () => {
    expect(variantKey("a.png", {}, STAMP)).not.toBe(
      variantKey("b.png", {}, STAMP)
    );
  });
});

describe("parseResizeRequest", () => {
  const parse = (query: string) => parseResizeRequest(new URLSearchParams(query));

  it("reads a box", () => {
    expect(parse("w=400&h=100")).toEqual({ width: 400, height: 100 });
  });

  it("is null when nothing is asked", () => {
    expect(parse("")).toBeNull();
    expect(parse("autre=1")).toBeNull();
  });

  it("refuses what is not a positive integer", () => {
    expect(parse("w=abc")).toBeNull();
    expect(parse("w=0")).toBeNull();
    expect(parse("w=-5")).toBeNull();
    expect(parse("w=1.5")).toBeNull();
  });

  it("bounds a dimension rather than trusting it", () => {
    expect(parse("w=999999")).toEqual({ width: 4000, height: undefined });
  });
});

describe("isResizable", () => {
  it("accepts raster formats sharp decodes", () => {
    for (const name of ["a.png", "a.JPG", "a.jpeg", "a.webp", "a.gif", "a.tif"]) {
      expect(isResizable(name), name).toBe(true);
    }
  });

  it("refuses svg, and anything that is not a raster image", () => {
    // An svg is scalable and served under CSP: sandbox (ADR 0012): resizing
    // it means handing it to sharp for nothing.
    for (const name of ["logo.svg", "doc.pdf", "a.bmp", "notes.md", "x.mp4"]) {
      expect(isResizable(name), name).toBe(false);
    }
  });
});
