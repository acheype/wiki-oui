import { describe, expect, it } from "vitest";
import { deriveUsername, isValidUsername } from "./username";

// docs/permissions.md § Identité: the username is the project's slug pattern,
// derived from the display name — the same fixed-identity move as a form slug
// from its name (ADR 0014).
describe("deriveUsername", () => {
  it("derives the installer's identifier from its imposed display name", () => {
    expect(deriveUsername("Wiki Admin")).toBe("wiki-admin");
  });

  it("does not split CamelCase", () => {
    expect(deriveUsername("WikiAdmin")).toBe("wikiadmin");
  });

  it("transliterates accents", () => {
    expect(deriveUsername("Amélie Rousséau")).toBe("amelie-rousseau");
  });

  it("collapses punctuation into single dashes", () => {
    expect(deriveUsername("Jean-Luc  O'Connor")).toBe("jean-luc-o-connor");
  });

  it("returns an empty string when nothing survives, for the caller to ask", () => {
    expect(deriveUsername("한글")).toBe("");
  });
});

describe("isValidUsername", () => {
  it("accepts the slug pattern", () => {
    expect(isValidUsername("marie-durand")).toBe(true);
    expect(isValidUsername("wiki-admin-2")).toBe(true);
  });

  it("rejects what the URL of a page could not be", () => {
    expect(isValidUsername("Marie")).toBe(false);
    expect(isValidUsername("marie durand")).toBe(false);
    expect(isValidUsername("marie_durand")).toBe(false);
    expect(isValidUsername("-marie")).toBe(false);
    expect(isValidUsername("marie-")).toBe(false);
    expect(isValidUsername("marie--durand")).toBe(false);
    expect(isValidUsername("")).toBe(false);
  });

  it("rejects an email, so that the single sign-in field stays unambiguous", () => {
    expect(isValidUsername("marie@asso.fr")).toBe(false);
  });
});
