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
  findComponentTag,
  tagToBuilderState,
  type PropValues,
} from "@/lib/component-descriptor";
import type { ComponentBuilderSpec } from "@/lib/component-descriptors";
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
} from "./commands";

// Cursor-anchored contextual UI (ADR 0005): CodeMirror tooltips computed from
// the cursor position — a link edit icon, and table strips placed spatially
// (column ops on top of the column, row ops left of the line, reformat at the
// table's top-left corner). The same field will later host component editing.

export type LinkInfo = {
  from: number;
  to: number;
  text: string;
  href: string;
  target: LinkTarget;
};

const LINK_MARKDOWN = /^\[([^\]]*)\]\(\s*<?([^)>\s]*)>?\s*\)/;
const TARGET_ANNOTATION = /^\{\{\s*target:\s*'(_blank|modal)'\s*\}\}/;

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
        .sliceDoc(node.to, Math.min(node.to + 60, state.doc.length))
        .match(TARGET_ANNOTATION);
      return {
        from: node.from,
        to: node.to + (after?.[0].length ?? 0),
        text: match[1],
        href: match[2],
        target: (after?.[1] as LinkTarget | undefined) ?? "self",
      };
    }
  }
  return null;
}

export type ComponentInfo = {
  from: number;
  to: number;
  spec: ComponentBuilderSpec;
  values: PropValues;
  unknownAttributes: string[];
};

// Enclosing well-formed component tag whose descriptor is known. Malformed
// tags, unknown components and non-literal props get no pencil
// (docs/component-builder.md).
export function componentAtCursor(
  state: EditorState,
  builders: ComponentBuilderSpec[]
): ComponentInfo | null {
  const range = state.selection.main;
  if (!range.empty) return null;
  // A window around the cursor bounds the scan (generated tags are short).
  const windowFrom = Math.max(0, range.head - 2000);
  const windowTo = Math.min(state.doc.length, range.head + 2000);
  const found = findComponentTag(
    state.sliceDoc(windowFrom, windowTo),
    range.head - windowFrom
  );
  if (!found) return null;
  const spec = builders.find(
    (builder) =>
      builder.name === found.tag.name &&
      builder.descriptor.emits !== "markdown-link"
  );
  if (!spec) return null;
  const builderState = tagToBuilderState(
    spec.descriptor,
    spec.defaults,
    found.tag
  );
  if (!builderState) return null;
  return {
    from: windowFrom + found.from,
    to: windowFrom + found.to,
    spec,
    ...builderState,
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
            label={`Modifier « ${component.spec.descriptor.label} »`}
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

    // Column operations, on top of the current column (header line anchor).
    tooltips.push({
      pos: table.colHeaderPos,
      above: true,
      create: (view: EditorView) =>
        reactTooltip(
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
        ),
    });

    // Reformat, at the table's top-left corner (above-left of the header).
    tooltips.push({
      pos: header.from,
      above: true,
      create: (view: EditorView) =>
        reactTooltip(
          "cm-wiki-strip-corner",
          <StripButton
            label="Reformater le tableau (aligner les pipes)"
            onClick={() => reformatTable(view)}
          >
            <AlignHorizontalDistributeCenter />
          </StripButton>
        ),
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
