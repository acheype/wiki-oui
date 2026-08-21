import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Menu } from "./wiki-components/menu";

// Menu's own pruning of a bullet a hideIfNoAccess link emptied out
// (docs/permissions.md § Liens et boutons vers l'inaccessible, issue #13),
// fed exactly the shape Menu actually receives once a hidden link/button has
// already resolved to nothing: real Next.js resolves a Server Component
// (wiki-link.tsx, button.tsx) before a Client Component like <Menu> ever
// sees its output (menu.tsx's own note on the RSC boundary), so the "hole" a
// hidden item leaves is built by hand here rather than through renderMdx —
// see mdx-menu.test.tsx for the plumbing that produces it for real.
//
// Kept out of wiki-components/ on purpose: mdx.tsx's registry loader treats
// every .tsx file there (including a *.test.tsx) as a component to serve, so
// a test file sitting in that folder would itself become an unresolvable tag.

// A component-typed link, not a bare `<a>`: isWikiLinkElement (menu.tsx)
// only recognizes a component element by shape, the same way WikiLink's own
// output does for every target but `target="_blank"`.
function link(href: string, text: string) {
  return <FakeLink href={href}>{text}</FakeLink>;
}
function FakeLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href}>{children}</a>;
}

describe("Menu ignores a bullet a hideIfNoAccess link emptied out", () => {
  it("drops a leaf item whose link resolved to nothing", () => {
    const html = renderToStaticMarkup(
      <Menu>
        <ul>
          <li>{link("/public", "Public")}</li>
          <li>{null}</li>
        </ul>
      </Menu>
    );
    expect(html).toContain("Public");
    expect(html.match(/<a /g)?.length).toBe(1);
  });

  it("drops a parent whose every child resolved to nothing, recursively", () => {
    const html = renderToStaticMarkup(
      <Menu>
        <ul>
          <li>
            Section
            <ul>
              <li>{null}</li>
            </ul>
          </li>
          <li>{link("/autre", "Autre")}</li>
        </ul>
      </Menu>
    );
    expect(html).not.toContain("Section");
    expect(html).toContain("Autre");
  });

  it("keeps a parent that still has a surviving child", () => {
    const html = renderToStaticMarkup(
      <Menu>
        <ul>
          <li>
            Section
            <ul>
              <li>{link("/public", "Public")}</li>
              <li>{null}</li>
            </ul>
          </li>
        </ul>
      </Menu>
    );
    expect(html).toContain("Section");
  });

  it("keeps a plain-text leaf that never had a sublist", () => {
    const html = renderToStaticMarkup(
      <Menu>
        <ul>
          <li>Titre</li>
        </ul>
      </Menu>
    );
    expect(html).toContain("Titre");
  });
});
