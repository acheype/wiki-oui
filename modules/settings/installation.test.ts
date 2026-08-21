import { describe, expect, it } from "vitest";
import { INSTALLER } from "./installation";
import { deriveUsername, isValidUsername } from "@/modules/accounts/username";

// ADR 0027 imposes both halves of the initial identity, and they must agree
// with the wiki's own rule: an installer who reads "Wiki Admin" and types it
// into the rename dialog gets exactly the identifier they already have.
describe("the imposed identity of the initial account", () => {
  it("is what the wiki would derive from the imposed display name", () => {
    expect(deriveUsername(INSTALLER.name)).toBe(INSTALLER.username);
  });

  it("is a usable identifier", () => {
    expect(isValidUsername(INSTALLER.username)).toBe(true);
  });
});
