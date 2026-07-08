"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useRef, type RefObject } from "react";
import { toggleInline } from "./commands";

const editorTheme = EditorView.theme({
  "&": { fontSize: "0.875rem", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    padding: "1rem",
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
}: {
  initialDoc: string;
  /** Filled on mount; the toolbar drives the view through it. */
  viewRef: RefObject<EditorView | null>;
  onUpdate?: (view: EditorView) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onUpdateRef = useRef(onUpdate);

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
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          editorTheme,
          placeholder("Contenu de la page en MDX…"),
          keymap.of([
            {
              key: "Mod-b",
              run: (v) => (toggleInline(v, "**"), true),
            },
            {
              key: "Mod-i",
              run: (v) => (toggleInline(v, "*"), true),
            },
            ...markdownKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet) {
              onUpdateRef.current?.(update.view);
            }
          }),
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
    <div
      ref={containerRef}
      className="rounded-md border bg-background transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
    />
  );
}
