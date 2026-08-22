import { describe, expect, it } from "vitest";
import { fold } from "./fold";

describe("fold", () => {
  it("matches case- and diacritics-insensitively", () => {
    expect(fold("École")).toBe(fold("ecole"));
  });
});
