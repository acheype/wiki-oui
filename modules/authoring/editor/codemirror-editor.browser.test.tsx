import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { useRef } from "react";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { CodeMirrorEditor } from "./codemirror-editor";
import { toggleList, type ListKind } from "./commands";
import { EditorToolbar } from "./toolbar";

vi.mock("@/modules/pages/page-modal", () => ({
  InlinePageBody: () => null,
  usePageBody: () => null,
}));

// The real editor handling a real keystroke (ADR 0032): CodeMirror needs a
// live DOM to measure and to route keys, so jsdom can't run it. Mod-b wraps
// the selection in ** through our toggleInline command — proven here end to
// end, key event to document.

function Harness({ initialDoc = "gras" }: { initialDoc?: string }) {
  const viewRef = useRef<EditorView | null>(null);
  return <CodeMirrorEditor initialDoc={initialDoc} viewRef={viewRef} />;
}

function ListHarness({ initialDoc }: { initialDoc: string }) {
  const viewRef = useRef<EditorView | null>(null);
  const buttons: [string, ListKind][] = [
    ["Liste à puces", "bullet"],
    ["Liste numérotée", "ordered"],
    ["Liste de tâches", "task"],
  ];
  return (
    <>
      {buttons.map(([label, kind]) => (
        <button
          key={kind}
          type="button"
          aria-label={label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => viewRef.current && toggleList(viewRef.current, kind)}
        />
      ))}
      <CodeMirrorEditor initialDoc={initialDoc} viewRef={viewRef} />
      <button type="button" data-after-editor>
        Après l’éditeur
      </button>
    </>
  );
}

let toolbarEditorView: EditorView | null = null;

function ToolbarHarness({ initialDoc }: { initialDoc: string }) {
  const viewRef = useRef<EditorView | null>(null);
  return (
    <>
      <EditorToolbar
        viewRef={viewRef}
        onRequestLink={() => {}}
        builders={[]}
        onRequestComponent={() => {}}
        onRequestUpload={() => {}}
      />
      <CodeMirrorEditor
        initialDoc={initialDoc}
        viewRef={viewRef}
        onUpdate={(view) => {
          toolbarEditorView = view;
        }}
      />
    </>
  );
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

  it.each([
    ["Liste à puces", "  - Texte"],
    ["Liste numérotée", "  1. Texte"],
    ["Liste de tâches", "  - [ ] Texte"],
  ])("turns the current line into %s before its first letter", async (label, expected) => {
    toolbarEditorView = null;
    await render(<ToolbarHarness initialDoc="  Texte" />);
    const content = document.querySelector<HTMLElement>(".cm-content")!;

    await userEvent.click(content);
    await userEvent.keyboard("{Control>}{Home}{/Control}{ArrowRight}{ArrowRight}");
    await userEvent.click(
      document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
    );

    await expect.poll(editorLines).toEqual([expected]);
    await expect
      .poll(() => toolbarEditorView?.state.selection.main.head)
      .toBe(expected.indexOf("Texte"));
  });

  it("turns a line into a list from its absolute start", async () => {
    toolbarEditorView = null;
    await render(<ToolbarHarness initialDoc="Texte" />);
    const content = document.querySelector<HTMLElement>(".cm-content")!;

    await userEvent.click(content);
    await userEvent.keyboard("{Control>}{Home}{/Control}");
    await userEvent.click(
      document.querySelector<HTMLButtonElement>(
        'button[aria-label="Liste à puces"]'
      )!
    );

    await expect.poll(editorLines).toEqual(["- Texte"]);
    await expect
      .poll(() => toolbarEditorView?.state.selection.main.head)
      .toBe(2);
  });

  it.each([
    ["Liste à puces", "", "- "],
    ["Liste numérotée", "  ", "  1. "],
    ["Liste de tâches", "\t", "\t- [ ] "],
  ])(
    "starts %s on a line containing only its initial indentation",
    async (label, source, expected) => {
      toolbarEditorView = null;
      await render(<ToolbarHarness initialDoc={source} />);
      const content = document.querySelector<HTMLElement>(".cm-content")!;

      await userEvent.click(content);
      await userEvent.keyboard("{Control>}{End}{/Control}");
      await userEvent.click(
        document.querySelector<HTMLButtonElement>(
          `button[aria-label="${label}"]`
        )!
      );

      await expect
        .poll(() => toolbarEditorView?.state.doc.toString())
        .toBe(expected);
      await expect
        .poll(() => toolbarEditorView?.state.selection.main.head)
        .toBe(expected.length);
    }
  );

  it.each([
    ["- Parent\n- Enfant", ["- Parent", "  - Enfant"]],
    ["1. Parent\n2. Enfant", ["1. Parent", "  2. Enfant"]],
    ["- [ ] Parent\n- [ ] Enfant", ["- [ ] Parent", "  - [ ] Enfant"]],
  ])("indents and outdents list items with Tab: %s", async (source, indented) => {
    await render(<ListHarness initialDoc={source} />);
    const content = document.querySelector<HTMLElement>(".cm-content")!;

    await userEvent.click(content);
    await userEvent.keyboard("{Control>}{End}{/Control}{Tab}");
    await expect.poll(editorLines).toEqual(indented);

    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    await expect.poll(editorLines).toEqual(source.split("\n"));
  });

  it("describes how to leave the editor when Tab controls indentation", async () => {
    await render(<ListHarness initialDoc="Texte" />);
    const content = document.querySelector<HTMLElement>(".cm-content")!;
    const description = document.getElementById(
      content.getAttribute("aria-describedby")!
    );

    expect(description?.textContent).toContain("Échap puis Tab");
  });

  it("uses Tab for indentation outside lists too", async () => {
    await render(<ListHarness initialDoc="Texte" />);
    const content = document.querySelector<HTMLElement>(".cm-content")!;

    await userEvent.click(content);
    await userEvent.keyboard("{Control>}{End}{/Control}{Tab}");

    await expect.poll(editorLines).toEqual(["  Texte"]);
    expect(document.activeElement).toBe(content);
  });

  it("leaves the editor with Escape then Tab", async () => {
    await render(<ListHarness initialDoc="Texte" />);
    const content = document.querySelector<HTMLElement>(".cm-content")!;
    const after = document.querySelector<HTMLButtonElement>("[data-after-editor]")!;

    await userEvent.click(content);
    await userEvent.keyboard("{Control>}{End}{/Control}{Escape}{Tab}");

    await expect.poll(() => document.activeElement).toBe(after);
  });
});
