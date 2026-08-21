"use client";

// Widgets of the six EntriesView descriptor field types (ADR 0018), part of
// the shared field renderer: view-picker tiles, form-field selectors whose
// options load through a Server Action from the sibling `form` value,
// field-rows (ordered field + editable title + optional icon), and the
// color/icon mappings pre-filled by the automatic palette. The map-view
// widget lives in map-view-input.tsx (Leaflet, client-only).

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
import { GripVertical, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listEntryFieldChoices, listFormChoices } from "@/modules/forms/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SELECT_NONE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/ui/icon";
import type { LiteralValue, StructuredValue } from "@/modules/authoring/descriptor";
import {
  type EntryFieldChoice,
  type FieldChoiceOption,
  autoColorMapping,
  fieldChoiceOptions,
  resolveColorMapping,
} from "@/modules/forms/entry-fields";
import type { FormFieldType } from "@/modules/forms/form-descriptor";
import type { PseudoField } from "@/modules/forms/pseudo-fields";
import { cn } from "@/lib/utils";
import { IconPicker } from "./icon-picker";

/* ------------------------------------------------------------------ *
 * Shared choice loading
 * ------------------------------------------------------------------ */

/** The sibling `form` value, whatever its written form (string or array). */
export function toFormSlugs(value: unknown): string[] {
  if (typeof value === "string") return value !== "" ? [value] : [];
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string" && item !== ""
    );
  }
  return [];
}

// Module-level caches, the <Icon> pattern: one fetch per key for the page's
// lifetime — the builder re-renders on every keystroke.
const choicesCache = new Map<string, Promise<EntryFieldChoice[]>>();

function loadFieldChoices(slugs: string[]): Promise<EntryFieldChoice[]> {
  const key = JSON.stringify(slugs);
  const cached = choicesCache.get(key);
  if (cached) return cached;
  const pending = listEntryFieldChoices(slugs);
  pending.catch(() => choicesCache.delete(key));
  choicesCache.set(key, pending);
  return pending;
}

/** The union field choices for the chosen forms; null while loading. */
export function useEntryFieldChoices(
  slugs: string[]
): EntryFieldChoice[] | null {
  // Effects key on the serialized list: the caller rebuilds the array on
  // every render, but the choices only change with its content. Loaded
  // results are stored per key, so switching forms shows "loading" (null)
  // without a synchronous state reset.
  const key = JSON.stringify(slugs);
  const [loaded, setLoaded] = useState<
    { key: string; choices: EntryFieldChoice[] } | null
  >(null);
  useEffect(() => {
    const keyedSlugs = JSON.parse(key) as string[];
    let live = true;
    const store = (choices: EntryFieldChoice[]) =>
      live && setLoaded({ key, choices });
    if (keyedSlugs.length === 0) {
      store([]);
    } else {
      loadFieldChoices(keyedSlugs).then(store).catch(() => store([]));
    }
    return () => {
      live = false;
    };
  }, [key]);
  return loaded?.key === key ? loaded.choices : null;
}

let formsCache: Promise<{ slug: string; name: string }[]> | null = null;

function useForms(): { slug: string; name: string }[] {
  const [forms, setForms] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    let live = true;
    (formsCache ??= listFormChoices()).then(
      (loaded) => live && setForms(loaded)
    );
    return () => {
      live = false;
    };
  }, []);
  return forms;
}

/** What the widgets need from the descriptor field (subset of FieldWidgetSpec). */
export interface EntryFieldRestriction {
  formFrom?: string;
  fieldTypes?: FormFieldType[];
  pseudoFields?: PseudoField[];
  required?: boolean;
  withIcon?: boolean;
  fieldFrom?: string;
}

function useChoiceOptions(
  spec: EntryFieldRestriction,
  siblingValues: Record<string, unknown> | undefined
): { options: FieldChoiceOption[]; loading: boolean; slugs: string[] } {
  const slugs = toFormSlugs(siblingValues?.[spec.formFrom ?? "form"]);
  const choices = useEntryFieldChoices(slugs);
  const options = useMemo(
    () => fieldChoiceOptions(choices ?? [], spec, slugs.length > 1),
    [choices, spec, slugs.length]
  );
  return { options, loading: choices === null, slugs };
}

/* ------------------------------------------------------------------ *
 * view-picker — tiles with icon + name (docs/entries-view.md)
 * ------------------------------------------------------------------ */

export function ViewPickerTiles({
  value,
  options,
  icons,
  onChange,
}: {
  value: string | undefined;
  options: Record<string, string>;
  icons?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    // 3×3 in a narrow modal; denser rows once the wide builder gives room.
    <div role="radiogroup" className="grid grid-cols-3 gap-2 md:grid-cols-5">
      {Object.entries(options).map(([optionValue, label]) => {
        const active = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(optionValue)}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 rounded-md border p-2.5 text-sm transition-colors [&_svg]:size-5",
              active
                ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {icons?.[optionValue] && <Icon id={icons[optionValue]} />}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * form-field — selector over the chosen forms' fields
 * ------------------------------------------------------------------ */

// « Aucun » stands for the empty string here: no caption field, no filter.
const NONE = SELECT_NONE;

function PartialBadge({ carriers }: { carriers?: string[] }) {
  if (!carriers) return null;
  return (
    <Badge variant="outline" className="ml-1 text-[10px] font-normal">
      {carriers.join(", ")}
    </Badge>
  );
}

export function EntryFieldSelect({
  id,
  spec,
  value,
  siblingValues,
  invalid,
  onChange,
}: {
  id: string;
  spec: EntryFieldRestriction;
  value: string | undefined;
  siblingValues?: Record<string, unknown>;
  invalid?: boolean;
  onChange: (value: string | undefined) => void;
}) {
  const { options, loading, slugs } = useChoiceOptions(spec, siblingValues);

  // Pre-fill (docs/entries-view.md): a required selector facing exactly one
  // candidate picks it — "the only image field", "the only date field".
  useEffect(() => {
    if (spec.required && !value && !loading && options.length === 1) {
      onChange(options[0].name);
    }
  }, [spec.required, value, loading, options, onChange]);

  const placeholder =
    slugs.length === 0
      ? "Choisir d'abord un formulaire…"
      : loading
        ? "Chargement…"
        : "Choisir un champ…";

  // « Aucun » emits "" (not undefined): an empty string survives as an
  // explicit prop when the field has a non-empty default (captionField=""
  // = no caption), and still omits itself when the default is empty too.
  return (
    <Select
      value={value === "" ? NONE : (value ?? "")}
      onValueChange={(picked) => onChange(picked === NONE ? "" : picked)}
    >
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {!spec.required && (
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">Aucun</span>
          </SelectItem>
        )}
        {options.map((option) => (
          <SelectItem key={option.name} value={option.name}>
            {option.label}
            <PartialBadge carriers={option.partialTo} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The multiple form-field: toggleable chips over the same choices. */
export function EntryFieldChips({
  spec,
  value,
  siblingValues,
  onChange,
}: {
  spec: EntryFieldRestriction;
  value: unknown;
  siblingValues?: Record<string, unknown>;
  onChange: (value: string[]) => void;
}) {
  const { options, slugs } = useChoiceOptions(spec, siblingValues);
  const selected = toFormSlugs(value);
  if (slugs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Choisir d&apos;abord un formulaire.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = selected.includes(option.name);
        return (
          <button
            key={option.name}
            type="button"
            aria-pressed={active}
            className="rounded-full"
            onClick={() =>
              onChange(
                active
                  ? selected.filter((name) => name !== option.name)
                  : [...selected, option.name]
              )
            }
          >
            <Badge
              variant={active ? "default" : "outline"}
              className="cursor-pointer"
            >
              {option.label}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * field-rows — ordered rows: field + in-place editable title (+ icon)
 * ------------------------------------------------------------------ */

export interface FieldRow {
  field: string;
  title?: string;
  icon?: string;
}

/** Narrows a structured prop value to rows (the shape propKindFits accepts). */
export function toFieldRows(value: unknown): FieldRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) return [];
    const { field, title, icon } = row as Record<string, unknown>;
    if (typeof field !== "string") return [];
    return [
      {
        field,
        ...(typeof title === "string" ? { title } : {}),
        ...(typeof icon === "string" ? { icon } : {}),
      },
    ];
  });
}

export function FieldRowsInput({
  spec,
  value,
  siblingValues,
  onChange,
}: {
  spec: EntryFieldRestriction;
  value: unknown;
  siblingValues?: Record<string, unknown>;
  onChange: (value: StructuredValue | undefined) => void;
}) {
  const { options, slugs } = useChoiceOptions(spec, siblingValues);
  const rows = toFieldRows(value);
  const sensors = useSensors(useSensor(PointerSensor));
  // Remounts the "add" select after each pick, so it shows its placeholder
  // again instead of the last added field.
  const [addKey, setAddKey] = useState(0);

  const labelOf = (field: string) =>
    options.find((option) => option.name === field)?.label ?? field;
  const remaining = options.filter(
    (option) => !rows.some((row) => row.field === option.name)
  );

  const emit = (next: FieldRow[]) =>
    onChange(next.length > 0 ? (next as unknown as StructuredValue) : undefined);

  const update = (index: number, patch: Partial<FieldRow>) => {
    const next = rows.map((row, i) => {
      if (i !== index) return row;
      const merged = { ...row, ...patch };
      // The identity motif (docs/entries-view.md): an emptied title, or one
      // equal to the field's label, re-derives — it is not stored.
      if (merged.title !== undefined) {
        const trimmed = merged.title.trim();
        if (trimmed === "" || trimmed === labelOf(merged.field)) {
          delete merged.title;
        }
      }
      if (merged.icon === undefined) delete merged.icon;
      return merged;
    });
    emit(next);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((row) => row.field === active.id);
    const to = rows.findIndex((row) => row.field === over.id);
    emit(arrayMove(rows, from, to));
  };

  return (
    <div className="grid gap-1.5">
      {rows.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={rows.map((row) => row.field)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-1.5">
              {rows.map((row, index) => (
                <SortableFieldRow
                  key={row.field}
                  row={row}
                  label={labelOf(row.field)}
                  withIcon={spec.withIcon}
                  onTitle={(title) => update(index, { title })}
                  onIcon={(icon) => update(index, { icon })}
                  onRemove={() => emit(rows.filter((_, i) => i !== index))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {remaining.length > 0 && (
        <Select
          key={addKey}
          value=""
          onValueChange={(picked) => {
            emit([...rows, { field: picked }]);
            setAddKey((current) => current + 1);
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-fit gap-1 border-dashed text-muted-foreground shadow-none"
          >
            <Plus className="size-3.5" aria-hidden />
            {slugs.length === 0 ? "Choisir d'abord un formulaire" : "Ajouter un champ"}
          </SelectTrigger>
          <SelectContent>
            {remaining.map((option) => (
              <SelectItem key={option.name} value={option.name}>
                {option.label}
                <PartialBadge carriers={option.partialTo} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function SortableFieldRow({
  row,
  label,
  withIcon,
  onTitle,
  onIcon,
  onRemove,
}: {
  row: FieldRow;
  label: string;
  withIcon?: boolean;
  onTitle: (title: string) => void;
  onIcon: (icon: string | undefined) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.field });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1.5 rounded-md border bg-background p-1.5",
        isDragging && "z-10 shadow-md"
      )}
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground/60 hover:text-foreground"
        aria-label={`Réordonner «\u00A0${label}\u00A0»`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <Input
          value={row.title ?? label}
          aria-label={`Titre affiché pour «\u00A0${label}\u00A0»`}
          className="h-7 border-transparent px-1.5 text-sm shadow-none hover:border-input focus-visible:border-input"
          onChange={(event) => onTitle(event.target.value)}
        />
        <span className="px-1.5 font-mono text-[10px] text-muted-foreground">
          {row.field}
        </span>
      </div>
      {withIcon && (
        <span className="[&>button]:h-7 [&>button]:px-2">
          <IconPicker
            id={`row-icon-${row.field}`}
            value={row.icon}
            onChange={onIcon}
          />
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground"
        aria-label={`Retirer «\u00A0${label}\u00A0»`}
        onClick={onRemove}
      >
        <X className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * color-mapping / icon-mapping — one row per option of the source field
 * ------------------------------------------------------------------ */

/** Narrows a structured prop value to a string → string mapping. */
export function toMapping(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

// The options of the field the mapping colors: the sibling form-field's
// selected field — or, for $form, the chosen forms themselves.
function useMappingOptions(
  spec: EntryFieldRestriction,
  siblingValues: Record<string, unknown> | undefined
): Record<string, string> {
  const slugs = toFormSlugs(siblingValues?.[spec.formFrom ?? "form"]);
  const sourceField = siblingValues?.[spec.fieldFrom ?? ""];
  const choices = useEntryFieldChoices(slugs);
  const forms = useForms();
  const key = JSON.stringify(slugs);
  return useMemo(() => {
    if (sourceField === "$form") {
      return Object.fromEntries(
        (JSON.parse(key) as string[]).map((slug) => [
          slug,
          forms.find((form) => form.slug === slug)?.name ?? slug,
        ])
      );
    }
    const choice = choices?.find((entry) => entry.name === sourceField);
    return choice?.options ?? {};
  }, [sourceField, choices, forms, key]);
}

export function ColorMappingInput({
  spec,
  value,
  siblingValues,
  onChange,
}: {
  spec: EntryFieldRestriction;
  value: unknown;
  siblingValues?: Record<string, unknown>;
  onChange: (value: StructuredValue | undefined) => void;
}) {
  const options = useMappingOptions(spec, siblingValues);
  const optionValues = Object.keys(options);
  const overrides = toMapping(value);
  const resolved = resolveColorMapping(optionValues, overrides);
  const automatic = autoColorMapping(optionValues);

  // Only the overrides are stored (docs/entries-view.md): the automatic
  // palette is recomputed identically at render, keeping the MDX minimal.
  const setColor = (optionValue: string, color: string) => {
    const next = { ...resolved, [optionValue]: color };
    const diff = Object.fromEntries(
      Object.entries(next).filter(
        ([key, entry]) => automatic[key] !== entry
      )
    );
    onChange(Object.keys(diff).length > 0 ? diff : undefined);
  };

  if (optionValues.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Les couleurs se règlent une fois le champ choisi.
      </p>
    );
  }
  return (
    <div className="grid gap-1.5">
      {optionValues.map((optionValue) => (
        <label
          key={optionValue}
          className="flex items-center gap-2 text-sm font-normal"
        >
          <input
            type="color"
            value={resolved[optionValue]}
            onChange={(event) => setColor(optionValue, event.target.value)}
            className="size-6 cursor-pointer rounded border bg-transparent p-0.5"
          />
          {options[optionValue]}
          {overrides[optionValue] !== undefined && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                const rest = Object.fromEntries(
                  Object.entries(overrides).filter(([key]) => key !== optionValue)
                );
                onChange(Object.keys(rest).length > 0 ? rest : undefined);
              }}
            >
              auto
            </button>
          )}
        </label>
      ))}
    </div>
  );
}

export function IconMappingInput({
  spec,
  value,
  siblingValues,
  onChange,
}: {
  spec: EntryFieldRestriction;
  value: unknown;
  siblingValues?: Record<string, unknown>;
  onChange: (value: StructuredValue | undefined) => void;
}) {
  const options = useMappingOptions(spec, siblingValues);
  const mapping = toMapping(value);

  const setIcon = (optionValue: string, icon: string | undefined) => {
    const next: Record<string, LiteralValue> = { ...mapping };
    if (icon === undefined) delete next[optionValue];
    else next[optionValue] = icon;
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  if (Object.keys(options).length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Les icônes se règlent une fois le champ choisi.
      </p>
    );
  }
  return (
    <div className="grid gap-1.5">
      {Object.entries(options).map(([optionValue, label]) => (
        <div key={optionValue} className="flex items-center gap-2 text-sm">
          <span className="[&>button]:h-7 [&>button]:px-2">
            <IconPicker
              id={`icon-mapping-${optionValue}`}
              value={mapping[optionValue]}
              onChange={(icon) => setIcon(optionValue, icon)}
            />
          </span>
          {label}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * form-list multiple — one selector, then an add action per extra form
 * ------------------------------------------------------------------ */

export function MultiFormListInput({
  id,
  value,
  invalid,
  onChange,
}: {
  id: string;
  value: unknown;
  invalid?: boolean;
  onChange: (value: string | string[] | undefined) => void;
}) {
  const forms = useForms();
  const slugs = toFormSlugs(value);
  // Empty selectors appended by the add action live here, not in the prop:
  // the value only ever holds picked forms. The single-form case (95 %) sees
  // one plain select — adding is a action, not a mode (docs/entries-view.md).
  const [pendingRows, setPendingRows] = useState(0);
  const shown = [...slugs, ...Array<string>(Math.max(pendingRows, slugs.length === 0 ? 1 : 0)).fill("")];

  const emit = (next: string[]) => {
    const cleaned = next.filter((slug) => slug !== "");
    onChange(
      cleaned.length === 0
        ? undefined
        : cleaned.length === 1
          ? cleaned[0]
          : cleaned
    );
  };

  return (
    <div className="grid gap-1.5">
      {shown.map((slug, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Select
            value={slug !== "" ? slug : undefined}
            onValueChange={(picked) => {
              if (slug === "") setPendingRows((current) => Math.max(0, current - 1));
              emit(shown.map((current, i) => (i === index ? picked : current)));
            }}
          >
            <SelectTrigger
              id={index === 0 ? id : undefined}
              className="w-full"
              aria-invalid={invalid && slug === ""}
            >
              <SelectValue placeholder="Choisir un formulaire…" />
            </SelectTrigger>
            <SelectContent>
              {forms
                .filter(
                  (form) => form.slug === slug || !slugs.includes(form.slug)
                )
                .map((form) => (
                  <SelectItem key={form.slug} value={form.slug}>
                    {form.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {shown.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label="Retirer ce formulaire"
              onClick={() => {
                if (slug === "") setPendingRows((current) => Math.max(0, current - 1));
                else emit(slugs.filter((current) => current !== slug));
              }}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          )}
        </div>
      ))}
      {shown.every((slug) => slug !== "") && forms.length > slugs.length && (
        <button
          type="button"
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setPendingRows((current) => current + 1)}
        >
          <Plus className="size-3.5" aria-hidden />
          Ajouter les fiches d&apos;un autre formulaire
        </button>
      )}
    </div>
  );
}
