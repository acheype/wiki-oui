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
    ["iframe srcdoc, which scripted our own origin", `<iframe srcDoc="<b>x</b>" />`],
    ["iframe", `<iframe src="https://evil.tld/phish" />`],
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

describe("Embed carries the use case iframe used to serve", () => {
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
