import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderMdx } from "@/modules/authoring/mdx";

// <Tabs>/<Tab> rendering (ADR 0031): the wrapper reads its <Tab> children by
// shape (their `title`), derives a slug per tab, and honours `default`. This
// harness is plain react-dom/server (no RSC boundary, no effects), so it sees
// the tab open on load — exactly what `default` and the first-tab fallback
// decide. The hash listener and folder CSS are out of its reach.

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

const twoTabs = (attrs = "") =>
  `<Tabs${attrs}>\n  <Tab title="Premier">AAA</Tab>\n  <Tab title="Second">BBB</Tab>\n</Tabs>\n`;

describe("<Tabs> rendering", () => {
  it("shows every trigger and opens the first tab by default", async () => {
    const html = await render(twoTabs());
    expect(html).toContain("Premier");
    expect(html).toContain("Second");
    // The open tab's panel is rendered; the inactive one is not (Base UI).
    expect(html).toContain("AAA");
    expect(html).not.toContain("BBB");
  });

  it("opens the tab named by `default`", async () => {
    const html = await render(twoTabs(' default="second"'));
    expect(html).toContain("BBB");
    expect(html).not.toContain("AAA");
  });

  it("maps display to the primitive variant", async () => {
    expect(await render(twoTabs(' display="underline"'))).toContain(
      'data-variant="line"'
    );
    expect(await render(twoTabs(' display="folder"'))).toContain(
      'data-variant="folder"'
    );
    expect(await render(twoTabs(' display="separated"'))).toContain(
      'data-variant="separated"'
    );
  });

  it("gives the open panel the id of its slug", async () => {
    expect(await render(twoTabs())).toContain('id="premier"');
  });

  it("drops a duplicate slug, first wins", async () => {
    const html = await render(
      `<Tabs>\n  <Tab title="Même">gagne</Tab>\n  <Tab title="Même">perd</Tab>\n</Tabs>\n`
    );
    expect(html).toContain("gagne");
    expect(html).not.toContain("perd");
  });

  it("renders nothing without a tab", async () => {
    expect(await render("<Tabs></Tabs>\n")).not.toContain("data-slot=\"tabs\"");
  });
});
