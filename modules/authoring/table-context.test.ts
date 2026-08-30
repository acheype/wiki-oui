import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { tableContext } from "./editor/commands";

// The coordinates the table strips hang on (ADR 0005): which column the
// cursor is in, and where that column starts and ends on the header line —
// the two positions whose distance on screen centres the column strip.
const TABLE = ["| Nom | Ville |", "| --- | ----- |", "| Ada | Nouméa |"].join(
  "\n"
);

function contextAt(cursor: number) {
  return tableContext(
    EditorState.create({ doc: TABLE, selection: { anchor: cursor } })
  );
}

describe("tableContext", () => {
  it("is null outside a table", () => {
    expect(
      tableContext(EditorState.create({ doc: "Du texte.", selection: { anchor: 2 } }))
    ).toBeNull();
  });

  it("spans the first column, pipe to pipe", () => {
    const table = contextAt(TABLE.indexOf("Nom"));
    expect(table?.col).toBe(0);
    // "| Nom | …" — the cell opens after "| " and closes on the next pipe.
    expect(table?.colHeaderPos).toBe(2);
    expect(table?.colHeaderEnd).toBe(TABLE.indexOf("| Ville"));
  });

  it("spans the second column, up to the closing pipe", () => {
    const table = contextAt(TABLE.indexOf("Ville"));
    expect(table?.col).toBe(1);
    expect(table?.colHeaderPos).toBe(TABLE.indexOf("Ville"));
    expect(table?.colHeaderEnd).toBe(TABLE.indexOf("Ville") + "Ville ".length);
  });

  it("reads the column from a body row, on the header line", () => {
    const table = contextAt(TABLE.indexOf("Nouméa"));
    expect(table?.col).toBe(1);
    expect(table?.onHeader).toBe(false);
    // The strip hangs on the header whatever row the cursor is in.
    expect(table?.colHeaderPos).toBe(TABLE.indexOf("Ville"));
  });
});
