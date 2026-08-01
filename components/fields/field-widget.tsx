"use client";

// Shared field renderer (ADR 0015): the typed-field widgets consumed by two
// envelopes — the ComponentBuilder modal (descriptor YAML → MDX props) and
// the entry form (descriptor JSON → entry data). The entry vocabulary is a
// superset of the component one; every new widget benefits both.

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { listFormChoices } from "@/app/form-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  type FieldType,
  type FileFamily,
  type PropValue,
  propKindFits,
} from "@/lib/component-descriptor";
import type { FormFieldType } from "@/lib/form-descriptor";
import type { AccessRule, AclDirectory, AclFloor } from "@/lib/permissions";
import type { PseudoField } from "@/lib/pseudo-fields";
import { isExternalHref } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { AclInput } from "./acl-input";
import {
  ColorMappingInput,
  EntryFieldChips,
  EntryFieldSelect,
  FieldRowsInput,
  IconMappingInput,
  MultiFormListInput,
  ViewPickerTiles,
} from "./entries-view-inputs";
import { IconPicker } from "./icon-picker";
import type { MapViewValue } from "./map-view-input";
import { TagsInput } from "./tags-input";
import { UploadInput } from "./upload-input";
import { useDebouncedJson } from "./use-debounced-json";

// Leaflet touches window at import time: the map widgets load client-only.
const GeolocationInput = dynamic(
  () => import("./geolocation-input").then((mod) => mod.GeolocationInput),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-md border bg-muted/40" />
    ),
  }
);

const MapViewInput = dynamic(
  () => import("./map-view-input").then((mod) => mod.MapViewInput),
  {
    ssr: false,
    loading: () => (
      <div className="h-52 animate-pulse rounded-md border bg-muted/40" />
    ),
  }
);

export type WidgetType = FieldType | FormFieldType;

// Flat superset of what a widget needs to render, whichever descriptor kind
// it comes from. Envelopes adapt: a component DescriptorField is assignable
// as-is; a FormField resolves its options source first (a form-sourced field
// arrives as plain value → label pairs).
export interface FieldWidgetSpec {
  type: WidgetType;
  label: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  /** list/radio/multiChoice/view-picker: value → display label. */
  options?: Record<string, string>;
  /** view-picker: value → Iconify icon shown on the tile. */
  icons?: Record<string, string>;
  /** file-list: restricts the combobox to one family (ADR 0012). */
  family?: FileFamily;
  /** form-list/form-field: one name, or an array of names (ADR 0019). */
  multiple?: boolean;
  /** form-field/field-rows: sibling field holding the chosen form slug(s). */
  formFrom?: string;
  /** form-field/field-rows: restrict the selectable fields to these types. */
  fieldTypes?: FormFieldType[];
  /** form-field/field-rows: pseudo-fields offered next to the real fields. */
  pseudoFields?: PseudoField[];
  /** field-rows: each row also carries an optional icon. */
  withIcon?: boolean;
  /** color-mapping/icon-mapping: sibling form-field the options come from. */
  fieldFrom?: string;
  subtype?: "text" | "number";
  maxLength?: number;
  rows?: number;
  initTodayButton?: boolean;
  fillingMode?: "normal" | "tags" | "dragAndDrop";
  /** geolocation: bindings to the form's address fields + locate button. */
  streetField?: string;
  street1Field?: string;
  street2Field?: string;
  postalCodeField?: string;
  townField?: string;
  countyField?: string;
  stateField?: string;
  geolocateButton?: boolean;
  /** customContent: admin-written MDX shown in the entry form. */
  entryContent?: string;
}

/** What a widget can hold: component props stay scalar, entry values go richer. */
export type FieldValue =
  | PropValue
  | string[]
  | { lat: number; lng: number }
  | AccessRule;

/** Ambient data some widgets list from (injected by the envelope). */
export interface FieldEnvironment {
  /** Wiki page slugs, for page-list suggestions. */
  allSlugs?: string[];
  /** Existing forms, for the form-list selector. */
  forms?: { slug: string; name: string }[];
  /** Live sibling entry values, for geocoding bound address fields. */
  entryValues?: Record<string, unknown>;
  // Live sibling builder values (defaults included), for the widgets whose
  // options depend on another field of the same modal — form-field reading
  // `formFrom`, mappings reading `fieldFrom` (ADR 0018).
  siblingValues?: Record<string, unknown>;
  /** Who an `acl` list may name: the people and groups of the wiki. */
  directory?: AclDirectory;
  /** Who an `acl` list always allows, whatever it holds: the subject's floor. */
  aclFloor?: AclFloor;
}

const EMPTY_ENVIRONMENT: FieldEnvironment = {};

// One labeled field: label + widget + hint (+ validation error). The shell
// shared by both envelopes; dividers and checkboxes carry their own layout.
export function Field({
  id,
  spec,
  value,
  onChange,
  error,
  environment = EMPTY_ENVIRONMENT,
}: {
  id: string;
  spec: FieldWidgetSpec;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  error?: string;
  environment?: FieldEnvironment;
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
      <div>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          {spec.label}
          {spec.required && <RequiredMark />}
        </Label>
        <FieldHint hint={spec.hint} />
        <FieldError error={error} />
      </div>
    );
  }

  // Spacing reads as one unit: the label sits closer to its control than the
  // controls sit to each other, and the hint hugs the control it describes.
  return (
    <div>
      <Label htmlFor={id} className="mb-2">
        {spec.label}
        {spec.required && <RequiredMark />}
      </Label>
      <FieldWidget
        id={id}
        spec={spec}
        value={value}
        onChange={onChange}
        invalid={error !== undefined}
        environment={environment}
      />
      <FieldHint hint={spec.hint} />
      <FieldError error={error} />
    </div>
  );
}

/** The bare control for a field type, without label/hint chrome. */
export function FieldWidget({
  id,
  spec,
  value,
  onChange,
  invalid,
  environment = EMPTY_ENVIRONMENT,
}: {
  id: string;
  spec: FieldWidgetSpec;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  invalid?: boolean;
  environment?: FieldEnvironment;
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
          <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
            <SelectValue placeholder={spec.placeholder} />
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
    case "radio":
      return spec.fillingMode === "tags" ? (
        <ChoiceChips
          options={spec.options ?? {}}
          selected={typeof value === "string" ? [value] : []}
          onToggle={(optionValue, active) => onChange(active ? optionValue : "")}
        />
      ) : (
        <RadioGroup
          value={typeof value === "string" ? value : ""}
          onValueChange={onChange}
          aria-invalid={invalid}
        >
          {Object.entries(spec.options ?? {}).map(([optionValue, label]) => (
            <Label key={optionValue} className="flex items-center gap-2 font-normal">
              <RadioGroupItem value={optionValue} />
              {label}
            </Label>
          ))}
        </RadioGroup>
      );
    case "multiChoice": {
      const selected = toStringArray(value);
      const toggle = (optionValue: string, active: boolean) =>
        onChange(
          active
            ? [...selected, optionValue]
            : selected.filter((item) => item !== optionValue)
        );
      return spec.fillingMode === "tags" ? (
        <ChoiceChips
          options={spec.options ?? {}}
          selected={selected}
          onToggle={toggle}
        />
      ) : (
        <div className="grid gap-2" aria-invalid={invalid}>
          {Object.entries(spec.options ?? {}).map(([optionValue, label]) => (
            <Label key={optionValue} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={selected.includes(optionValue)}
                onCheckedChange={(checked) => toggle(optionValue, checked === true)}
              />
              {label}
            </Label>
          ))}
        </div>
      );
    }
    case "number":
      return (
        <Input
          id={id}
          type="number"
          value={typeof value === "number" ? value : ""}
          aria-invalid={invalid}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? undefined : Number(event.target.value)
            )
          }
        />
      );
    case "date":
      return (
        <DateInput
          id={id}
          value={typeof value === "string" ? value : ""}
          initTodayButton={spec.initTodayButton}
          invalid={invalid}
          onChange={onChange}
        />
      );
    case "textarea":
      return (
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          rows={spec.rows ?? 4}
          maxLength={spec.maxLength}
          placeholder={spec.placeholder}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "page-list":
      return (
        <PageListInput
          id={id}
          value={typeof value === "string" ? value : ""}
          allSlugs={environment.allSlugs ?? []}
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
    case "image":
    case "file":
      return (
        <UploadInput
          id={id}
          value={typeof value === "string" ? value : ""}
          kind={spec.type}
          invalid={invalid}
          onChange={onChange}
        />
      );
    case "geolocation":
      return (
        <GeolocationInput
          value={isGeoPoint(value) ? value : undefined}
          bindings={spec}
          geolocateButton={spec.geolocateButton}
          entryValues={environment.entryValues}
          onChange={(point) => onChange(point)}
        />
      );
    case "tags":
      return (
        <TagsInput
          tags={toStringArray(value)}
          onChange={onChange}
        />
      );
    case "customContent":
      // Admin-written MDX, rendered by the sandboxed pipeline — the same
      // bare-page service the ComponentBuilder preview uses.
      return spec.entryContent ? (
        <iframe
          src={`/api/render?source=${encodeURIComponent(spec.entryContent)}`}
          title={spec.label}
          className="min-h-28 w-full rounded-md border bg-background"
        />
      ) : null;
    case "form-list":
      return spec.multiple ? (
        <MultiFormListInput
          id={id}
          value={value}
          invalid={invalid}
          onChange={onChange}
        />
      ) : (
        <FormListInput
          id={id}
          value={typeof value === "string" ? value : ""}
          forms={environment.forms}
          invalid={invalid}
          onChange={onChange}
        />
      );
    case "view-picker":
      return (
        <ViewPickerTiles
          value={typeof value === "string" ? value : undefined}
          options={spec.options ?? {}}
          icons={spec.icons}
          onChange={onChange}
        />
      );
    case "form-field":
      return spec.multiple ? (
        <EntryFieldChips
          spec={spec}
          value={value}
          siblingValues={environment.siblingValues}
          onChange={onChange}
        />
      ) : (
        <EntryFieldSelect
          id={id}
          spec={spec}
          value={typeof value === "string" ? value : undefined}
          siblingValues={environment.siblingValues}
          invalid={invalid}
          onChange={onChange}
        />
      );
    case "field-rows":
      return (
        <FieldRowsInput
          spec={spec}
          value={value}
          siblingValues={environment.siblingValues}
          onChange={onChange}
        />
      );
    case "color-mapping":
      return (
        <ColorMappingInput
          spec={spec}
          value={value}
          siblingValues={environment.siblingValues}
          onChange={onChange}
        />
      );
    case "icon-mapping":
      return (
        <IconMappingInput
          spec={spec}
          value={value}
          siblingValues={environment.siblingValues}
          onChange={onChange}
        />
      );
    case "map-view":
      return (
        <MapViewInput
          value={isMapView(value) ? value : undefined}
          onChange={onChange}
        />
      );
    case "acl":
      return (
        <AclInput
          id={id}
          value={asRule(value)}
          directory={environment.directory}
          onChange={onChange}
        />
      );
    // text-like inputs: text (and its number subtype), url, email, title.
    default:
      return (
        <Input
          id={id}
          type={inputType(spec)}
          value={
            typeof value === "string" || typeof value === "number" ? value : ""
          }
          maxLength={spec.maxLength}
          placeholder={spec.placeholder}
          aria-invalid={invalid}
          onChange={(event) => {
            if (inputType(spec) === "number") {
              onChange(
                event.target.value === ""
                  ? undefined
                  : Number(event.target.value)
              );
            } else {
              onChange(
                event.target.value === "" ? undefined : event.target.value
              );
            }
          }}
        />
      );
  }
}

// Narrowers over FieldValue, which now spans the structured literals of
// ADR 0019: widgets only take what they can display.
function toStringArray(value: FieldValue): string[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter(
    (item): item is string => typeof item === "string"
  );
}

function isGeoPoint(value: FieldValue): value is { lat: number; lng: number } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { lat?: unknown }).lat === "number" &&
    typeof (value as { lng?: unknown }).lng === "number"
  );
}

function isMapView(value: FieldValue): value is MapViewValue {
  return isGeoPoint(value) && typeof (value as { zoom?: unknown }).zoom === "number";
}

// An empty widget starts on the narrowest scope, so an author who says
// nothing has said « le propriétaire et les administrateurs seulement » —
// the one starting point a forgotten field cannot open the wiki with.
function asRule(value: FieldValue): AccessRule {
  return propKindFits("rule", value)
    ? (value as unknown as AccessRule)
    : { scope: "restricted" };
}

function inputType(spec: FieldWidgetSpec): string {
  if (spec.type === "url") return "url";
  if (spec.type === "email") return "email";
  if (spec.type === "text" && spec.subtype === "number") return "number";
  return "text";
}

// Clickable chips, the `tags` filling mode of radio (single) and
// multiChoice (multiple) — docs/forms.md.
function ChoiceChips({
  options,
  selected,
  onToggle,
}: {
  options: Record<string, string>;
  selected: string[];
  onToggle: (value: string, active: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(options).map(([optionValue, label]) => {
        const active = selected.includes(optionValue);
        return (
          <button
            key={optionValue}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(optionValue, !active)}
            className="rounded-full"
          >
            <Badge variant={active ? "default" : "outline"} className="cursor-pointer">
              {label}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

// shadcn datepicker over an ISO yyyy-mm-dd storage (docs/forms.md).
function DateInput({
  id,
  value,
  initTodayButton,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  initTodayButton?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const setDate = (date: Date | undefined) =>
    onChange(date ? format(date, "yyyy-MM-dd") : "");

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid}
            className={cn(
              "w-52 justify-start font-normal",
              !selected && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="size-4" aria-hidden />
            {selected
              ? format(selected, "d MMMM yyyy", { locale: fr })
              : "Choisir une date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={fr}
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              setDate(date);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {initTodayButton && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDate(new Date())}
        >
          Aujourd&apos;hui
        </Button>
      )}
    </div>
  );
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
    value.trim() === "" || isExternalHref(value.trim())
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

// Selector over the existing forms (docs/forms.md). Self-fetches through the
// Server Action when the envelope doesn't inject the list (the ComponentBuilder
// path), the same self-loading spirit as file-list.
function FormListInput({
  id,
  value,
  forms,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  forms?: { slug: string; name: string }[];
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const [loaded, setLoaded] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    if (forms) return;
    let live = true;
    listFormChoices().then((choices) => live && setLoaded(choices));
    return () => {
      live = false;
    };
  }, [forms]);
  const choices = forms ?? loaded;

  return (
    <Select
      value={value !== "" ? value : undefined}
      onValueChange={onChange}
    >
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder="Choisir un formulaire…" />
      </SelectTrigger>
      <SelectContent>
        {choices.map((form) => (
          <SelectItem key={form.slug} value={form.slug}>
            {form.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  return <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>;
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="mt-1.5 text-xs text-destructive">{error}</p>;
}
