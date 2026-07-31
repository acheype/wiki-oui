import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every screen of WikiOui is a wiki page (ADR 0028). A new screen is a
// special page whose content calls a built-in component — never a folder
// here: a route would shadow a slug nobody reserved, and it would take
// segments (`/invitation/{jeton}`) where a page only knows handlers.
//
// Two exceptions, and this list is the whole of them: `api` groups the API
// services (ADR 0012), `installation` is the first-visit screen the proxy
// imposes before any page can be read (ADR 0027). Both are refused as page
// slugs by lib/slug.ts, which is what keeps the shadowing impossible.
const ROUTE_FOLDERS = ["(bare)", "(site)", "api", "installation"];

describe("app/", () => {
  it("holds no route beyond the wiki pages and the two exceptions", async () => {
    const entries = await readdir(path.join(import.meta.dirname), {
      withFileTypes: true,
    });
    const folders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(
      folders,
      "Un écran de plus est une page WikiOui (ADR 0028), pas une route : " +
        "ajoutez une page spéciale dans wiki.config.ts et un composant " +
        "intégré dans components/wiki/."
    ).toEqual(ROUTE_FOLDERS);
  });
});
