"use client";

import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  insertNewline,
} from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  defaultHighlightStyle,
  HighlightStyle,
  syntaxTree,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useId, useRef, type RefObject } from "react";
import { toggleInline } from "./commands";

function cursorIsInsideElement(state: EditorState, position: number): boolean {
  for (
    let node: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null =
      syntaxTree(state).resolveInner(position, -1);
    node;
    node = node.parent
  ) {
    if (node.name === "Element") return true;
  }
  return false;
}

function insertUnindentedElementLine(view: EditorView): boolean {
  if (
    !view.state.selection.ranges.every(
      (range) =>
        range.empty && cursorIsInsideElement(view.state, range.head)
    )
  ) {
    return false;
  }
  return insertNewline(view);
}

const editorHighlightStyle = HighlightStyle.define([
  ...defaultHighlightStyle.specs,
  { tag: tags.url, color: "var(--secondary)" },
  { tag: tags.tagName, color: "#219" },
]);

const editorTheme = EditorView.theme({
  "&": { fontSize: "0.875rem", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    // The left padding hosts the cursor-anchored row strip (ADR 0005) — a
    // 28px column of buttons — and is cut short of it on purpose: the strip
    // overhangs the editor's left border by a few pixels rather than push the
    // text a whole gutter to the right.
    padding: "1rem 1rem 1rem 1.6rem",
    minHeight: "24rem",
    lineHeight: "1.7",
    caretColor: "var(--foreground)",
  },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklch, var(--primary) 18%, transparent)",
  },
});

export function CodeMirrorEditor({
  initialDoc,
  viewRef,
  onUpdate,
  extensions = [],
}: {
  initialDoc: string;
  /** Filled on mount; the toolbar drives the view through it. */
  viewRef: RefObject<EditorView | null>;
  onUpdate?: (view: EditorView) => void;
  /** Extra extensions; must be stable, the view is created once on mount. */
  extensions?: Extension[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onUpdateRef = useRef(onUpdate);
  const keyboardHelpId = useId();

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          history(),
          markdown({ codeLanguages: languages }),
          syntaxHighlighting(editorHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          editorTheme,
          placeholder("Contenu de la page en MDX…"),
          EditorView.contentAttributes.of({
            "aria-describedby": keyboardHelpId,
          }),
          keymap.of([
            {
              key: "Mod-b",
              run: (v) => (toggleInline(v, "**"), true),
            },
            {
              key: "Mod-i",
              run: (v) => (toggleInline(v, "*"), true),
            },
            {
              key: "Enter",
              // Markdown's higher-priority binding has already continued any
              // list; this fallback only removes HTML/JSX element indentation.
              run: insertUnindentedElementLine,
              shift: insertUnindentedElementLine,
            },
            // Tab always edits indentation inside the source area. CodeMirror's
            // Escape-then-Tab exit remains the keyboard path to the next control.
            indentWithTab,
            ...markdownKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet) {
              onUpdateRef.current?.(update.view);
            }
          }),
          ...extensions,
        ],
      }),
      parent: containerRef.current!,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view owns the document after mount; never re-create it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="group/editor">
      <div
        ref={containerRef}
        className="rounded-md border bg-background transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
      />
      <p
        id={keyboardHelpId}
        className="mt-1 min-h-4 text-xs text-muted-foreground opacity-0 transition-opacity group-focus-within/editor:opacity-100"
      >
        Tab et Maj+Tab changent l’indentation. Échap puis Tab permet de passer
        au contrôle suivant.
      </p>
    </div>
  );
}
