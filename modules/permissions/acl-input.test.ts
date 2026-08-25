import { describe, expect, it } from "vitest";
import { aclFloorLabels, alwaysAllowedNote } from "./acl-input";

const MARIE_FLOOR = { owner: { username: "marie-durand", name: "Marie Durand" } };
const NO_OWNER_FLOOR = { owner: null };

describe("the floor a « seulement » list stands on", () => {
  it("shows the owner and the administrators, so the box is never empty", () => {
    expect(aclFloorLabels(MARIE_FLOOR)).toEqual({
      people: ["Marie Durand (propriétaire)"],
      groups: ["@Admins"],
    });
  });

  it("promises nothing about an owner the page no longer has", () => {
    expect(aclFloorLabels(NO_OWNER_FLOOR)).toEqual({
      people: [],
      groups: ["@Admins"],
    });
    expect(alwaysAllowedNote(NO_OWNER_FLOOR)).not.toContain("propriétaire");
    expect(alwaysAllowedNote(MARIE_FLOOR)).toContain(
      "Le propriétaire et les administrateurs"
    );
  });
});
