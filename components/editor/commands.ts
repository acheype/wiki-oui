import { EditorSelection, type EditorState, type Line } from "@codemirror/state";
// A value import: scrollIntoView is a static method, not only a type.
import { EditorView } from "@codemirror/view";
import type { Range } from "@/lib/component-descriptor";

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

// Reveals a 1-based line: the save-time warnings link to the line they are
// about. The line is *selected*, not merely reached — a bare cursor landing
// somewhere off-screen shows the author nothing. A line past the end (the
// source shrank since the warning was computed) clamps rather than throws.
export function goToLine(view: EditorView, line: number) {
  const target = view.state.doc.line(
    Math.min(Math.max(line, 1), view.state.doc.lines)
  );
  view.dispatch({
    selection: EditorSelection.range(target.from, target.to),
    effects: EditorView.scrollIntoView(target.from, { y: "center" }),
  });
  view.focus();
}

// Inserts a ComponentBuilder-generated snippet at the cursor, replacing the
// selection if any (insertion from the « Composants » menu).
export function insertSnippet(view: EditorView, snippet: string) {
  view.dispatch(
    view.state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: snippet },
      range: EditorSelection.cursor(range.from + snippet.length),
    }))
  );
  view.focus();
}

// Rewrites an existing component tag in place (cursor-anchored pencil).
export function replaceSnippet(
  view: EditorView,
  range: Range,
  snippet: string
) {
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: snippet },
    selection: EditorSelection.cursor(range.from + snippet.length),
  });
  view.focus();
}

/* ---------------------------------------------------------------- *
 * GFM tables. Cursor-anchored tools (ADR 0005): the strips rendered
 * by cursor-tools.tsx call the commands below. All of them operate
 * on the table around the main selection head.
 * ---------------------------------------------------------------- */

const TABLE_LINE = /^\s*\|/;
const SEPARATOR_LINE = /^\s*\|?(\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?\s*$/;

function isSeparator(text: string): boolean {
  return TABLE_LINE.test(text) && SEPARATOR_LINE.test(text);
}

function splitRow(text: string): string[] {
  let inner = text.trim();
  if (inner.startsWith("|")) inner = inner.slice(1);
  if (inner.endsWith("|")) inner = inner.slice(0, -1);
  return inner.split("|").map((cell) => cell.trim());
}

function buildRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function alignmentOf(separatorCell: string): Alignment {
  if (separatorCell.startsWith(":") && separatorCell.endsWith(":")) return "center";
  if (separatorCell.endsWith(":")) return "right";
  return "left";
}

function separatorCell(alignment: Alignment, width = 3): string {
  if (alignment === "center") return `:${"-".repeat(Math.max(1, width - 2))}:`;
  if (alignment === "right") return `${"-".repeat(Math.max(2, width - 1))}:`;
  return "-".repeat(width);
}

export type TableContext = {
  /** 1-based line numbers of the table block. */
  first: number;
  last: number;
  /** 0-based index of the column the cursor is in. */
  col: number;
  /** Doc position of that column's first cell character on the header line. */
  colHeaderPos: number;
  onHeader: boolean;
  onSeparator: boolean;
  alignment: Alignment;
};

export function tableContext(state: EditorState): TableContext | null {
  const { doc } = state;
  const line = doc.lineAt(state.selection.main.head);
  if (!TABLE_LINE.test(line.text)) return null;

  let first = line.number;
  let last = line.number;
  while (first > 1 && TABLE_LINE.test(doc.line(first - 1).text)) first--;
  while (last < doc.lines && TABLE_LINE.test(doc.line(last + 1).text)) last++;

  const header = doc.line(first);
  const cols = splitRow(header.text).length;
  const offset = state.selection.main.head - line.from;
  const pipesBefore = (line.text.slice(0, offset).match(/\|/g) ?? []).length;
  const col = Math.min(Math.max(0, pipesBefore - 1), cols - 1);

  // First cell character of column `col` on the header line.
  let colHeaderPos = header.from;
  let seen = -1;
  for (let i = 0; i < header.text.length; i++) {
    if (header.text[i] === "|" && ++seen === col) {
      colHeaderPos = header.from + Math.min(i + 2, header.length);
      break;
    }
  }

  const separatorLine = first + 1 <= last ? doc.line(first + 1) : null;
  const hasSeparator = separatorLine !== null && isSeparator(separatorLine.text);
  const alignment = hasSeparator
    ? alignmentOf(splitRow(separatorLine.text)[col] ?? "---")
    : "left";

  return {
    first,
    last,
    col,
    colHeaderPos,
    onHeader: line.number === first,
    onSeparator: isSeparator(line.text),
    alignment,
  };
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

export function addTableRow(view: EditorView) {
  const table = tableContext(view.state);
  if (!table) return;
  const { doc } = view.state;
  // From the header (or its separator), the new row goes below the separator.
  const afterNumber =
    table.onHeader || table.onSeparator
      ? Math.min(table.first + 1, table.last)
      : doc.lineAt(view.state.selection.main.head).number;
  const after = doc.line(afterNumber);
  const cells = splitRow(doc.line(table.first).text).length;
  const row = buildRow(Array(cells).fill(""));
  view.dispatch({
    changes: { from: after.to, insert: `\n${row}` },
    selection: { anchor: after.to + 3 },
  });
  view.focus();
}

export function deleteTableRow(view: EditorView) {
  const table = tableContext(view.state);
  // Removing the header or the separator would dismantle the table.
  if (!table || table.onHeader || table.onSeparator) return;
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const from = line.from === 0 ? 0 : line.from - 1;
  view.dispatch({ changes: { from, to: line.to, insert: "" } });
  view.focus();
}

function replaceTableLines(
  view: EditorView,
  table: TableContext,
  rebuild: (cells: string[], isSeparator: boolean) => string[] | null
) {
  const { doc } = view.state;
  const changes = [];
  for (let n = table.first; n <= table.last; n++) {
    const line = doc.line(n);
    const cells = rebuild(splitRow(line.text), isSeparator(line.text));
    if (cells === null) continue;
    changes.push({ from: line.from, to: line.to, insert: buildRow(cells) });
  }
  if (changes.length > 0) view.dispatch({ changes });
  view.focus();
}

// Inserts to the right of the cursor's column.
export function addTableColumn(view: EditorView) {
  const table = tableContext(view.state);
  if (!table) return;
  replaceTableLines(view, table, (cells, separator) => {
    const inserted = [...cells];
    inserted.splice(table.col + 1, 0, separator ? "---" : "");
    return inserted;
  });
}

export function deleteTableColumn(view: EditorView) {
  const table = tableContext(view.state);
  if (!table) return;
  const cols = splitRow(view.state.doc.line(table.first).text).length;
  if (cols <= 1) return;
  replaceTableLines(view, table, (cells) =>
    cells.filter((_, index) => index !== table.col)
  );
}

// Column alignment lives on the separator line: left → center → right → left.
export function cycleColumnAlignment(view: EditorView) {
  const table = tableContext(view.state);
  if (!table || table.first + 1 > table.last) return;
  const separator = view.state.doc.line(table.first + 1);
  if (!isSeparator(separator.text)) return;
  const cells = splitRow(separator.text);
  const next: Record<Alignment, Alignment> = {
    left: "center",
    center: "right",
    right: "left",
  };
  cells[table.col] = separatorCell(next[alignmentOf(cells[table.col] ?? "---")]);
  view.dispatch({
    changes: { from: separator.from, to: separator.to, insert: buildRow(cells) },
  });
  view.focus();
}

// "Reformater les pipes" (ADR 0005): pad every cell so the pipes of the
// whole table line up vertically.
export function reformatTable(view: EditorView) {
  const table = tableContext(view.state);
  if (!table) return;
  const { doc } = view.state;

  const rows: { cells: string[]; separator: boolean }[] = [];
  for (let n = table.first; n <= table.last; n++) {
    const text = doc.line(n).text;
    rows.push({ cells: splitRow(text), separator: isSeparator(text) });
  }
  const cols = Math.max(...rows.map((row) => row.cells.length));
  const widths = Array(cols).fill(3);
  for (const row of rows) {
    if (row.separator) continue;
    row.cells.forEach((cell, index) => {
      widths[index] = Math.max(widths[index], cell.length);
    });
  }
  const changes = rows.map((row, index) => {
    const line = doc.line(table.first + index);
    const cells = Array.from({ length: cols }, (_, i) => {
      if (row.separator) {
        return separatorCell(alignmentOf(row.cells[i] ?? "---"), widths[i]);
      }
      return (row.cells[i] ?? "").padEnd(widths[i]);
    });
    return { from: line.from, to: line.to, insert: buildRow(cells) };
  });
  view.dispatch({ changes });
  view.focus();
}
