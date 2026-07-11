"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  type DescriptorField,
  type FileFamily,
  type PropValue,
  type PropValues,
  emitsMarkdownLink,
  generateMarkdownLink,
  generateTag,
  isEmpty,
  visibleFields,
} from "@/lib/component-descriptor";
import type { ComponentBuilderSpec } from "@/lib/component-descriptors";
import { IconPicker } from "./icon-picker";
import { useDebouncedJson } from "./use-debounced-json";

// The ComponentBuilder modal (docs/component-builder.md): fully generated
// from a descriptor + the component's exported defaults — preview on top
// (real pipeline via GET /api/render), fields below, advanced ones folded.

export type BuilderState = {
  values: PropValues;
  unknownAttributes: string[];
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
  spec,
  mode,
  initial,
  allSlugs,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: ComponentBuilderSpec | null;
  mode: "insert" | "edit";
  initial: BuilderState | null;
  allSlugs: string[];
  onSubmit: (tag: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {spec && (
          <>
            <DialogHeader>
              <DialogTitle>
                {mode === "edit"
                  ? `Modifier « ${spec.descriptor.label} »`
                  : `Insérer « ${spec.descriptor.label} »`}
              </DialogTitle>
              {spec.descriptor.description && (
                <DialogDescription>
                  {spec.descriptor.description}
                </DialogDescription>
              )}
            </DialogHeader>
            {/* Keyed on open so every opening starts from a fresh form. */}
            <BuilderForm
              key={String(open)}
              spec={spec}
              mode={mode}
              initial={initial ?? insertionState(spec)}
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

  const setValue = (field: string, value: PropValue) =>
    setValues((current) => ({ ...current, [field]: value }));

  const renderField = ([field, descriptorField]: [string, DescriptorField]) => (
    <BuilderField
      key={field}
      id={`builder-${field}`}
      spec={descriptorField}
      value={values[field] ?? spec.defaults[field]}
      allSlugs={allSlugs}
      onChange={(value) => setValue(field, value)}
    />
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

      {plainFields.map(renderField)}

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
          {advancedOpen && advancedFields.map(renderField)}
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

/* ------------------------------------------------------------------ *
 * Field renderers, one per descriptor field type.
 * ------------------------------------------------------------------ */

function BuilderField({
  id,
  spec,
  value,
  allSlugs,
  onChange,
}: {
  id: string;
  spec: DescriptorField;
  value: PropValue;
  allSlugs: string[];
  onChange: (value: PropValue) => void;
}) {
  if (spec.type === "divider") {
    // A ⚠️-prefixed divider is a conditional notice, not a section title.
    if (spec.label.startsWith("⚠️")) {
      return (
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
          {spec.label}
        </p>
      );
    }
    return (
      <div className="mt-1 grid gap-1">
        <p className="text-sm font-medium">{spec.label}</p>
        <Separator />
      </div>
    );
  }

  if (spec.type === "checkbox") {
    return (
      <div className="grid gap-1.5">
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          {spec.label}
          {spec.required && <RequiredMark />}
        </Label>
        <FieldHint hint={spec.hint} />
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {spec.label}
        {spec.required && <RequiredMark />}
      </Label>
      <FieldControl
        id={id}
        spec={spec}
        value={value}
        allSlugs={allSlugs}
        onChange={onChange}
      />
      <FieldHint hint={spec.hint} />
    </div>
  );
}

function FieldControl({
  id,
  spec,
  value,
  allSlugs,
  onChange,
}: {
  id: string;
  spec: DescriptorField;
  value: PropValue;
  allSlugs: string[];
  onChange: (value: PropValue) => void;
}) {
  switch (spec.type) {
    case "icon":
      return (
        <IconPicker
          id={id}
          value={typeof value === "string" ? value : undefined}
          onChange={onChange}
        />
      );
    case "list":
      return (
        <Select
          value={typeof value === "string" ? value : undefined}
          onValueChange={onChange}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(spec.options ?? {}).map(([optionValue, label]) => (
              <SelectItem key={optionValue} value={optionValue}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "number":
      return (
        <Input
          id={id}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? undefined : Number(event.target.value)
            )
          }
        />
      );
    case "page-list":
      return (
        <PageListInput
          id={id}
          value={typeof value === "string" ? value : ""}
          allSlugs={allSlugs}
          onChange={onChange}
        />
      );
    case "file-list":
      return (
        <FileListInput
          id={id}
          value={typeof value === "string" ? value : ""}
          family={spec.family}
          onChange={onChange}
        />
      );
    // text and url fields share a plain input.
    default:
      return (
        <Input
          id={id}
          type={spec.type === "url" ? "url" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : event.target.value)
          }
        />
      );
  }
}

// Input + suggestion chips, shared by page-list and file-list: free text
// stays accepted, candidates are suggested while typing.
function SuggestionInput({
  id,
  value,
  placeholder,
  candidates,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  candidates: string[];
  onChange: (value: PropValue) => void;
}) {
  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    return candidates
      .filter((name) => name.includes(query) && name !== query)
      .slice(0, 6);
  }, [value, candidates]);

  return (
    <>
      <Input
        id={id}
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : event.target.value)
        }
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((name) => (
            <Button
              key={name}
              type="button"
              variant="secondary"
              size="sm"
              className="h-6 rounded-full px-2 font-mono text-xs"
              onClick={() => onChange(name)}
            >
              {name}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}

const NO_CANDIDATES: string[] = [];

// Wiki pages (ADR 0006): no suggestions on an empty query or an external URL.
function PageListInput({
  id,
  value,
  allSlugs,
  onChange,
}: {
  id: string;
  value: string;
  allSlugs: string[];
  onChange: (value: PropValue) => void;
}) {
  const candidates =
    value.trim() === "" || /^https?:\/\//.test(value.trim())
      ? NO_CANDIDATES
      : allSlugs;
  return (
    <SuggestionInput
      id={id}
      value={value}
      placeholder="ma-page ou https://…"
      candidates={candidates}
      onChange={onChange}
    />
  );
}

// Combobox over the uploaded-files library (files/ directory, ADR 0012),
// filterable by family.
function FileListInput({
  id,
  value,
  family,
  onChange,
}: {
  id: string;
  value: string;
  family?: FileFamily;
  onChange: (value: PropValue) => void;
}) {
  const data = useDebouncedJson<{ files: { name: string }[] }>(
    `/api/files${family ? `?family=${family}` : ""}`,
    0
  );
  const files = useMemo(
    () => data?.files.map((file) => file.name) ?? NO_CANDIDATES,
    [data]
  );

  return (
    <SuggestionInput
      id={id}
      value={value}
      placeholder="nom-du-fichier.ext"
      candidates={files}
      onChange={onChange}
    />
  );
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  );
}

function FieldHint({ hint }: { hint?: string }) {
  if (!hint) return null;
  return <p className="text-xs text-muted-foreground">{hint}</p>;
}
