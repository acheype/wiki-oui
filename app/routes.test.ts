import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { reservedSlugRefusal } from "@/lib/slug";

// Every system page of WikiOui is a wiki page (ADR 0028). A new system page
// is a special page whose content calls a built-in component — never a
// folder here: a route would shadow a slug nobody reserved, and it would
// take segments (`/invitation/{jeton}`) where a page only knows handlers.
//
// The single exception is `api`, the one reserved segment (ADR 0012), which
// shelters the two services that cannot be pages: the ComponentBuilder
// preview, and the installation service — reached by rewrite, so that even
// `installation` stays an ordinary slug.
const ROUTE_FOLDERS = ["(bare)", "(site)", "api"];

describe("app/", () => {
  it("holds no route beyond the wiki pages and the reserved segment", async () => {
    const entries = await readdir(path.join(import.meta.dirname), {
      withFileTypes: true,
    });
    const folders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(
      folders,
      "One more system page is a wiki page (ADR 0028), not a route: add a special " +
        "page to wiki.config.ts and a built-in component to the wiki-components/ " +
        "of the module its concept belongs to (ADR 0029)."
    ).toEqual(ROUTE_FOLDERS);
  });
});

describe("the reserved segment", () => {
  it("is `api`, and it is the only slug a page may not take", () => {
    expect(reservedSlugRefusal("api")).not.toBeNull();
    // What the rewrite buys: the installation service answers everywhere while
    // the wiki is not installed, and gives this slug back once it is.
    expect(reservedSlugRefusal("installation")).toBeNull();
    // The account system pages are pages: taken by an existing page, not reserved.
    expect(reservedSlugRefusal("connexion")).toBeNull();
  });
});
