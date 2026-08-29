import { describe, expect, it } from "vitest";
import {
  INVITATION_LIFETIME_DAYS,
  expiresIn,
  invitationSummaryLines,
  parseAddressList,
} from "./rules";

describe("parseAddressList", () => {
  it("reads what a mail client puts on the clipboard, separators mixed", () => {
    const pasted = `marie@asso.fr, jean@asso.fr; paul@asso.fr
      sophie@asso.fr`;
    expect(parseAddressList(pasted).emails).toEqual([
      "marie@asso.fr",
      "jean@asso.fr",
      "paul@asso.fr",
      "sophie@asso.fr",
    ]);
  });

  it("keeps the address out of the « Nom <adresse> » form", () => {
    const pasted = "Marie Durand <marie@asso.fr>, Jean Martin <jean@asso.fr>";
    expect(parseAddressList(pasted).emails).toEqual([
      "marie@asso.fr",
      "jean@asso.fr",
    ]);
  });

  it("takes several addresses separated by spaces alone", () => {
    expect(parseAddressList("marie@asso.fr jean@asso.fr").emails).toEqual([
      "marie@asso.fr",
      "jean@asso.fr",
    ]);
  });

  it("merges duplicates, whatever their case, keeping the first place", () => {
    const parsed = parseAddressList("Marie@Asso.fr, jean@asso.fr, MARIE@asso.fr");
    expect(parsed.emails).toEqual(["marie@asso.fr", "jean@asso.fr"]);
  });

  it("reports what names no address, as it was typed", () => {
    const parsed = parseAddressList("marie@asso.fr, Jean Martin, pas-une-adresse");
    expect(parsed.emails).toEqual(["marie@asso.fr"]);
    expect(parsed.invalid).toEqual(["Jean Martin", "pas-une-adresse"]);
  });

  it("ignores empty fragments, trailing separators included", () => {
    expect(parseAddressList("marie@asso.fr,,\n ; ")).toEqual({
      emails: ["marie@asso.fr"],
      invalid: [],
    });
  });

  it("finds nothing in an empty paste", () => {
    expect(parseAddressList("   \n ")).toEqual({ emails: [], invalid: [] });
  });
});

describe("expiresIn", () => {
  it("gives an invitation the fortnight the system page announces", () => {
    const created = new Date("2026-07-28T10:00:00Z");
    expect(expiresIn(created, INVITATION_LIFETIME_DAYS)).toEqual(
      new Date("2026-08-11T10:00:00Z")
    );
  });
});

describe("invitationSummaryLines", () => {
  it("counts what was created, and says the rest was left alone", () => {
    expect(
      invitationSummaryLines({
        invited: ["marie@asso.fr", "jean@asso.fr"],
        alreadyMember: ["paul@asso.fr"],
        alreadyInvited: ["sophie@asso.fr"],
        invalid: ["Jean Martin"],
      })
    ).toEqual([
      "2 invitations créées.",
      "1 adresse a déjà un compte : paul@asso.fr",
      "1 invitation était déjà en attente : sophie@asso.fr",
      "1 fragment n'est pas une adresse : Jean Martin",
    ]);
  });

  it("says only what happened", () => {
    expect(
      invitationSummaryLines({
        invited: ["marie@asso.fr"],
        alreadyMember: [],
        alreadyInvited: [],
        invalid: [],
      })
    ).toEqual(["1 invitation créée."]);
  });

  it("says so when every address was already known", () => {
    expect(
      invitationSummaryLines({
        invited: [],
        alreadyMember: ["paul@asso.fr", "marie@asso.fr"],
        alreadyInvited: [],
        invalid: [],
      })
    ).toEqual([
      "Aucune invitation créée.",
      "2 adresses ont déjà un compte : paul@asso.fr, marie@asso.fr",
    ]);
  });
});
