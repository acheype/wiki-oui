"use client";

import { syntaxTree } from "@codemirror/language";
import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  showTooltip,
  type Tooltip,
  type TooltipView,
} from "@codemirror/view";
import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  Minus,
  Pencil,
  Plus,
} from "lucide-react";
import { createRoot } from "react-dom/client";
import {
  emitsMarkdownLink,
  findComponentTag,
  isWrapperDescriptor,
  type LiteralValue,
  parseLiteral,
  TAG_SCAN_WINDOW,
  tagToBuilderState,
  type PropValues,
  type Range,
} from "@/modules/authoring/descriptor";
import {
  type WrapperEdit,
  findWrapperAtCursor,
  wrapperShapeOf,
} from "./wrapper";
import type { ComponentBuilderSpec } from "@/modules/authoring/descriptors";
import {
  addTableColumn,
  addTableRow,
  cycleColumnAlignment,
  deleteTableColumn,
  deleteTableRow,
  reformatTable,
  tableContext,
  type Alignment,
  type LinkTarget,
  type TableContext,
} from "./commands";

// Cursor-anchored contextual UI (ADR 0005): CodeMirror tooltips computed from
// the cursor position — a link edit icon, and table strips placed spatially
// (column ops on top of the column, row ops left of the line, reformat at the
// table's top-left corner). The same field will later host component editing.

export type LinkInfo = Range & {
  text: string;
  href: string;
  target: LinkTarget;
  /** docs/permissions.md § Liens et boutons vers l'inaccessible. */
  hideIfNoAccess: boolean;
};

const LINK_MARKDOWN = /^\[([^\]]*)\]\(\s*<?([^)>\s]*)>?\s*\)/;
// The trailing mdx-annotations {{ … }} block (ADR 0006), matched whole so the
// pencil's replace range swallows every key it holds — not just `target`: a
// key left outside that range would survive untouched, duplicated the moment
// generateMarkdownLink rewrites it into a fresh annotation of its own.
const LINK_ANNOTATION = /^\{\{([^}]*)\}\}/;

// The trailing {{ … }} block is an mdx-annotations object literal (ADR 0006).
// Reading it back with the component builder's own literal parser — rather
// than key-spotting regexes — makes the graphical editor blind to whatever
// blanks, key order or quote style the author typed: none of them change the
// annotation's meaning. An annotation that is not a plain literal object reads
// as the defaults, the same value it would render as.
function readLinkAnnotation(inner: string): {
  target: LinkTarget;
  hideIfNoAccess: boolean;
} {
  const parsed = parseLiteral(`{${inner}}`)?.value;
  const record =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, LiteralValue>)
      : {};
  const target = record.target;
  return {
    target: target === "_blank" || target === "modal" ? target : "self",
    hideIfNoAccess: record.hideIfNoAccess === true,
  };
}

export function linkAtCursor(state: EditorState): LinkInfo | null {
  const range = state.selection.main;
  if (!range.empty) return null;
  const tree = syntaxTree(state);
  for (const side of [-1, 1] as const) {
    for (
      let node: ReturnType<typeof tree.resolveInner> | null =
        tree.resolveInner(range.head, side);
      node;
      node = node.parent
    ) {
      if (node.name !== "Link") continue;
      const match = state.sliceDoc(node.from, node.to).match(LINK_MARKDOWN);
      if (!match) return null;
      const after = state
        .sliceDoc(node.to, Math.min(node.to + 80, state.doc.length))
        .match(LINK_ANNOTATION);
      const annotation = readLinkAnnotation(after?.[1] ?? "");
      return {
        from: node.from,
        to: node.to + (after?.[0].length ?? 0),
        text: match[1],
        href: match[2],
        target: annotation.target,
        hideIfNoAccess: annotation.hideIfNoAccess,
      };
    }
  }
  return null;
}

export type ComponentInfo = Range & {
  spec: ComponentBuilderSpec;
  values: PropValues;
  unknownAttributes: string[];
  // Present when the tag is a managed-children wrapper (ADR 0031): its child
  // list and open child, so the builder re-edits it in its two-stage form.
  wrapper?: WrapperEdit;
};

// Enclosing well-formed component tag whose descriptor is known. A self-closing
// leaf tag wins over any wrapper enclosing it — the cursor inside a <Button> in
// a tab edits the button, not the <Tabs>. Malformed tags, unknown components
// and non-literal props get no pencil (docs/component-builder.md).
export function componentAtCursor(
  state: EditorState,
  builders: ComponentBuilderSpec[]
): ComponentInfo | null {
  const range = state.selection.main;
  if (!range.empty) return null;
  return leafAtCursor(state, builders) ?? wrapperAtCursor(state, builders);
}

function leafAtCursor(
  state: EditorState,
  builders: ComponentBuilderSpec[]
): ComponentInfo | null {
  const range = state.selection.main;
  // Slice the parser's own scan window out of the document (not the whole doc).
  const windowFrom = Math.max(0, range.head - TAG_SCAN_WINDOW);
  const windowTo = Math.min(state.doc.length, range.head + TAG_SCAN_WINDOW);
  const found = findComponentTag(
    state.sliceDoc(windowFrom, windowTo),
    range.head - windowFrom
  );
  if (!found) return null;
  const spec = builders.find(
    (builder) =>
      builder.name === found.tag.name && !emitsMarkdownLink(builder.descriptor)
  );
  if (!spec) return null;
  const builderState = tagToBuilderState(
    spec.descriptor,
    spec.defaults,
    found.tag
  );
  return {
    from: windowFrom + found.from,
    to: windowFrom + found.to,
    spec,
    ...builderState,
  };
}

// The innermost wrapper (<Tabs>) enclosing the cursor, read into its child
// list. Scans the whole document: a wrapper spans more than the leaf window,
// its close tag reachable far below the open one.
function wrapperAtCursor(
  state: EditorState,
  builders: ComponentBuilderSpec[]
): ComponentInfo | null {
  const wrappers = builders.filter((builder) =>
    isWrapperDescriptor(builder.descriptor)
  );
  if (wrappers.length === 0) return null;
  const found = findWrapperAtCursor(
    wrappers.map(wrapperShapeOf),
    state.doc.toString(),
    state.selection.main.head
  );
  if (!found) return null;
  const spec = wrappers.find((builder) => builder.name === found.shape.name);
  if (!spec) return null;
  return {
    from: found.from,
    to: found.to,
    spec,
    values: found.draft.values,
    unknownAttributes: found.draft.unknownAttributes,
    wrapper: {
      children: found.draft.children,
      defaultChild: found.draft.defaultChild,
    },
  };
}

// Deliberately not the toolbar's ToolButton: the strips render in a detached
// React root where the Radix TooltipProvider is out of reach, so the label is
// a native title and the look comes from the .cm-wiki-strip CSS.
function StripButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Keep the editor selection: the button must not steal focus.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function reactTooltip(className: string, content: React.ReactNode): TooltipView {
  const dom = document.createElement("div");
  dom.className = "cm-wiki-tools";
  const root = createRoot(dom);
  root.render(<div className={`cm-wiki-strip ${className}`}>{content}</div>);
  return {
    dom,
    // Deferred: React forbids unmounting synchronously from inside a render.
    destroy: () => setTimeout(() => root.unmount()),
  };
}

const ALIGNMENT_ICONS: Record<Alignment, React.ReactNode> = {
  left: <AlignLeft />,
  center: <AlignCenter />,
  right: <AlignRight />,
};

const ALIGNMENT_LABELS: Record<Alignment, string> = {
  left: "à gauche",
  center: "centré",
  right: "à droite",
};

// Puts the strip's middle over the column's, « -50% » alone centring it on
// the column's first character. The width is only known on screen, and a
// tooltip can be created in the middle of an update — insertTable dispatches
// and the strip is built there and then — where CodeMirror forbids reading
// the layout. So the reading is asked for through requestMeasure, which runs
// it in the measure phase, and the offset is written afterwards; until then
// the strip stands centred on the first character.
function centreOverColumn(
  view: EditorView,
  dom: HTMLElement,
  table: TableContext
) {
  const place = (offset: string) =>
    (dom.style.transform = `translate(${offset}, -6px)`);
  place("-50%");
  view.requestMeasure({
    read: (measured) => {
      const start = measured.coordsAtPos(table.colHeaderPos);
      const end = measured.coordsAtPos(table.colHeaderEnd);
      return start && end ? Math.round((end.left - start.left) / 2) : 0;
    },
    write: (half) => place(`calc(-50% + ${half}px)`),
  });
}

// The gap between the reformat button's underside and the table's first line.
const CORNER_GAP = 24;

// Puts a strip a fixed distance above its line, whatever the editor did with
// it: CodeMirror stacks tooltips that would overlap, which left the reformat
// button at one height when the cursor was in the first column — under the
// column strip, so stacked — and at another everywhere else.
//
// Two rules govern when this can run. It has to be after CodeMirror has
// placed the tooltip, so it hangs on the `positioned` hook; and the layout
// can only be read from the measure phase, never from an update — which
// `positioned` is part of. Hence a measure asked for from inside it, running
// on the next pass. The shift already applied is taken back out before a new
// one is worked out, and nothing is written when it lands on the same value:
// the correction settles in one pass instead of chasing itself.
function liftAbove(view: EditorView, dom: HTMLElement, pos: number) {
  let shift = 0;
  return () => {
    view.requestMeasure({
      read: (measured) => {
        const line = measured.coordsAtPos(pos);
        if (!line) return null;
        const unshifted = dom.getBoundingClientRect().bottom - shift;
        return Math.round(line.top - CORNER_GAP - unshifted);
      },
      write: (wanted) => {
        if (wanted === null || wanted === shift) return;
        shift = wanted;
        dom.style.transform = `translateY(${shift}px)`;
      },
    });
  };
}

function computeTooltips(
  state: EditorState,
  options: CursorToolsOptions
): Tooltip[] {
  const tooltips: Tooltip[] = [];

  const link = linkAtCursor(state);
  if (link) {
    tooltips.push({
      pos: state.selection.main.head,
      above: true,
      create: () =>
        reactTooltip(
          "",
          <StripButton
            label="Modifier le lien"
            onClick={() => options.onEditLink(link)}
          >
            <Pencil />
          </StripButton>
        ),
    });
  }

  const component = componentAtCursor(state, options.builders);
  if (component) {
    tooltips.push({
      pos: state.selection.main.head,
      above: true,
      create: () =>
        reactTooltip(
          "",
          <StripButton
            label={`Modifier «\u00A0${component.spec.descriptor.label}\u00A0»`}
            onClick={() => options.onEditComponent(component)}
          >
            <Pencil />
          </StripButton>
        ),
    });
  }

  const table = tableContext(state);
  if (table) {
    const { doc } = state;
    const line = doc.lineAt(state.selection.main.head);
    const header = doc.line(table.first);

    // Column operations, over the middle of the current column. The width is
    // measured on screen, and the tooltips are recomputed on every keystroke
    // (the state field above), so the strip follows a column that a typed
    // character widens.
    tooltips.push({
      pos: table.colHeaderPos,
      above: true,
      create: (view: EditorView) => {
        const strip = reactTooltip(
          "",
          <>
            <StripButton
              label="Ajouter une colonne (à droite)"
              onClick={() => addTableColumn(view)}
            >
              <Plus />
            </StripButton>
            <StripButton
              label="Supprimer la colonne"
              onClick={() => deleteTableColumn(view)}
            >
              <Minus />
            </StripButton>
            <StripButton
              label={`Alignement de la colonne : ${ALIGNMENT_LABELS[table.alignment]}`}
              onClick={() => cycleColumnAlignment(view)}
            >
              {ALIGNMENT_ICONS[table.alignment]}
            </StripButton>
          </>
        );
        centreOverColumn(view, strip.dom, table);
        return strip;
      },
    });

    // Reformat, at the table's top-left corner (above-left of the header).
    tooltips.push({
      pos: header.from,
      above: true,
      create: (view: EditorView) => {
        const strip = reactTooltip(
          "cm-wiki-strip-corner",
          <StripButton
            label="Reformater le tableau (aligner les pipes)"
            onClick={() => reformatTable(view)}
          >
            <AlignHorizontalDistributeCenter />
          </StripButton>
        );
        return { ...strip, positioned: liftAbove(view, strip.dom, header.from) };
      },
    });

    // Row operations, left of the current line.
    tooltips.push({
      pos: line.from,
      above: false,
      create: (view: EditorView) =>
        reactTooltip(
          "cm-wiki-strip-left",
          <>
            <StripButton
              label="Ajouter une ligne (en dessous)"
              onClick={() => addTableRow(view)}
            >
              <Plus />
            </StripButton>
            <StripButton
              label="Supprimer la ligne"
              onClick={() => deleteTableRow(view)}
            >
              <Minus />
            </StripButton>
          </>
        ),
    });
  }

  return tooltips;
}

const editorFocusChanged = StateEffect.define<boolean>();

type ToolsState = { focused: boolean; tooltips: readonly Tooltip[] };

export type CursorToolsOptions = {
  onEditLink: (info: LinkInfo) => void;
  onEditComponent: (info: ComponentInfo) => void;
  builders: ComponentBuilderSpec[];
};

// Tools only show while the editor has focus: they vanish when the link
// dialog opens (it takes focus) instead of floating above the modal. The
// strip buttons prevent mousedown default, so using them keeps focus.
export function cursorTools(options: CursorToolsOptions): Extension {
  const field = StateField.define<ToolsState>({
    create: () => ({ focused: false, tooltips: [] }),
    update(value, tr) {
      let focused = value.focused;
      for (const effect of tr.effects) {
        if (effect.is(editorFocusChanged)) focused = effect.value;
      }
      if (!tr.docChanged && !tr.selection && focused === value.focused) {
        return value;
      }
      return {
        focused,
        tooltips: focused ? computeTooltips(tr.state, options) : [],
      };
    },
    provide: (f) =>
      showTooltip.computeN([f], (state) => [...state.field(f).tooltips]),
  });
  return [
    field,
    EditorView.focusChangeEffect.of((_state, focusing) =>
      editorFocusChanged.of(focusing)
    ),
  ];
}
