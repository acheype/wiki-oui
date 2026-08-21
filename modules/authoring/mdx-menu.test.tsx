import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { renderMdx } from "./mdx";

// The wiring behind a hideIfNoAccess link vanishing from a page's actual MDX
// (docs/permissions.md § Liens et boutons vers l'inaccessible, issue #13):
// WikiLink (wiki-components/wiki-link.tsx) resolves the annotation via
// modules/pages/content.ts's hiddenIfNoAccess, and renders nothing when it
// refuses. Menu's own pruning of the *bullet* left behind — including the
// recursive "empty parent" case — has its own, more precise test in
// menu-pruning.test.tsx (see that file for why it isn't tested here too:
// this harness's plain react-dom/server has no RSC boundary, so it cannot
// tell Menu's pruning apart from the link simply rendering null wherever it
// landed).
//
// hiddenIfNoAccess itself is stubbed rather than isSlugReadable underneath
// it: what this file is testing is the wiring from annotation to vanished
// bullet, not the slug/external resolution hiddenIfNoAccess already has its
// own unit test for (modules/pages/content.test.ts).

const { readable } = vi.hoisted(() => ({ readable: new Set<string>() }));

vi.mock("@/modules/pages/content", () => ({
  hiddenIfNoAccess: vi.fn(
    async (link: string, hideIfNoAccess: boolean) =>
      hideIfNoAccess && !readable.has(link)
  ),
}));

async function render(source: string): Promise<string> {
  const element = (await renderMdx(source)) as React.ReactElement;
  return new Promise((resolve, reject) => {
    let html = "";
    const collector = new PassThrough();
    collector.on("data", (chunk: Buffer) => {
      html += chunk.toString();
    });
    collector.on("end", () => resolve(html));
    collector.on("error", reject);
    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(collector);
      },
      onError: reject,
    });
  });
}

describe("a hideIfNoAccess link inside <Menu>", () => {
  it("keeps a link whose target is readable", async () => {
    readable.clear();
    readable.add("public");
    const html = await render(
      "<Menu>\n- [Public](public){{ hideIfNoAccess: true }}\n</Menu>"
    );
    expect(html).toContain("Public");
  });

  it("vanishes when its target refuses", async () => {
    readable.clear();
    readable.add("public");
    const html = await render(
      "<Menu>\n- [Public](public)\n- [Privé](prive){{ hideIfNoAccess: true }}\n</Menu>"
    );
    expect(html).toContain("Public");
    expect(html).not.toContain("Privé");
  });
});
