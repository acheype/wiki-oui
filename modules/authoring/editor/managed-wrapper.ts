import {
  childAnchorSlug,
  type ChildrenDescriptor,
  type ComponentDescriptor,
  type PropValue,
  type PropValues,
  isEmpty,
  visibleFields,
} from "../descriptor";
import {
  appendManagedChild,
  generateWrapper,
  moveManagedChild,
  removeManagedChild,
  type WrapperChildDraft,
  type WrapperEdit,
  type WrapperShape,
} from "./wrapper";

/** A managed child with an identity that survives edits and reordering. */
export type ManagedWrapperRow = WrapperChildDraft & { id: string };

/** The private state of the managed-child editor. */
export interface ManagedWrapperEditor {
  rows: ManagedWrapperRow[];
  interstitial?: string[];
  defaultId: string | null;
}

export type ManagedWrapperCommand =
  | { type: "change"; id: string; field: string; value: PropValue }
  | { type: "move"; from: number; to: number }
  | { type: "append"; child: WrapperChildDraft }
  | { type: "remove"; id: string }
  | { type: "select"; id: string | null };

export interface ManagedWrapperResult {
  source: string;
  blocked: boolean;
  collidingIds: Set<string>;
  defaultId: string | null;
}

export type ManagedWrapperInitialState = WrapperEdit;

export interface ManagedWrapperResultInput {
  values: PropValues;
  unknownAttributes: string[];
  globalMissing: boolean;
}

let rowSequence = 0;

function rowId(): string {
  return `managed-child-${rowSequence++}`;
}

function withIds(children: WrapperChildDraft[]): ManagedWrapperRow[] {
  return children.map((child) => ({ ...child, id: rowId() }));
}

/** Values for a new managed child, including its numbered anchor identity. */
export function nextManagedChildValues(
  descriptor: ChildrenDescriptor,
  children: WrapperChildDraft[]
): PropValues {
  const values: PropValues = {};
  for (const [field, childField] of Object.entries(descriptor.properties)) {
    if (childField.initialValue !== undefined) {
      values[field] = childField.initialValue;
    }
  }
  const anchorBase = descriptor.properties[descriptor.anchorField]?.initialValue;
  if (typeof anchorBase !== "string" || anchorBase.trim() === "") return values;
  const anchors = new Set(
    children.map((child) => String(child.values[descriptor.anchorField] ?? ""))
  );
  let number = 1;
  while (anchors.has(`${anchorBase} ${number}`)) number++;
  values[descriptor.anchorField] = `${anchorBase} ${number}`;
  return values;
}

function initialChildren(descriptor: ChildrenDescriptor): WrapperChildDraft[] {
  const first = {
    values: nextManagedChildValues(descriptor, []),
    content: descriptor.initialContent ?? "",
    unknownAttributes: [],
  };
  return [
    first,
    {
      values: nextManagedChildValues(descriptor, [first]),
      content: descriptor.initialContent ?? "",
      unknownAttributes: [],
    },
  ];
}

/** Creates the identity-aware state used by the managed wrapper form. */
export function createManagedWrapperEditor(
  descriptor: ChildrenDescriptor,
  initial?: ManagedWrapperInitialState
): ManagedWrapperEditor {
  const children = initial?.children ?? initialChildren(descriptor);
  const rows = withIds(children);
  const wanted = initial?.defaultChild;
  const defaultId = wanted
    ? rows.find(
        (row) => childAnchorSlug(row.values[descriptor.anchorField]) === wanted
      )?.id ?? null
    : null;
  return { rows, interstitial: initial?.interstitial, defaultId };
}

/** Applies one user intent while keeping row identity and direct content. */
export function applyManagedWrapperCommand(
  editor: ManagedWrapperEditor,
  command: ManagedWrapperCommand
): ManagedWrapperEditor {
  switch (command.type) {
    case "change":
      return {
        ...editor,
        rows: editor.rows.map((row) =>
          row.id === command.id
            ? { ...row, values: { ...row.values, [command.field]: command.value } }
            : row
        ),
      };
    case "move": {
      const moved = moveManagedChild(
        { children: editor.rows, interstitial: editor.interstitial },
        command.from,
        command.to
      );
      return { ...editor, rows: moved.children as ManagedWrapperRow[] };
    }
    case "append": {
      const appended = appendManagedChild(
        { children: editor.rows, interstitial: editor.interstitial },
        command.child
      );
      const rows = appended.children.map((row, index) =>
        index < editor.rows.length
          ? editor.rows[index]
          : { ...row, id: rowId() }
      );
      return {
        ...editor,
        rows,
        interstitial: appended.interstitial,
      };
    }
    case "remove": {
      const index = editor.rows.findIndex((row) => row.id === command.id);
      if (index < 0) return editor;
      const removed = removeManagedChild(
        { children: editor.rows, interstitial: editor.interstitial },
        index
      );
      return {
        ...editor,
        rows: removed.children as ManagedWrapperRow[],
        interstitial: removed.interstitial,
        defaultId: editor.defaultId === command.id ? null : editor.defaultId,
      };
    }
    case "select":
      return {
        ...editor,
        defaultId:
          command.id && editor.rows.some((row) => row.id === command.id)
            ? command.id
            : null,
      };
  }
}

function collisionIds(
  descriptor: ChildrenDescriptor,
  rows: ManagedWrapperRow[]
): Set<string> {
  const bySlug = new Map<string, string[]>();
  for (const row of rows) {
    const slug = childAnchorSlug(row.values[descriptor.anchorField]);
    if (!slug) continue;
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), row.id]);
  }
  const ids = new Set<string>();
  for (const duplicates of bySlug.values()) {
    if (duplicates.length > 1) duplicates.forEach((id) => ids.add(id));
  }
  return ids;
}

function childMissing(
  descriptor: ComponentDescriptor,
  defaults: WrapperShape["childDefaults"],
  row: ManagedWrapperRow
): boolean {
  const visible = visibleFields(descriptor, defaults, row.values);
  return Object.entries(descriptor.properties).some(
    ([field, fieldDescriptor]) =>
      fieldDescriptor.required &&
      visible.includes(field) &&
      isEmpty(row.values[field])
  );
}

/** Projects editor state into validation and generated wrapper source. */
export function managedWrapperResult(
  shape: WrapperShape,
  editor: ManagedWrapperEditor,
  input: ManagedWrapperResultInput
): ManagedWrapperResult {
  const descriptor = shape.descriptor.children!;
  const collisions = collisionIds(descriptor, editor.rows);
  const first = editor.rows[0];
  const selected = editor.rows.find((row) => row.id === editor.defaultId);
  const defaultRow =
    descriptor.initialSelection === "none" ? selected : selected ?? first;
  const defaultSlug = defaultRow
    ? childAnchorSlug(defaultRow.values[descriptor.anchorField])
    : undefined;
  const firstSlug = first
    ? childAnchorSlug(first.values[descriptor.anchorField])
    : undefined;
  const defaultChild =
    defaultSlug &&
    (descriptor.initialSelection === "none" || defaultSlug !== firstSlug)
      ? defaultSlug
      : undefined;
  const source = generateWrapper(shape, {
    values: input.values,
    unknownAttributes: input.unknownAttributes,
    defaultChild,
    children: editor.rows,
    interstitial: editor.interstitial,
  });
  const blocked =
    input.globalMissing ||
    editor.rows.length === 0 ||
    editor.rows.some((row) =>
      childMissing(shape.childDescriptor, shape.childDefaults, row)
    ) ||
    collisions.size > 0;
  return {
    source,
    blocked,
    collidingIds: collisions,
    defaultId: defaultRow?.id ?? null,
  };
}
