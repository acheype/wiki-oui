"use client";

import { ArrowDown, ArrowUp, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Field } from "@/modules/forms/field-widget";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  type ComponentDescriptor,
  type DescriptorField,
  type PropDefaults,
  type PropValue,
  type PropValues,
  type Range,
  CHILD_SLUG_FIELD,
  childSlug,
  emitsMarkdownLink,
  generateMarkdownLink,
  generateTag,
  isEmpty,
  isWrapperDescriptor,
  visibleFields,
} from "@/modules/authoring/descriptor";
import {
  type WrapperChildDraft,
  type WrapperEdit,
  generateWrapper,
  wrapperShapeOf,
} from "./wrapper";
import type { ComponentBuilderSpec } from "@/modules/authoring/descriptors";
import { cn } from "@/lib/utils";

// The ComponentBuilder modal (docs/component-builder.md): fully generated
// from a descriptor + the component's exported defaults — preview on top
// (real pipeline via GET /api/render), fields below, advanced ones folded.
// The widgets themselves live in the shared field renderer (ADR 0015).

export type BuilderState = {
  values: PropValues;
  unknownAttributes: string[];
  // Present when the component is a managed-children wrapper (ADR 0031): the
  // child list and which child opens first (its slug, or absent for the first).
  wrapper?: WrapperEdit;
};

/** An empty managed child: no props, no content yet. */
function emptyChild(): WrapperChildDraft {
  return { values: {}, content: "", unknownAttributes: [] };
}

// What an open builder holds. null means closed; the last non-null value is
// kept by the caller for the Radix close animation (see PageEditor).
export type BuilderDialogState = {
  mode: "insert" | "edit";
  spec: ComponentBuilderSpec;
  initial: BuilderState;
  /** Range of the tag being edited; absent in insert mode. */
  range?: Range;
};

/** Insert-mode starting point: defaults overlaid with the YAML pre-fills. */
export function insertionState(spec: ComponentBuilderSpec): BuilderState {
  const values: PropValues = {};
  for (const [field, descriptorField] of Object.entries(
    spec.descriptor.properties
  )) {
    if (descriptorField.value !== undefined) {
      values[field] = descriptorField.value;
    }
  }
  // A wrapper starts with two empty children, so its tabbed nature is plain
  // and the author only fills the titles (ADR 0031).
  const wrapper = isWrapperDescriptor(spec.descriptor)
    ? { children: [emptyChild(), emptyChild()] }
    : undefined;
  return { values, unknownAttributes: [], wrapper };
}

export function ComponentBuilderDialog({
  open,
  onOpenChange,
  state,
  allSlugs,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: BuilderDialogState | null;
  allSlugs: string[];
  onSubmit: (tag: string) => void;
}) {
  // Same props on both forms; a managed-children wrapper (ADR 0031) gets the
  // two-stage one, every other component the flat one.
  const Form =
    state && isWrapperDescriptor(state.spec.descriptor)
      ? WrapperBuilderForm
      : BuilderForm;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 65rem ≈ the site's real content width (max-w-5xl minus paddings):
          the preview iframe shows the component at the width it will
          actually render — EntriesView's grids and tables included. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[min(65rem,calc(100vw-2rem))]">
        {state && (
          <>
            <DialogHeader>
              <DialogTitle>
                {state.mode === "edit"
                  ? `Modifier «\u00A0${state.spec.descriptor.label}\u00A0»`
                  : `Insérer «\u00A0${state.spec.descriptor.label}\u00A0»`}
              </DialogTitle>
              {state.spec.descriptor.description && (
                <DialogDescription>
                  {state.spec.descriptor.description}
                </DialogDescription>
              )}
            </DialogHeader>
            {/* Keyed on open so every opening starts from a fresh form. */}
            <Form
              key={String(open)}
              spec={state.spec}
              mode={state.mode}
              initial={state.initial}
              allSlugs={allSlugs}
              onCancel={() => onOpenChange(false)}
              onSubmit={(tag) => {
                onSubmit(tag);
                onOpenChange(false);
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BuilderForm({
  spec,
  mode,
  initial,
  allSlugs,
  onCancel,
  onSubmit,
}: {
  spec: ComponentBuilderSpec;
  mode: "insert" | "edit";
  initial: BuilderState;
  allSlugs: string[];
  onCancel: () => void;
  onSubmit: (tag: string) => void;
}) {
  const [values, setValues] = useState<PropValues>(initial.values);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const visible = visibleFields(spec.descriptor, spec.defaults, values);
  const fields = Object.entries(spec.descriptor.properties).filter(
    ([field]) => visible.includes(field)
  );
  const plainFields = fields.filter(([, f]) => !f.advanced);
  const advancedFields = fields.filter(([, f]) => f.advanced);

  const tag =
    emitsMarkdownLink(spec.descriptor)
      ? generateMarkdownLink(spec.defaults, values)
      : generateTag(
          spec.name,
          spec.descriptor,
          spec.defaults,
          values,
          initial.unknownAttributes
        );

  const missingRequired = fields.some(
    ([field, descriptorField]) =>
      descriptorField.required && isEmpty(values[field])
  );

  // Choice-driven pre-fills (descriptor `prefill`): picking a value seeds
  // its declared siblings, but never overwrites an author's explicit choice
  // (only siblings still at their default move) — and switching away
  // retracts an untouched seed, so the pre-fill follows the choice.
  const setValue = (field: string, value: PropValue) =>
    setValues((current) => {
      const next = { ...current, [field]: value };
      const prefillsOf = (choice: PropValue) =>
        typeof choice === "string"
          ? (spec.descriptor.properties[field]?.prefill?.[choice] ?? {})
          : {};
      const held = (target: string) =>
        target in current ? current[target] : spec.defaults[target];
      const previous = field in current ? current[field] : spec.defaults[field];
      for (const [target, seeded] of Object.entries(prefillsOf(previous))) {
        if (held(target) === seeded) next[target] = spec.defaults[target];
      }
      for (const [target, seeded] of Object.entries(prefillsOf(value))) {
        if (held(target) === spec.defaults[target]) next[target] = seeded;
      }
      return next;
    });

  // In the two-column layout, the wide widgets (sections, tiles, row lists,
  // mappings, maps) keep the full width; scalar inputs share a row.
  const FULL_WIDTH_TYPES = new Set([
    "divider",
    "view-picker",
    "field-rows",
    "color-mapping",
    "icon-mapping",
    "map-view",
  ]);

  const renderField = ([field, descriptorField]: [string, DescriptorField]) => (
    <div
      key={field}
      className={
        FULL_WIDTH_TYPES.has(descriptorField.type) ? "md:col-span-2" : undefined
      }
    >
      <Field
        id={`builder-${field}`}
        spec={descriptorField}
        value={values[field] ?? spec.defaults[field]}
        // Sibling values feed the dependent widgets (form-field, mappings):
        // defaults under the live values, the same reading generateTag does.
        environment={{ allSlugs, siblingValues: { ...spec.defaults, ...values } }}
        onChange={(value) => setValue(field, value as PropValue)}
      />
    </div>
  );

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!missingRequired) onSubmit(tag);
      }}
    >
      <TagPreview source={tag} height={spec.descriptor.previewHeight} />

      <div className="grid items-start gap-4 md:grid-cols-2">
        {plainFields.map(renderField)}
      </div>

      {advancedFields.length > 0 && (
        <div className="grid gap-4">
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setAdvancedOpen((current) => !current)}
            aria-expanded={advancedOpen}
          >
            <ChevronRight
              className={`size-4 transition-transform ${advancedOpen ? "rotate-90" : ""}`}
              aria-hidden
            />
            Paramètres avancés
          </button>
          {advancedOpen && (
            <div className="grid items-start gap-4 md:grid-cols-2">
              {advancedFields.map(renderField)}
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={missingRequired}>
          {mode === "edit" ? "Modifier" : "Insérer"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * Wrapper builder (ADR 0031): a two-stage form for a managed-children
 * wrapper — the repeatable child list on top, the wrapper's own props
 * below. The round-trip preserves each child's MDX content verbatim.
 * ------------------------------------------------------------------ */

type ChildRow = WrapperChildDraft & { id: string };

let childRowSeq = 0;
function withId(child: WrapperChildDraft): ChildRow {
  return { ...child, id: `child-${childRowSeq++}` };
}

function WrapperBuilderForm({
  spec,
  mode,
  initial,
  allSlugs,
  onCancel,
  onSubmit,
}: {
  spec: ComponentBuilderSpec;
  mode: "insert" | "edit";
  initial: BuilderState;
  allSlugs: string[];
  onCancel: () => void;
  onSubmit: (tag: string) => void;
}) {
  const shape = wrapperShapeOf(spec);
  const childDesc = shape.childDescriptor;
  const childDefaults = shape.childDefaults;

  const [values, setValues] = useState<PropValues>(initial.values);
  const [children, setChildren] = useState<ChildRow[]>(() =>
    (initial.wrapper?.children ?? []).map(withId)
  );
  // The default tab is tracked by row identity, so it survives a rename and a
  // reorder; it falls back to the first row when its own row is deleted. Null
  // means "the first row", the omitted-default convention (ADR 0031).
  const [defaultId, setDefaultId] = useState<string | null>(() => {
    const wanted = initial.wrapper?.defaultChild;
    if (!wanted) return null;
    return children.find((child) => childSlug(child.values) === wanted)?.id ?? null;
  });
  const [confirmDelete, setConfirmDelete] = useState<ChildRow | null>(null);

  const globalFields = Object.entries(spec.descriptor.properties);
  const visibleGlobal = visibleFields(spec.descriptor, spec.defaults, values);

  const setGlobal = (field: string, value: PropValue) =>
    setValues((current) => ({ ...current, [field]: value }));

  const setChildValue = (id: string, field: string, value: PropValue) =>
    setChildren((rows) =>
      rows.map((row) =>
        row.id === id ? { ...row, values: { ...row.values, [field]: value } } : row
      )
    );

  const moveChild = (index: number, delta: number) =>
    setChildren((rows) => {
      const next = index + delta;
      if (next < 0 || next >= rows.length) return rows;
      const copy = [...rows];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });

  // Drag reordering mirrors the form builder (form-builder.tsx). The arrows
  // stay as the keyboard-reachable equivalent — only the pointer sensor is on.
  const sensors = useSensors(useSensor(PointerSensor));
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setChildren((rows) => {
      const from = rows.findIndex((row) => row.id === active.id);
      const to = rows.findIndex((row) => row.id === over.id);
      return arrayMove(rows, from, to);
    });
  };

  const addChild = () => setChildren((rows) => [...rows, withId(emptyChild())]);

  const removeChild = (id: string) => {
    setChildren((rows) => rows.filter((row) => row.id !== id));
    setDefaultId((current) => (current === id ? null : current));
  };

  // A duplicate slug within one group would make an anchor ambiguous, so it
  // blocks the save (ADR 0031). Empty titles do not collide — they are caught
  // by the required-field guard instead.
  const collidingIds = new Set<string>();
  const bySlug = new Map<string, string[]>();
  for (const row of children) {
    const slug = childSlug(row.values);
    if (!slug) continue;
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), row.id]);
  }
  for (const ids of bySlug.values()) {
    if (ids.length > 1) ids.forEach((id) => collidingIds.add(id));
  }

  const childRequiredMissing = (row: ChildRow) => {
    const visible = visibleFields(childDesc, childDefaults, row.values);
    return Object.entries(childDesc.properties).some(
      ([field, spec]) =>
        spec.required && visible.includes(field) && isEmpty(row.values[field])
    );
  };

  const missingRequired =
    children.length === 0 ||
    children.some(childRequiredMissing) ||
    globalFields.some(
      ([field, f]) =>
        f.required && visibleGlobal.includes(field) && isEmpty(values[field])
    );
  const blocked = missingRequired || collidingIds.size > 0;

  const firstSlug = children[0] ? childSlug(children[0].values) : undefined;
  const defaultRow = children.find((row) => row.id === defaultId) ?? children[0];
  const defaultSlug = defaultRow ? childSlug(defaultRow.values) : undefined;
  const tag = generateWrapper(shape, {
    values,
    unknownAttributes: initial.unknownAttributes,
    defaultChild:
      defaultSlug && defaultSlug !== firstSlug ? defaultSlug : undefined,
    children: children.map((row) => ({
      values: row.values,
      content: row.content,
      unknownAttributes: row.unknownAttributes,
    })),
  });

  const submit = () => {
    if (!blocked) onSubmit(tag);
  };

  const requestRemove = (row: ChildRow) => {
    if (row.content.trim() !== "") setConfirmDelete(row);
    else removeChild(row.id);
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <TagPreview source={tag} height={spec.descriptor.previewHeight} />

      <section className="grid gap-3">
        <SectionHeading
          title="Onglets"
          hint="Le titre de chaque onglet donne son lien d'ancrage (#…). L'onglet coché s'ouvre par défaut."
        />
        <RadioGroup
          value={defaultRow?.id ?? ""}
          onValueChange={setDefaultId}
          className="grid gap-2.5"
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={children.map((row) => row.id)}
              strategy={verticalListSortingStrategy}
            >
              {children.map((row, index) => (
                <TabRow
                  key={row.id}
                  row={row}
                  index={index}
                  total={children.length}
                  isDefault={row.id === defaultRow?.id}
                  colliding={collidingIds.has(row.id)}
                  childDesc={childDesc}
                  childDefaults={childDefaults}
                  allSlugs={allSlugs}
                  onFieldChange={(field, value) => setChildValue(row.id, field, value)}
                  onMoveUp={() => moveChild(index, -1)}
                  onMoveDown={() => moveChild(index, 1)}
                  onRemove={() => requestRemove(row)}
                />
              ))}
            </SortableContext>
          </DndContext>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={addChild}>
              <Plus />
              Ajouter un onglet
            </Button>
          </div>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          {"Le contenu de chaque onglet s'écrit à l'intérieur de sa balise "}
          <code className="font-mono">&lt;Tab&gt;</code>
          {", directement dans l'éditeur."}
        </p>
      </section>

      <section className="grid gap-3">
        <SectionHeading title="Affichage" />
        <div className="grid items-start gap-4 md:grid-cols-2">
          {globalFields
            .filter(([field]) => visibleGlobal.includes(field))
            .map(([field, fieldSpec]) => (
              <div
                key={field}
                className={
                  fieldSpec.type === "divider" ? "md:col-span-2" : undefined
                }
              >
                <Field
                  id={`builder-${field}`}
                  spec={fieldSpec}
                  value={values[field] ?? spec.defaults[field]}
                  environment={{
                    allSlugs,
                    siblingValues: { ...spec.defaults, ...values },
                  }}
                  onChange={(value) => setGlobal(field, value as PropValue)}
                />
              </div>
            ))}
        </div>
      </section>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={blocked}>
          {mode === "edit" ? "Modifier" : "Insérer"}
        </Button>
      </DialogFooter>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet onglet&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              Cet onglet contient du texte. Le supprimer effacera aussi son
              contenu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) removeChild(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid gap-0.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// One tab as a sortable card: a header naming the tab (its live title and
// anchor slug) with the default radio and the reorder/delete actions, then the
// tab's own fields. Drag mirrors the form builder; the arrows are its
// keyboard-reachable twin.
function TabRow({
  row,
  index,
  total,
  isDefault,
  colliding,
  childDesc,
  childDefaults,
  allSlugs,
  onFieldChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  row: ChildRow;
  index: number;
  total: number;
  isDefault: boolean;
  colliding: boolean;
  childDesc: ComponentDescriptor;
  childDefaults: PropDefaults;
  allSlugs: string[];
  onFieldChange: (field: string, value: PropValue) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const title = String(row.values[CHILD_SLUG_FIELD] ?? "").trim();
  const slug = childSlug(row.values);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-lg border bg-background",
        isDefault && "ring-1 ring-primary/40",
        colliding && "border-destructive",
        isDragging && "relative z-10 opacity-80 shadow-lg"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-2 py-1.5">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Glisser pour réordonner"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {title || <span className="text-muted-foreground">Nouvel onglet</span>}
          {slug && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              #{slug}
            </span>
          )}
        </span>
        <Label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <RadioGroupItem value={row.id} />
          Par défaut
        </Label>
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Monter l'onglet"
            disabled={index === 0}
            onClick={onMoveUp}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Descendre l'onglet"
            disabled={index === total - 1}
            onClick={onMoveDown}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Supprimer l'onglet"
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="grid items-start gap-4 p-3 md:grid-cols-2">
        {Object.entries(childDesc.properties).map(([field, fieldSpec]) => (
          <Field
            key={field}
            id={`child-${row.id}-${field}`}
            spec={fieldSpec}
            value={row.values[field] ?? childDefaults[field]}
            environment={{
              allSlugs,
              siblingValues: { ...childDefaults, ...row.values },
            }}
            onChange={(value) => onFieldChange(field, value as PropValue)}
          />
        ))}
      </div>
      {colliding && (
        <p className="px-3 pb-3 text-xs text-destructive">
          Renommez un onglet pour que chacun soit identifiable par son ancre.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Preview: the generated MDX loads in an iframe pointing at the bare
 * page GET /api/render?source=… — the exact page pipeline, hydrated,
 * compile errors included. What it shows is what the page will render.
 * ------------------------------------------------------------------ */

const PREVIEW_DEBOUNCE_MS = 350;

function TagPreview({ source, height }: { source: string; height?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(
      () => setUrl(`/api/render?source=${encodeURIComponent(source)}`),
      PREVIEW_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [source]);

  return (
    <div className="grid gap-1.5">
      {url === null ? (
        <div
          className="animate-pulse rounded-md border bg-muted/40"
          style={{ height: height ?? "120px" }}
        />
      ) : (
        <iframe
          src={url}
          title="Aperçu du rendu"
          className="w-full rounded-md border bg-background"
          style={{ height: height ?? "120px" }}
        />
      )}
      <p className="font-mono text-xs break-all text-muted-foreground">{source}</p>
    </div>
  );
}
