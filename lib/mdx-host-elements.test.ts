import { describe, expect, it } from "vitest";
import { renderMdx } from "./mdx";
import { renderToStaticMarkup } from "react-dom/server";

// The tag allowlist (ADR 0002). Every refusal below was seen running in a real
// browser against /api/render before the list existed — <script src> loaded and
// executed third-party JS, <iframe srcdoc> scripted the wiki's own origin.

async function render(source: string): Promise<string> {
  return renderToStaticMarkup((await renderMdx(source)) as React.ReactElement);
}

describe("tags that reach the reader", () => {
  it("keeps the tags that mark up prose", async () => {
    const html = await render(
      `<div class="x"><p>Un <strong>mot</strong> et <sup>une note</sup>.</p></div>`
    );
    expect(html).toContain("<div");
    expect(html).toContain("<strong>mot</strong>");
    expect(html).toContain("<sup>une note</sup>");
  });

  it("keeps details/summary, an author's disclosure widget", async () => {
    const html = await render(`<details><summary>Plus</summary>Caché</details>`);
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>Plus</summary>");
  });

  // The rule gates JSX the author types. Markdown builds its HTML from mdast
  // nodes that never take the JSX path, so none of it can be caught by it.
  it("never touches markdown's own output", async () => {
    const html = await render(
      "# Titre\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [ ] à faire\n"
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
    expect(html).toContain('type="checkbox"');
  });

  it("leaves a component's children alone", async () => {
    const html = await render("<Menu>\n- [A](a)\n- [B](b)\n</Menu>");
    expect(html).toContain("A");
    expect(html).toContain("B");
  });
});

describe("tags that must never reach the reader", () => {
  const REFUSED: [string, string][] = [
    ["script src, which executed third-party JS", `<script src="https://evil.tld/x.js"></script>`],
    ["script inline", `<script>alert(1)</script>`],
    ["object", `<object data="https://evil.tld/x.swf"></object>`],
    ["embed", `<embed src="https://evil.tld/x" />`],
    ["form, a phishing prompt", `<form action="https://evil.tld/steal"></form>`],
    ["style, which repaints the whole page", `<style>x</style>`],
    ["link, which loads a remote stylesheet", `<link rel="stylesheet" href="https://evil.tld/x.css" />`],
    ["a tag nobody thought about", `<marquee>x</marquee>`],
  ];

  it.each(REFUSED)("drops %s", async (_label, source) => {
    const html = await render(`Avant ${source} après`);
    expect(html).not.toContain("evil.tld");
    expect(html).not.toContain("alert(1)");
    // Dropped, never fatal: the page around it still renders.
    expect(html).toContain("Avant");
    expect(html).toContain("après");
  });

  it("drops the refused tag's children with it", async () => {
    // A <script> stripped of its body would still be a <script>.
    const html = await render(`<script>window.x = 1</script>`);
    expect(html).not.toContain("window.x");
  });
});

// Embedding another site is pasted, not typed: every provider hands out a
// ready-made <iframe>. The tag is in the list so that gesture survives; what
// carries its risk — srcdoc, which inherits our origin — is refused by name.
describe("a pasted embed snippet", () => {
  // Verbatim from YouTube's "Partager > Intégrer" button.
  const YOUTUBE = `<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;

  it("survives the paste whole", async () => {
    const html = await render(YOUTUBE);
    expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain('title="YouTube video player"');
    // Unknown to React but string-valued, so it writes them through as-is.
    expect(html).toContain('frameborder="0"');
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
  });

  it("keeps fullscreen working, which the JSX naming would have eaten", async () => {
    // A bare attribute is JSX's {true}, and React drops an unknown attribute
    // holding a boolean — `allowfullscreen` would vanish without its alias.
    // React emits the JSX spelling; HTML attributes are case-insensitive, so
    // the browser parses it back to `allowfullscreen` (checked there: the
    // attribute lands and iframe.allowFullscreen is true).
    expect(await render(YOUTUBE)).toMatch(/allowfullscreen/i);
  });

  it("embeds an OpenStreetMap snippet, style object and all", async () => {
    const html = await render(
      `<iframe width="425" height="350" src="https://www.openstreetmap.org/export/embed.html?bbox=166.4,-22.3,166.5,-22.2" style={{border: "1px solid black"}}></iframe>`
    );
    expect(html).toContain("openstreetmap.org");
    expect(html).toContain("border:1px solid black");
  });

  it("refuses srcdoc, the only half of the tag that could script us", async () => {
    // srcdoc content inherits the *embedding* document's origin — ours.
    for (const source of [
      `<iframe srcDoc="<script>alert(1)</script>" />`,
      `<iframe srcdoc="<script>alert(1)</script>" />`,
    ]) {
      const html = await render(source);
      expect(html).toContain("<iframe");
      expect(html).not.toContain("alert(1)");
      expect(html).not.toContain("srcdoc");
    }
  });

  it("leaves a component's own props alone when aliasing", async () => {
    // The alias is for host elements: renaming a component's prop would be us
    // breaking its contract.
    expect(await render(`<Image file="probe.png" allowfullscreen />`)).toContain(
      "/api/files/probe.png"
    );
  });
});

describe("Embed, for the author who has a URL rather than a snippet", () => {
  it("embeds an external page, sandboxed and titled", async () => {
    const html = await render(`<Embed url="https://example.com" title="Exemple" />`);
    expect(html).toContain('src="https://example.com"');
    expect(html).toContain('title="Exemple"');
    expect(html).toContain("sandbox=");
    // Without this token the embedded page could redirect the reader's tab.
    expect(html).not.toContain("allow-top-navigation");
  });

  it("falls back to the url as a title rather than shipping none", async () => {
    expect(await render(`<Embed url="https://example.com" />`)).toContain(
      'title="https://example.com"'
    );
  });

  it("refuses anything that is not an http(s) url", async () => {
    expect(await render(`<Embed url="javascript:alert(1)" />`)).not.toContain(
      "<iframe"
    );
    expect(
      await render(`<Embed url="data:text/html,<script>alert(1)</script>" />`)
    ).not.toContain("<iframe");
  });
});
