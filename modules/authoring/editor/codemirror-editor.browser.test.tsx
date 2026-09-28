import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { useRef } from "react";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { CodeMirrorEditor } from "./codemirror-editor";

// The real editor handling a real keystroke (ADR 0032): CodeMirror needs a
// live DOM to measure and to route keys, so jsdom can't run it. Mod-b wraps
// the selection in ** through our toggleInline command — proven here end to
// end, key event to document.

function Harness({ initialDoc = "gras" }: { initialDoc?: string }) {
  const viewRef = useRef<EditorView | null>(null);
  return <CodeMirrorEditor initialDoc={initialDoc} viewRef={viewRef} />;
}

function editorLines(): string[] {
  return [...document.querySelectorAll<HTMLElement>(".cm-line")].map(
    (line) => line.textContent ?? ""
  );
}

describe("CodeMirrorEditor (browser)", () => {
  it("wraps the selection in ** on Mod-b", async () => {
    await render(<Harness />);
    const content = document.querySelector<HTMLElement>(".cm-content")!;

    await userEvent.click(content);
    await userEvent.keyboard("{Control>}a{/Control}"); // select all
    await userEvent.keyboard("{Control>}b{/Control}"); // toggle bold

    await expect
      .poll(() => document.querySelector(".cm-content")?.textContent)
      .toBe("**gras**");
  });

  it("starts wrapper content at column zero on Enter", async () => {
    await render(<Harness initialDoc={'<Collapsible title="Bloc">'} />);
    const content = document.querySelector<HTMLElement>(".cm-content")!;

    await userEvent.click(content);
    await userEvent.keyboard("{Control>}{End}{/Control}{Enter}");

    await expect
      .poll(editorLines)
      .toEqual(['<Collapsible title="Bloc">', ""]);
  });

  it("still continues Markdown lists on Enter", async () => {
    await render(<Harness initialDoc="- Élément" />);
    const content = document.querySelector<HTMLElement>(".cm-content")!;

    await userEvent.click(content);
    await userEvent.keyboard("{Control>}{End}{/Control}{Enter}");

    await expect
      .poll(editorLines)
      .toEqual(["- Élément", "- "]);
  });
});
