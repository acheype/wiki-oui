"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Field } from "@/modules/forms/field-widget";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type DescriptorField,
  type PropValue,
  type PropValues,
  type Range,
  emitsMarkdownLink,
  generateMarkdownLink,
  generateTag,
  isEmpty,
  visibleFields,
} from "@/lib/component-descriptor";
import type { ComponentBuilderSpec } from "@/lib/component-descriptors";

// The ComponentBuilder modal (docs/component-builder.md): fully generated
// from a descriptor + the component's exported defaults — preview on top
// (real pipeline via GET /api/render), fields below, advanced ones folded.
// The widgets themselves live in the shared field renderer (ADR 0015).

export type BuilderState = {
  values: PropValues;
  unknownAttributes: string[];
};

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
  return { values, unknownAttributes: [] };
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
            <BuilderForm
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
      <p className="font-mono text-xs text-muted-foreground">{source}</p>
    </div>
  );
}
