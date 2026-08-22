import { describe, expect, it } from "vitest";
import { destinationWithinWiki } from "./destination";

const HOME = "/page-principale";

// The « Se connecter » button carries where it was pressed, so the address is
// written by whoever clicked it — including someone who typed it themselves.
describe("destinationWithinWiki", () => {
  it("comes back to the page the visitor was reading", () => {
    expect(destinationWithinWiki("/compte-rendu-ag-2026", HOME)).toBe(
      "/compte-rendu-ag-2026"
    );
  });

  it("keeps a handler segment and a query", () => {
    expect(destinationWithinWiki("/ma-page/edit?onglet=1", HOME)).toBe(
      "/ma-page/edit?onglet=1"
    );
  });

  it("refuses another site, which would make sign-in an open redirect", () => {
    expect(destinationWithinWiki("https://exemple.test/piege", HOME)).toBe(HOME);
    // Protocol-relative: a browser reads //exemple.test as another host.
    expect(destinationWithinWiki("//exemple.test/piege", HOME)).toBe(HOME);
    expect(destinationWithinWiki("javascript:alert(1)", HOME)).toBe(HOME);
  });

  it("falls back home when nothing was carried", () => {
    expect(destinationWithinWiki(undefined, HOME)).toBe(HOME);
    expect(destinationWithinWiki("", HOME)).toBe(HOME);
  });
});
