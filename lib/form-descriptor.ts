// Form descriptor engine (docs/forms.md, ADR 0014/0015): pure logic around
// Form.schema, the JSON written by the FormBuilder. Zod meta-schema for the
// shape, imperative cross rules with targeted French messages (they surface
// in the FormBuilder on save), and the field-reference vocabulary shared by
// the automatic title and the entry template.

import { z } from "zod";
import { SCOPES } from "./permissions";
import { SLUG_PATTERN } from "./slug";

/** Palette of the 14 entry field types (docs/forms.md). */
export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "url",
  "date",
  "list",
  "radio",
  "multiChoice",
  "image",
  "file",
  "geolocation",
  "tags",
  "customContent",
  "title",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** Palette entry: the French label the FormBuilder shows for each type. */
export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Texte court",
  textarea: "Texte long",
  email: "Email",
  url: "Url",
  date: "Champ date",
  list: "Liste déroulante",
  radio: "Boutons radio",
  multiChoice: "Cases à cocher",
  image: "Image",
  file: "Upload de fichier",
  geolocation: "Géolocalisation",
  tags: "Mots-clés",
  customContent: "Custom html/wiki",
  title: "Titre de la fiche",
};

// One right as the `acl` widget poses it and as the descriptor stores it:
// usernames and group slugs, never ids (ADR 0024). Shape only, like the
// fields below — a name that has since gone is dropped when the default is
// copied (ADR 0026), not refused at read, or a deleted account would shut its
// form out of the very screen where the mistake gets fixed.
// Readonly, so that what the descriptor holds and what `AccessRule` describes
// are one type: the wiki's own defaults are written `as const` in
// wiki.config.ts, and a mutable array would refuse the very copy ADR 0026 is
// about.
const accessRuleSchema = z.object({
  scope: z.enum(SCOPES),
  usernames: z.array(z.string()).readonly().optional(),
  groupSlugs: z.array(z.string()).readonly().optional(),
});

// Common trunk (docs/forms.md): label · name (fixed identity, ADR 0014) ·
// required · hint; placeholder on text-like types only. Plus the two rights
// a field poses on itself (docs/permissions.md § Champ), on every type
// alike: a salary is a text field, an internal note a long one — what makes
// them worth restricting is never their type.
const fieldBase = z.object({
  label: z.string(),
  // Shape only: the slug format is an authoring rule (formAuthoringIssues),
  // not a parsing one. Refusing it here would make the message a raw Zod
  // path — and it fires before every other check, so an empty label, which
  // derives an empty identifier, could only ever be reported as a malformed
  // descriptor. The read path stays permissive, saveForm stays strict.
  name: z.string(),
  required: z.boolean().optional(),
  hint: z.string().optional(),
  /** Absent means unrestricted: a field is open until a rule says otherwise. */
  readAcl: accessRuleSchema.optional(),
  writeAcl: accessRuleSchema.optional(),
});

const textLikeBase = fieldBase.extend({
  placeholder: z.string().optional(),
});

// Options fields (list/radio/multiChoice) draw from exactly one source —
// entered pairs (value → label) or the entries of a form (sourceFormId holds
// the form slug, the user-facing id). Exclusivity is a cross rule below.
const optionsBase = fieldBase.extend({
  options: z.record(z.string(), z.string()).optional(),
  sourceFormId: z.string().optional(),
  defaultValue: z.string().optional(),
});

const formFieldSchema = z.discriminatedUnion("type", [
  textLikeBase.extend({
    type: z.literal("text"),
    subtype: z.enum(["text", "number"]).optional(),
    maxLength: z.number().int().positive().optional(),
    pattern: z.string().optional(),
    defaultValue: z.string().optional(),
  }),
  textLikeBase.extend({
    type: z.literal("textarea"),
    rows: z.number().int().positive().optional(),
    defaultValue: z.string().optional(),
    /** The value is rendered as MDX — admin opt-in (docs/forms.md). */
    allowMdx: z.boolean().optional(),
  }),
  textLikeBase.extend({ type: z.literal("email") }),
  textLikeBase.extend({ type: z.literal("url") }),
  fieldBase.extend({
    type: z.literal("date"),
    initTodayButton: z.boolean().optional(),
  }),
  optionsBase.extend({ type: z.literal("list") }),
  optionsBase.extend({
    type: z.literal("radio"),
    fillingMode: z.enum(["normal", "tags"]).optional(),
  }),
  optionsBase.extend({
    type: z.literal("multiChoice"),
    fillingMode: z.enum(["normal", "tags", "dragAndDrop"]).optional(),
    defaultValue: z.array(z.string()).optional(),
  }),
  fieldBase.extend({
    type: z.literal("image"),
    resizeWidth: z.number().int().positive().optional(),
    resizeHeight: z.number().int().positive().optional(),
  }),
  fieldBase.extend({ type: z.literal("file") }),
  fieldBase.extend({
    type: z.literal("geolocation"),
    // Bindings to the form's address fields, feeding Nominatim geocoding.
    streetField: z.string().optional(),
    street1Field: z.string().optional(),
    street2Field: z.string().optional(),
    postalCodeField: z.string().optional(),
    townField: z.string().optional(),
    countyField: z.string().optional(),
    stateField: z.string().optional(),
    geolocateButton: z.boolean().optional(),
  }),
  // A list of free keywords, stored in `data` like any other value. Nothing
  // to do with the tags of the Page it is written on (ADR 0007): the two
  // share an input widget and a look, and no more (docs/forms.md).
  fieldBase.extend({ type: z.literal("tags") }),
  fieldBase.extend({
    type: z.literal("customContent"),
    /** MDX shown in the entry form, admin-written, sandbox-rendered. */
    entryContent: z.string().optional(),
    /** MDX shown in the rendered entry. */
    displayContent: z.string().optional(),
  }),
  fieldBase.extend({
    type: z.literal("title"),
    // The title field's name is the fixed target of `# {title}` templates.
    name: z.literal("title"),
    automatic: z.boolean().optional(),
    /** Automatic mode: free text mixing {champ} references, recomputed on save. */
    template: z.string().optional(),
  }),
]);

export const formDescriptorSchema = z.object({
  fields: z.array(formFieldSchema),
  /**
   * The « Accès » tab (docs/permissions.md § Formulaire : trois réglages,
   * pas deux). Optional: a form saved before the tab existed carries none,
   * and lib/form-rights.ts answers for it with the wiki's own defaults —
   * exactly what would have been copied at its creation.
   */
  permissions: z
    .object({
      createEntry: accessRuleSchema,
      defaultEntryRead: accessRuleSchema,
      defaultEntryWrite: accessRuleSchema,
    })
    .optional(),
});

export type FormField = z.infer<typeof formFieldSchema>;
export type FormDescriptor = z.infer<typeof formDescriptorSchema>;
export type OptionsField = Extract<
  FormField,
  { type: "list" | "radio" | "multiChoice" }
>;

/** One save-time problem, aimed at a canvas field when it has an index. */
export interface FormDescriptorIssue {
  fieldIndex?: number;
  message: string;
}

export type ParseFormResult =
  | { descriptor: FormDescriptor; issues?: never }
  | { descriptor?: never; issues: FormDescriptorIssue[] };

// A {champ} reference: a field-name-shaped token between braces. Anything
// else between braces (MDX comments, expressions…) is not a reference. A
// fresh regex per call keeps the global-flag `lastIndex` from being shared.
export function fieldReferencePattern(): RegExp {
  return /\{([a-z0-9]+(?:-[a-z0-9]+)*)\}/g;
}

export function extractFieldReferences(text: string): string[] {
  return [...text.matchAll(fieldReferencePattern())].map(([, name]) => name);
}

/** Template references matching no field — refused at form save. */
export function unknownFieldReferences(
  text: string,
  descriptor: FormDescriptor
): string[] {
  const names = new Set(descriptor.fields.map((field) => field.name));
  return extractFieldReferences(text).filter((name) => !names.has(name));
}

export function isOptionsField(field: FormField): field is OptionsField {
  return field.type === "list" || field.type === "radio" || field.type === "multiChoice";
}

// The entry slugs an entry's data points at through its form-sourced option
// fields (docs/forms.md): their stored values are target-entry slugs, turned
// into wiki links at render.
export function formSourcedValues(
  descriptor: FormDescriptor,
  data: EntryData
): string[] {
  const slugs = new Set<string>();
  for (const field of descriptor.fields) {
    if (!isOptionsField(field) || !field.sourceFormId) continue;
    const value = data[field.name];
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string" && item !== "") slugs.add(item);
    }
  }
  return [...slugs];
}

// A single entry value as plain display text: absent → "", multiple → joined,
// a structured value (geolocation point) → "" (rendered elsewhere).
export function valueToText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return "";
  return String(value);
}

// Replaces {champ} references with entry values, an absent value rendering
// as an empty string, silently (docs/forms.md). Plain-text substitution:
// MDX escaping is the entry template renderer's concern, on top of this.
export function substituteFieldReferences(
  text: string,
  data: Record<string, unknown>
): string {
  return text.replace(fieldReferencePattern(), (_, name: string) =>
    valueToText(data[name])
  );
}

const REQUIRED = "Ce champ est obligatoire.";

// An optional value may be absent or blank; a present one must fit the
// format. Required wraps the format with the non-empty guard.
function stringValue(
  format: z.ZodType<string, string>,
  required: boolean | undefined
): z.ZodType {
  if (required) return z.string(REQUIRED).min(1, REQUIRED).pipe(format);
  return z.union([format, z.literal("")]).optional();
}

function optionValues(field: OptionsField): z.ZodType<string, string> {
  // Entered pairs restrict the value to their keys; entries of a source form
  // can appear and disappear at runtime, so the value stays a free slug
  // (graceful degradation, docs/forms.md).
  const keys = field.options ? Object.keys(field.options) : null;
  return keys && keys.length > 0
    ? (z.enum(keys as [string, ...string[]], "Valeur inconnue.") as unknown as z.ZodType<string, string>)
    : z.string();
}

// The value each field type writes into an entry's `data` snapshot; a field
// carrying no value (customContent, automatic title) gets no key at all.
function fieldValueSchema(field: FormField): z.ZodType | null {
  switch (field.type) {
    case "text": {
      if (field.subtype === "number") {
        // Optional mirrors stringValue: a cleared field carries the empty
        // every entry value shares, the "" of initialEntryValues.
        return field.required
          ? z.number(REQUIRED)
          : z.union([z.number(), z.literal("")]).optional();
      }
      let format = z.string();
      if (field.maxLength !== undefined) {
        format = format.max(
          field.maxLength,
          `${field.maxLength} caractères maximum.`
        );
      }
      if (field.pattern !== undefined) {
        format = format.regex(new RegExp(field.pattern), "Format invalide.");
      }
      return stringValue(format, field.required);
    }
    case "textarea":
      return stringValue(z.string(), field.required);
    case "email":
      return stringValue(z.email("Adresse email invalide."), field.required);
    case "url":
      return stringValue(z.url("URL invalide."), field.required);
    case "date":
      // ISO storage (docs/forms.md): the datepicker writes yyyy-mm-dd.
      return stringValue(
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
        field.required
      );
    case "list":
    case "radio":
      return stringValue(optionValues(field), field.required);
    case "multiChoice": {
      const values = z.array(optionValues(field));
      return field.required
        ? values.min(1, "Choisissez au moins une option.")
        : values.optional();
    }
    case "image":
    case "file":
      // The uploaded file's pool name (ADR 0012).
      return stringValue(z.string(), field.required);
    case "geolocation": {
      const point = z.object({ lat: z.number(), lng: z.number() });
      return field.required ? point : point.optional();
    }
    case "tags": {
      const tags = z.array(z.string());
      return field.required
        ? tags.min(1, "Ajoutez au moins un mot-clé.")
        : tags.optional();
    }
    case "customContent":
      return null; // admin-written display, never a value
    case "title":
      // Automatic mode: the title is computed server-side on save, never
      // submitted (docs/forms.md).
      return field.automatic ? null : z.string(REQUIRED).min(1, REQUIRED);
  }
}

/** A field-values object, the shape of an entry's `data` snapshot. */
export type EntryData = Record<string, unknown>;

// Narrows a stored `Revision.data` (Prisma Json, hence unknown) to an entry
// object — the plain-object guard shared by every reader of a snapshot.
export function readEntryData(value: unknown): EntryData {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as EntryData)
    : {};
}

// The form's starting values: declared defaults, overlaid by an existing
// snapshot when editing. Value-less fields (customContent, automatic title)
// get no key. Empty means "" for scalars, [] for the multiple types.
export function initialEntryValues(
  descriptor: FormDescriptor,
  snapshot?: EntryData
): EntryData {
  const values: EntryData = {};
  for (const field of descriptor.fields) {
    if (fieldValueSchema(field) === null) continue;
    if (snapshot && field.name in snapshot) {
      values[field.name] = snapshot[field.name];
      continue;
    }
    if ("defaultValue" in field && field.defaultValue !== undefined) {
      values[field.name] = field.defaultValue;
    } else if (field.type === "multiChoice" || field.type === "tags") {
      values[field.name] = [];
    } else if (field.type === "geolocation") {
      values[field.name] = undefined;
    } else {
      values[field.name] = "";
    }
  }
  return values;
}

// A snapshot's keys, rebuilt in the form's own field order (docs/permissions.md
// § /{slug}/raw): storage makes no promise here — Postgres's jsonb does not
// preserve the order keys were written in — so anyone wanting the form's
// order has to rebuild it, rather than trust what comes back from Prisma. A
// key with no matching field (an orphan a schema change left behind,
// docs/architecture.md's graceful degradation) rides at the end, in the order
// it already had: it is still preserved, just not part of the form anymore.
export function orderedEntryData(
  descriptor: FormDescriptor,
  data: EntryData
): EntryData {
  const ordered: EntryData = {};
  for (const field of descriptor.fields) {
    if (field.name in data) ordered[field.name] = data[field.name];
  }
  for (const [name, value] of Object.entries(data)) {
    if (!(name in ordered)) ordered[name] = value;
  }
  return ordered;
}

// The labels an automatic title draws from. The entry form hides the title
// field in automatic mode, so "the title is empty" alone would be a dead
// end: the refusal has to name the fields the author can actually fill.
export function titleSourceLabels(descriptor: FormDescriptor): string[] {
  const title = descriptor.fields.find((field) => field.type === "title");
  if (title?.type !== "title" || !title.automatic || !title.template) return [];
  const labels = new Map(descriptor.fields.map((f) => [f.name, f.label]));
  return [
    ...new Set(
      extractFieldReferences(title.template)
        .map((name) => labels.get(name))
        .filter((label): label is string => label !== undefined)
    ),
  ];
}

/** Why a save is refused when the title comes out empty (ADR 0020). */
export function emptyTitleMessage(descriptor: FormDescriptor): string {
  const labels = titleSourceLabels(descriptor).map((label) => `«\u00A0${label}\u00A0»`);
  if (labels.length === 0) return "Le titre de la fiche est vide.";
  if (labels.length === 1) {
    return `Le titre de la fiche est calculé à partir de ${labels[0]} : renseignez ce champ.`;
  }
  const list = `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
  return `Le titre de la fiche est calculé à partir de ${list} : renseignez au moins l'un de ces champs.`;
}

// The title stored on save (docs/forms.md): the manual title value, or —
// in automatic mode — the template recomputed from the current values. The
// result is written into `data` by the callers, never recomputed at read
// (ADR 0020).
export function computeAutomaticTitle(
  descriptor: FormDescriptor,
  data: EntryData
): string {
  const title = descriptor.fields.find((field) => field.type === "title");
  if (title?.type === "title" && title.automatic && title.template) {
    return substituteFieldReferences(title.template, data).trim();
  }
  const value = data.title;
  return typeof value === "string" ? value : "";
}

// The Zod schema derived from a form's descriptor (ADR 0015): the single
// source of truth validating an entry's values client-side (resolver) and
// server-side before the Prisma write. Unknown keys are stripped — orphan
// values live on in the old snapshots, not in new ones.
export function deriveEntrySchema(
  descriptor: FormDescriptor
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of descriptor.fields) {
    const value = fieldValueSchema(field);
    if (value) shape[field.name] = value;
  }
  return z.object(shape);
}

// Validation at form save (docs/forms.md): Zod meta-schema for the shape,
// then the cross rules — unique names, the title field, at most one tags
// field, resolvable references, one options source. Every issue aims at its
// field so the FormBuilder can target its message.
export function parseFormDescriptor(raw: unknown): ParseFormResult {
  const result = formDescriptorSchema.safeParse(raw);
  if (!result.success) {
    return {
      issues: result.error.issues.map((issue) => ({
        fieldIndex:
          issue.path[0] === "fields" && typeof issue.path[1] === "number"
            ? issue.path[1]
            : undefined,
        message: `Descripteur mal formé : ${issue.message} (${issue.path.join(".")})`,
      })),
    };
  }
  const descriptor = result.data;
  const issues: FormDescriptorIssue[] = [];

  const seen = new Set<string>();
  descriptor.fields.forEach((field, fieldIndex) => {
    if (seen.has(field.name)) {
      issues.push({
        fieldIndex,
        message: `Deux champs portent le nom «\u00A0${field.name}\u00A0».`,
      });
    }
    seen.add(field.name);
  });

  if (!descriptor.fields.some((field) => field.type === "title")) {
    issues.push({
      message: "Le formulaire doit comporter le champ «\u00A0Titre de la fiche\u00A0».",
    });
  }

  descriptor.fields.forEach((field, fieldIndex) => {
    if (field.type === "title" && field.automatic && field.template) {
      for (const name of unknownFieldReferences(field.template, descriptor)) {
        issues.push({
          fieldIndex,
          message: `Le titre automatique référence un champ inconnu : «\u00A0${name}\u00A0».`,
        });
      }
    }
    if (isOptionsField(field)) {
      const hasPairs = field.options !== undefined;
      const hasSource = field.sourceFormId !== undefined;
      if (hasPairs === hasSource) {
        issues.push({
          fieldIndex,
          message: `Le champ «\u00A0${field.label}\u00A0» doit tirer ses options des paires saisies ou d'un formulaire source.`,
        });
      } else if (hasPairs && field.defaultValue !== undefined) {
        const values = Array.isArray(field.defaultValue)
          ? field.defaultValue
          : [field.defaultValue];
        for (const value of values) {
          if (!(value in field.options!)) {
            issues.push({
              fieldIndex,
              message: `La valeur par défaut «\u00A0${value}\u00A0» ne fait pas partie des options.`,
            });
          }
        }
      }
    }
  });

  return issues.length > 0 ? { issues } : { descriptor };
}

// Rules checked when a form is *saved*, not when it is read. A descriptor
// already in base has to keep parsing: getForm throws on one it cannot read,
// which would shut the author out of the very screen where the mistake gets
// fixed. So a rule that only tightens what may be created belongs here, next
// to saveForm's other authoring checks — never in parseFormDescriptor, whose
// verdict is retroactive over everything already stored.
export function formAuthoringIssues(
  descriptor: FormDescriptor
): FormDescriptorIssue[] {
  const issues: FormDescriptorIssue[] = [...restrictedFieldLeaks(descriptor)];
  descriptor.fields.forEach((field, fieldIndex) => {
    for (const setting of requiredSettings(field)) {
      const value = settingValue(field, setting.key);
      if (value.trim() === "") {
        issues.push({
          fieldIndex,
          message: `«\u00A0${setting.label}\u00A0» est obligatoire pour le champ «\u00A0${fieldName(field)}\u00A0».`,
        });
      } else if (setting.key === "name" && !SLUG_PATTERN.test(value)) {
        issues.push({
          fieldIndex,
          message: `L'identifiant «\u00A0${value}\u00A0» du champ «\u00A0${fieldName(field)}\u00A0» est invalide (minuscules, chiffres et tirets).`,
        });
      }
    }
  });
  return issues;
}

function restrictsReading(field: FormField): boolean {
  return field.readAcl !== undefined && field.readAcl.scope !== "everyone";
}

function restrictsWriting(field: FormField): boolean {
  return field.writeAcl !== undefined && field.writeAcl.scope !== "everyone";
}

/**
 * The restrictions the wiki could not keep, refused when the form is saved
 * rather than patched at render (docs/permissions.md § Champ). Two are about
 * the title, and for one reason: a title is read — and written — where no
 * right is ever consulted, so a restriction posed on it would be honoured
 * nowhere. The third is about the mots-clés, which live on the Page and not
 * in the snapshot (ADR 0007), and which the wiki lists wherever it lists
 * pages.
 *
 * The settings panel offers none of the three, so a descriptor carrying one
 * came in by hand: this is the guard rail behind the state made impossible.
 */
function restrictedFieldLeaks(
  descriptor: FormDescriptor
): FormDescriptorIssue[] {
  const issues: FormDescriptorIssue[] = [];
  descriptor.fields.forEach((field, fieldIndex) => {
    if (field.type === "title") {
      // Not merely a leak: an entry whose title nobody may read has no title
      // at all (ADR 0020), and neither its slug nor its display survives that.
      if (restrictsReading(field)) {
        issues.push({
          fieldIndex,
          message:
            "Le titre de la fiche ne peut pas être restreint en lecture : il nomme la fiche partout dans le wiki.",
        });
      }
      // A fiche is refused without a title, so whoever may not write one may
      // not create a fiche at all — a form closed by a setting saying nothing
      // of the sort.
      if (restrictsWriting(field)) {
        issues.push({
          fieldIndex,
          message:
            "Le titre de la fiche ne peut pas être restreint en écriture : sans lui, personne d'autre ne pourrait créer de fiche.",
        });
      }
      issues.push(...automaticTitleLeaks(descriptor, field, fieldIndex));
    }
  });
  return issues;
}

/** `{prenom} {salaire}` would publish the salary in the title, and in the URL. */
function automaticTitleLeaks(
  descriptor: FormDescriptor,
  title: Extract<FormField, { type: "title" }>,
  fieldIndex: number
): FormDescriptorIssue[] {
  if (!title.automatic || !title.template) return [];
  const restricted = new Set(
    descriptor.fields.filter(restrictsReading).map((field) => field.name)
  );
  return extractFieldReferences(title.template)
    .filter((name) => restricted.has(name))
    .map((name) => ({
      fieldIndex,
      message: `Le titre automatique référence un champ à lecture restreinte : «\u00A0${name}\u00A0».`,
    }));
}

/**
 * A setting the author has to fill in. Listed exactly when the FieldSettings
 * panel shows it: the same list draws the asterisk on screen and refuses the
 * save, so the mark and the check cannot drift apart — which is how a blank
 * gabarit, starred but unchecked, once got through.
 */
export interface RequiredSetting {
  /** The descriptor key carrying the value. */
  key: "label" | "name" | "template";
  /** How the setting is named to the author. */
  label: string;
}

export function requiredSettings(field: FormField): RequiredSetting[] {
  const settings: RequiredSetting[] = [{ key: "label", label: "Libellé" }];
  // The title field's identifier is the fixed `title` (ADR 0014): the panel
  // does not show it, so it is not the author's to fill.
  if (field.type !== "title") {
    settings.push({
      key: "name",
      label: "Identifiant",
    });
  }
  // Automatic mode hides the title field from the entry form, so a blank
  // gabarit leaves nothing on screen able to fill the title: every entry
  // save would be refused, by a message naming no field at all (ADR 0020).
  if (field.type === "title" && field.automatic) {
    settings.push({
      key: "template",
      label: "Gabarit du titre",
    });
  }
  return settings;
}

function settingValue(field: FormField, key: RequiredSetting["key"]): string {
  const value = (field as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

// How a field is named in a refusal. Its label, unless that is the very
// setting left empty — then the type it was dropped from ("Texte court").
function fieldName(field: FormField): string {
  return field.label.trim() || FIELD_TYPE_LABELS[field.type];
}
