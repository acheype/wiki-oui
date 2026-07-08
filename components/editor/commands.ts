import { EditorSelection, type Line } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// Toolbar commands (ADR 0005). Everything manipulates the MDX source text:
// the editor has no rich model, so each command is a text transformation.

export function toggleInline(
  view: EditorView,
  marker: string,
  markerEnd = marker
) {
  view.dispatch(
    view.state.changeByRange((range) => {
      const { state } = view;
      const text = state.sliceDoc(range.from, range.to);
      const before = state.sliceDoc(
        Math.max(0, range.from - marker.length),
        range.from
      );
      const after = state.sliceDoc(range.to, range.to + markerEnd.length);

      if (before === marker && after === markerEnd) {
        return {
          changes: [
            { from: range.from - marker.length, to: range.from, insert: "" },
            { from: range.to, to: range.to + markerEnd.length, insert: "" },
          ],
          range: EditorSelection.range(
            range.from - marker.length,
            range.to - marker.length
          ),
        };
      }
      if (
        text.length >= marker.length + markerEnd.length &&
        text.startsWith(marker) &&
        text.endsWith(markerEnd)
      ) {
        return {
          changes: [
            { from: range.from, to: range.from + marker.length, insert: "" },
            { from: range.to - markerEnd.length, to: range.to, insert: "" },
          ],
          range: EditorSelection.range(
            range.from,
            range.to - marker.length - markerEnd.length
          ),
        };
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: markerEnd },
        ],
        range: EditorSelection.range(
          range.from + marker.length,
          range.to + marker.length
        ),
      };
    })
  );
  view.focus();
}

function selectedLines(view: EditorView): Line[] {
  const lines: Line[] = [];
  const seen = new Set<number>();
  for (const range of view.state.selection.ranges) {
    let pos = range.from;
    for (;;) {
      const line = view.state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        lines.push(line);
      }
      if (line.to >= range.to) break;
      pos = line.to + 1;
    }
  }
  return lines;
}

function replaceLines(view: EditorView, replace: (text: string, index: number) => string) {
  const changes = selectedLines(view)
    .map((line, index) => ({
      from: line.from,
      to: line.to,
      insert: replace(line.text, index),
    }))
    .filter((change) => view.state.sliceDoc(change.from, change.to) !== change.insert);
  if (changes.length > 0) {
    view.dispatch({ changes });
  }
  view.focus();
}

export function setHeading(view: EditorView, level: number) {
  replaceLines(view, (text) => {
    const stripped = text.replace(/^#{1,6}\s+/, "");
    const current = text.match(/^(#{1,6})\s/)?.[1].length;
    return current === level ? stripped : `${"#".repeat(level)} ${stripped}`;
  });
}

const LIST_PREFIX = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/;

export type ListKind = "bullet" | "ordered" | "task";

const LIST_MARKERS: Record<ListKind, (index: number) => string> = {
  bullet: () => "- ",
  ordered: (index) => `${index + 1}. `,
  task: () => "- [ ] ",
};

const LIST_DETECTORS: Record<ListKind, RegExp> = {
  bullet: /^\s*[-*+]\s+(?!\[[ xX]\]\s)/,
  ordered: /^\s*\d+[.)]\s+/,
  task: /^\s*[-*+]\s+\[[ xX]\]\s+/,
};

export function toggleList(view: EditorView, kind: ListKind) {
  const allAlready = selectedLines(view).every(
    (line) => line.text.trim() === "" || LIST_DETECTORS[kind].test(line.text)
  );
  replaceLines(view, (text, index) => {
    if (text.trim() === "") return text;
    const stripped = text.replace(LIST_PREFIX, "$1");
    return allAlready ? stripped : stripped.replace(/^(\s*)/, `$1${LIST_MARKERS[kind](index)}`);
  });
}

export function toggleQuote(view: EditorView) {
  const allAlready = selectedLines(view).every(
    (line) => line.text.trim() === "" || line.text.startsWith("> ")
  );
  replaceLines(view, (text) => {
    if (text.trim() === "") return text;
    return allAlready ? text.replace(/^> /, "") : `> ${text}`;
  });
}

// Inline code on a single-line selection, fenced block otherwise.
export function toggleCode(view: EditorView) {
  const range = view.state.selection.main;
  const text = view.state.sliceDoc(range.from, range.to);
  if (!text.includes("\n")) {
    toggleInline(view, "`");
    return;
  }
  view.dispatch(
    view.state.changeByRange((r) => ({
      changes: [
        { from: r.from, insert: "```\n" },
        { from: r.to, insert: "\n```" },
      ],
      range: EditorSelection.range(r.from + 4, r.to + 4),
    }))
  );
  view.focus();
}

export function insertHorizontalRule(view: EditorView) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const insert = line.text === "" ? "---" : "\n\n---";
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
  });
  view.focus();
}

export type Alignment = "left" | "center" | "right";

const ALIGNMENT_ANNOTATION = /\s*\{\{\s*className:\s*'text-(left|center|right)'\s*\}\}\s*$/;

// Alignment is a Tailwind class carried by an mdx-annotations block
// annotation appended to the paragraph (ADR 0005).
export function setAlignment(view: EditorView, alignment: Alignment) {
  replaceLines(view, (text) => {
    if (text.trim() === "") return text;
    const current = text.match(ALIGNMENT_ANNOTATION)?.[1];
    const stripped = text.replace(ALIGNMENT_ANNOTATION, "");
    if (current === alignment) return stripped;
    return `${stripped} {{ className: 'text-${alignment}' }}`;
  });
}

export function toggleComment(view: EditorView) {
  toggleInline(view, "{/* ", " */}");
}

export type LinkTarget = "self" | "_blank" | "modal";

export function insertLink(
  view: EditorView,
  link: { text: string; href: string; target: LinkTarget }
) {
  const annotation =
    link.target === "self" ? "" : `{{ target: '${link.target}' }}`;
  const markdown = `[${link.text}](${link.href})${annotation}`;
  view.dispatch(
    view.state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: markdown },
      range: EditorSelection.cursor(range.from + markdown.length),
    }))
  );
  view.focus();
}

const TABLE_SKELETON = [
  "| Titre | Titre |",
  "| --- | --- |",
  "|  |  |",
].join("\n");

export function insertTable(view: EditorView) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const prefix = line.text === "" ? "" : "\n\n";
  view.dispatch({
    changes: { from: line.to, insert: prefix + TABLE_SKELETON },
    selection: { anchor: line.to + prefix.length + 2 },
  });
  view.focus();
}

export function isInTable(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  return line.text.trimStart().startsWith("|");
}

function tableLineRange(view: EditorView): { first: number; last: number } | null {
  if (!isInTable(view)) return null;
  const { doc } = view.state;
  const current = doc.lineAt(view.state.selection.main.head).number;
  let first = current;
  let last = current;
  while (first > 1 && doc.line(first - 1).text.trimStart().startsWith("|")) first--;
  while (last < doc.lines && doc.line(last + 1).text.trimStart().startsWith("|")) last++;
  return { first, last };
}

function columnCount(rowText: string): number {
  return Math.max(1, rowText.split("|").length - 2);
}

export function addTableRow(view: EditorView) {
  const table = tableLineRange(view);
  if (!table) return;
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const cells = columnCount(view.state.doc.line(table.first).text);
  const row = `|${"  |".repeat(cells)}`;
  view.dispatch({
    changes: { from: line.to, insert: `\n${row}` },
    selection: { anchor: line.to + 3 },
  });
  view.focus();
}

export function addTableColumn(view: EditorView) {
  const table = tableLineRange(view);
  if (!table) return;
  const changes = [];
  for (let n = table.first; n <= table.last; n++) {
    const line = view.state.doc.line(n);
    const isSeparator = /^\s*\|[\s|:-]+\|?\s*$/.test(line.text) && n === table.first + 1;
    const cell = isSeparator ? " --- |" : "  |";
    changes.push({ from: line.to, insert: line.text.trimEnd().endsWith("|") ? cell : ` |${cell}` });
  }
  view.dispatch({ changes });
  view.focus();
}

export function deleteTableRow(view: EditorView) {
  const table = tableLineRange(view);
  if (!table) return;
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const from = line.from === 0 ? 0 : line.from - 1;
  view.dispatch({ changes: { from, to: line.to, insert: "" } });
  view.focus();
}
