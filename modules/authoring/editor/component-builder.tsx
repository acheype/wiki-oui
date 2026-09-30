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
  childAnchorSlug,
  emitsMarkdownLink,
  generateMarkdownLink,
  generateTag,
  isEmpty,
  isManagedChildrenDescriptor,
  visibleFields,
} from "@/modules/authoring/descriptor";
import {
  type WrapperEdit,
  generateFreeContentWrapper,
  isFreeContentDescriptor,
  wrapperShapeOf,
} from "./wrapper";
import {
  applyManagedWrapperCommand,
  createManagedWrapperEditor,
  managedWrapperResult,
  nextManagedChildValues,
  type ManagedWrapperEditor,
  type ManagedWrapperRow,
} from "./managed-wrapper";
import type { ComponentBuilderSpec } from "@/modules/authoring/descriptors";
import { cn } from "@/lib/utils";
import { changeBuilderValue } from "./builder-values";

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
  // Exact MDX between a free-content wrapper's tags. The builder carries it
  // without rendering a field or normalizing it on re-edit.
  content?: string;
};

// What an open builder holds. null means closed; the last non-null value is
// kept by the caller for the dialog's close animation (see PageEditor).
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
    if (descriptorField.initialValue !== undefined) {
      values[field] = descriptorField.initialValue;
    }
  }
  // A wrapper starts with two children whose descriptor-driven identities and
  // content make the grouped structure plain from insertion (ADR 0031).
  let wrapper: WrapperEdit | undefined;
  if (isManagedChildrenDescriptor(spec.descriptor)) {
    const editor = createManagedWrapperEditor(spec.descriptor.children);
    wrapper = {
      children: editor.rows.map((child) => {
        const { id, ...draft } = child;
        void id;
        return draft;
      }),
      interstitial: editor.interstitial,
    };
  }
  const content = isFreeContentDescriptor(spec.descriptor)
    ? `\n${spec.descriptor.initialContent}\n`
    : undefined;
  return { values, unknownAttributes: [], wrapper, content };
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
    state && isManagedChildrenDescriptor(state.spec.descriptor)
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

  const tag = isFreeContentDescriptor(spec.descriptor)
    ? generateFreeContentWrapper(spec, {
        values,
        unknownAttributes: initial.unknownAttributes,
        content: initial.content ?? "",
      })
    : emitsMarkdownLink(spec.descriptor)
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

  const setValue = (field: string, value: PropValue) =>
    setValues((current) =>
      changeBuilderValue(
        spec.descriptor,
        spec.defaults,
        current,
        field,
        value
      )
    );

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
  const childrenDescriptor = spec.descriptor.children!;
  const allowsNoDefault = childrenDescriptor.initialSelection === "none";
  const childLabel = childrenDescriptor.label;
  const childLabelLower = childLabel.toLocaleLowerCase("fr");
  const anchorField = childrenDescriptor.anchorField;
  const anchorLabel = childrenDescriptor.properties[anchorField].label;
  const collectionLabel =
    childrenDescriptor.collectionLabel ?? spec.descriptor.label;

  const [values, setValues] = useState<PropValues>(initial.values);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editor, setEditor] = useState<ManagedWrapperEditor>(() =>
    createManagedWrapperEditor(childrenDescriptor, initial.wrapper)
  );
  const children = editor.rows;
  const [confirmDelete, setConfirmDelete] = useState<ManagedWrapperRow | null>(null);

  const globalFields = Object.entries(spec.descriptor.properties);
  const visibleGlobal = visibleFields(spec.descriptor, spec.defaults, values);
  const visibleGlobalFields = globalFields.filter(([field]) =>
    visibleGlobal.includes(field)
  );
  const plainGlobalFields = visibleGlobalFields.filter(
    ([, field]) => !field.advanced
  );
  const advancedGlobalFields = visibleGlobalFields.filter(
    ([, field]) => field.advanced
  );

  const setGlobal = (field: string, value: PropValue) =>
    setValues((current) =>
      changeBuilderValue(
        spec.descriptor,
        spec.defaults,
        current,
        field,
        value
      )
    );

  const setChildValue = (id: string, field: string, value: PropValue) =>
    setEditor((current) =>
      applyManagedWrapperCommand(current, { type: "change", id, field, value })
    );

  const moveChild = (index: number, delta: number) =>
    setEditor((current) => {
      const next = index + delta;
      if (next < 0 || next >= current.rows.length) return current;
      return applyManagedWrapperCommand(current, {
        type: "move",
        from: index,
        to: next,
      });
    });

  // Drag reordering mirrors the form builder (form-builder.tsx). The arrows
  // stay as the keyboard-reachable equivalent — only the pointer sensor is on.
  const sensors = useSensors(useSensor(PointerSensor));
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setEditor((current) => {
      const from = current.rows.findIndex((row) => row.id === active.id);
      const to = current.rows.findIndex((row) => row.id === over.id);
      return applyManagedWrapperCommand(current, { type: "move", from, to });
    });
  };

  const addChild = () =>
    setEditor((current) =>
      applyManagedWrapperCommand(current, {
        type: "append",
        child: {
          values: nextManagedChildValues(childrenDescriptor, current.rows),
          content: childrenDescriptor.initialContent ?? "",
          unknownAttributes: [],
        },
      })
    );

  const globalMissing = globalFields.some(
      ([field, f]) =>
        f.required && visibleGlobal.includes(field) && isEmpty(values[field])
    );
  const result = managedWrapperResult(shape, editor, {
    values,
    unknownAttributes: initial.unknownAttributes,
    globalMissing,
  });
  const { source: tag, blocked, collidingIds } = result;
  const defaultRow = children.find((row) => row.id === result.defaultId);

  const removeChild = (id: string) =>
    setEditor((current) =>
      applyManagedWrapperCommand(current, { type: "remove", id })
    );

  const submit = () => {
    if (!blocked) onSubmit(tag);
  };

  const requestRemove = (row: ManagedWrapperRow) => {
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
          title={collectionLabel}
          hint={`Le champ «\u00A0${anchorLabel}\u00A0» de chaque élément donne son lien d'ancrage (#…).`}
        />
        <RadioGroup
          value={defaultRow?.id ?? "none"}
          onValueChange={(value) =>
            setEditor((current) =>
              applyManagedWrapperCommand(current, {
                type: "select",
                id: value === "none" ? null : value,
              })
            )
          }
          className="grid gap-3"
        >
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
            <SectionHeading
              title={`${childLabel} ouvert au chargement`}
              hint={`Choisissez le ${childLabelLower} qui sera déjà ouvert quand la page s’affiche.`}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {allowsNoDefault && (
                <Label className="flex items-center gap-2 text-sm font-normal">
                  <RadioGroupItem value="none" />
                  {`Aucun ${childLabelLower} ouvert`}
                </Label>
              )}
              {children.map((row) => {
                const label = String(row.values[anchorField] ?? "").trim();
                return (
                  <Label
                    key={`initial-${row.id}`}
                    className="flex min-w-0 items-center gap-2 text-sm font-normal"
                  >
                    <RadioGroupItem value={row.id} />
                    <span className="max-w-64 truncate">
                      {label || `${childLabel} sans ${anchorLabel.toLocaleLowerCase("fr")}`}
                    </span>
                  </Label>
                );
              })}
            </div>
          </div>
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
                <ManagedChildRow
                  key={row.id}
                  row={row}
                  index={index}
                  total={children.length}
                  isDefault={row.id === defaultRow?.id}
                  colliding={collidingIds.has(row.id)}
                  childDesc={childDesc}
                  childDefaults={childDefaults}
                  allSlugs={allSlugs}
                  childLabel={childLabel}
                  anchorField={anchorField}
                  anchorLabel={anchorLabel}
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
              Ajouter un élément
            </Button>
          </div>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          Le contenu de chaque élément s’écrit à l’intérieur de sa balise{" "}
          <code className="font-mono">{`<${shape.childName}>`}</code>
          {", directement dans l'éditeur."}
        </p>
        {children.length === 0 && (
          <p className="text-xs text-destructive">
            Ajoutez au moins un élément pour enregistrer ce composant.
          </p>
        )}
        {children.length === 1 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {childrenDescriptor.singleChildWarning ??
              "Un élément unique ne forme pas un groupe utile."}
          </p>
        )}
      </section>

      <section className="grid gap-3">
        <SectionHeading title="Affichage" />
        <div className="grid items-start gap-4 md:grid-cols-2">
          {plainGlobalFields.map(([field, fieldSpec]) => (
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
        {advancedGlobalFields.length > 0 && (
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
                {advancedGlobalFields.map(([field, fieldSpec]) => (
                  <Field
                    key={field}
                    id={`builder-${field}`}
                    spec={fieldSpec}
                    value={values[field] ?? spec.defaults[field]}
                    environment={{
                      allSlugs,
                      siblingValues: { ...spec.defaults, ...values },
                    }}
                    onChange={(value) => setGlobal(field, value as PropValue)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
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
            <AlertDialogTitle>
              Supprimer cet élément&nbsp;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cet élément contient du texte. Le supprimer effacera aussi son
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

// One managed child as a sortable card: its live identity and anchor slug, the
// default radio, reorder/delete actions, then its contextual fields. Drag
// mirrors the form builder; the arrows are its keyboard-reachable twin.
function ManagedChildRow({
  row,
  index,
  total,
  isDefault,
  colliding,
  childDesc,
  childDefaults,
  allSlugs,
  childLabel,
  anchorField,
  anchorLabel,
  onFieldChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  row: ManagedWrapperRow;
  index: number;
  total: number;
  isDefault: boolean;
  colliding: boolean;
  childDesc: ComponentDescriptor;
  childDefaults: PropDefaults;
  allSlugs: string[];
  childLabel: string;
  anchorField: string;
  anchorLabel: string;
  onFieldChange: (field: string, value: PropValue) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const anchorValue = String(row.values[anchorField] ?? "").trim();
  const slug = childAnchorSlug(row.values[anchorField]);
  const emptyLabel = `${childLabel} sans ${anchorLabel.toLocaleLowerCase("fr")}`;

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
          {anchorValue || (
            <span className="text-muted-foreground">{emptyLabel}</span>
          )}
          {slug && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              #{slug}
            </span>
          )}
        </span>
        {isDefault && (
          <span className="text-xs text-muted-foreground">Ouvert au départ</span>
        )}
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Monter : ${childLabel}`}
            disabled={index === 0}
            onClick={onMoveUp}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Descendre : ${childLabel}`}
            disabled={index === total - 1}
            onClick={onMoveDown}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Supprimer : ${childLabel}`}
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
          Renommez un élément pour que chacun soit identifiable par son ancre.
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
