"use client";

// Per-field settings panel of the FormBuilder (docs/forms.md): the common
// trunk (label, identifier, required, hint) plus the type-specific
// parameters. The field identifier (`name`) follows the unified rule (ADR
// 0014/0017): a visible input derived from the label until the author types
// in it, then — once the form is saved — a chip whose « Changer » stages a
// rename applied at the next save.

import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { countFieldReferences } from "@/modules/forms/actions";
import { AclInput, NO_FLOOR } from "@/modules/permissions/acl-input";
import { Field } from "@/modules/forms/field-widget";
import { RenameSlugDialog } from "@/components/ui/rename-slug-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoNote } from "@/components/ui/info-note";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SlugInlineEdit } from "@/components/ui/slug-input";
import type { FieldReferenceCounts } from "@/modules/forms/field-rename/rules";
import {
  type FormField,
  type RequiredSetting,
  requiredSettings,
} from "@/modules/forms/form-descriptor";
import {
  type AccessRule,
  type AclDirectory,
  scopesUnder,
} from "@/modules/permissions/rules";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import type { SlugReferenceImpact } from "@/lib/slug-rename-db";
import type { CanvasField } from "./form-builder";

export function FieldSettings({
  field,
  otherFields,
  forms,
  formSlug,
  directory,
  entryDefaults,
  referenceCounts,
  onChange,
  onRenameStaged,
}: {
  field: CanvasField;
  /** Sibling fields, for geolocation address bindings and options sources. */
  otherFields: CanvasField[];
  forms: { slug: string; name: string }[];
  /** The edited form's slug; null while the form has never been saved. */
  formSlug: string | null;
  /** Who the field's two rules may name: the people and groups of the wiki. */
  directory: AclDirectory;
  /** What the « Accès » tab poses on a fiche: the ceiling of a field's own. */
  entryDefaults: { read: AccessRule; write: AccessRule };
  /** Local references to the field's name, for the rename dialog's impact. */
  referenceCounts: FieldReferenceCounts;
  onChange: (patch: Partial<FormField>) => void;
  /** Confirms the rename dialog: stages the rename on the canvas (ADR 0017). */
  onRenameStaged: (to: string) => void;
}) {
  const patch = (values: Partial<FormField>) => onChange(values);
  // The asterisks below read the same list saveForm refuses on: a setting
  // cannot be marked mandatory without being checked, nor the reverse.
  const required = new Set(requiredSettings(field).map((setting) => setting.key));

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="setting-label" className="gap-1">
          Libellé
          {required.has("label") && <RequiredMark />}
        </Label>
        <Input
          id="setting-label"
          value={field.label}
          onChange={(event) => {
            const label = event.target.value;
            // Derive the identifier from the label until the author
            // customizes it or the field is persisted, and never for the
            // fixed-name title field (ADR 0017).
            patch(
              field.nameCustomized ||
                field.persistedName !== undefined ||
                field.type === "title"
                ? { label }
                : ({ label, name: slugify(label) } as Partial<FormField>)
            );
          }}
        />
      </div>

      {required.has("name") && (
        <NameSetting
          field={field}
          formSlug={formSlug}
          referenceCounts={referenceCounts}
          onChange={onChange}
          onRenameStaged={onRenameStaged}
        />
      )}

      {field.type !== "title" && field.type !== "customContent" && (
        <label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={field.required === true}
            onCheckedChange={(checked) => patch({ required: checked === true })}
          />
          Champ obligatoire
        </label>
      )}

      {"placeholder" in fieldParams(field) && (
        <TextSetting
          id="setting-placeholder"
          label="Texte indicatif (placeholder)"
          value={stringParam(field, "placeholder")}
          onChange={(placeholder) => patch({ placeholder } as Partial<FormField>)}
        />
      )}

      <TextSetting
        id="setting-hint"
        label="Aide affichée sous le champ"
        value={field.hint ?? ""}
        onChange={(hint) => patch({ hint })}
      />

      <TypeSpecificSettings
        field={field}
        otherFields={otherFields}
        forms={forms}
        onChange={onChange}
      />

      <FieldRights
        field={field}
        directory={directory}
        entryDefaults={entryDefaults}
        onChange={onChange}
      />
    </div>
  );
}

/**
 * The two rights a field poses on itself (docs/permissions.md § Champ), folded
 * under « Paramètres avancés » — the ComponentBuilder's own fold, and for the
 * same reason: a wiki restricts a salary or an internal note on a handful of
 * fields, and the rest of the palette should not have to step around the
 * settings that serve them.
 *
 * The same `acl` widget as everywhere else (ADR 0015), on a floor that names
 * nobody: a field has no owner — only the administrators stand under it,
 * whatever a « seulement » holds.
 */
function FieldRights({
  field,
  directory,
  entryDefaults,
  onChange,
}: {
  field: CanvasField;
  directory: AclDirectory;
  entryDefaults: { read: AccessRule; write: AccessRule };
  onChange: (patch: Partial<FormField>) => void;
}) {
  const [open, setOpen] = useState(false);

  // Nothing to pose on the title: its reading is what names the fiche in the
  // URL, the menus and every list, so restricting it is refused at the save
  // (ADR 0020) — and the state is made impossible here rather than caught
  // there, the way @Admins refuses to hold a group.
  if (field.type === "title") {
    return (
      <InfoNote>
        Le titre nomme la fiche partout dans le wiki : son accès ne se
        restreint pas.
      </InfoNote>
    );
  }

  // A field's rule stands under the fiche's, so what it may say is capped by
  // what the « Accès » tab poses — offering « tout le monde » on a form whose
  // fiches only signed-in people see would promise an audience the fiche
  // itself refuses. The cap only decides what is *offered*: a rule posed
  // before the tab was narrowed keeps its scope, and grants nothing extra
  // anyway, the fiche's own right answering first.
  const rules = [
    {
      key: "readAcl",
      id: "setting-read-acl",
      label: "Qui peut voir ce champ ?",
      within: "parmi ceux qui voient la fiche",
      posed: field.readAcl,
      under: entryDefaults.read,
      // Every field type has a reading to pose; only the filling has an
      // exception below.
      shown: true,
    },
    {
      key: "writeAcl",
      id: "setting-write-acl",
      label: "Qui peut le remplir ?",
      within: "parmi ceux qui modifient la fiche",
      posed: field.writeAcl,
      under: entryDefaults.write,
      // A customContent field displays what its author wrote and holds no
      // value of its own: there is nothing in it to fill in.
      shown: field.type !== "customContent",
    },
  ] as const;

  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn("size-4 transition-transform", open && "rotate-90")}
          aria-hidden
        />
        Paramètres avancés
      </button>
      {open && (
        <div className="grid gap-4">
          {/* A titled rule rather than a frame: the panel is a narrow column,
              and a box would spend on padding the width the lists need. The
              two rights sit last, so the rule marks where the settings of the
              field end and those of its access begin — the divider of the
              shared renderer, the same one the ComponentBuilder groups with. */}
          <Field
            id="setting-rights-divider"
            spec={{ type: "divider", label: "Accès au champ" }}
            value=""
            onChange={() => {}}
          />
          {rules.map((rule) =>
            rule.shown ? (
              <div key={rule.key} className="grid gap-2">
                <div>
                  <Label htmlFor={rule.id}>{rule.label}</Label>
                  {/* Where the choice stops, said by the selector itself
                      rather than by a note underneath: the ceiling is a
                      property of the question — a field's right always
                      stands inside the fiche's — so it belongs to the
                      label, and a reader meets it before the portées
                      rather than after having wondered where one went. */}
                  <p className="text-xs text-muted-foreground">
                    {rule.within}
                  </p>
                </div>
                <AclInput
                  id={rule.id}
                  value={rule.posed ?? rule.under}
                  directory={directory}
                  // A field has no owner: only the administrators stand under
                  // it, whatever a « seulement » holds.
                  floor={NO_FLOOR}
                  scopes={scopesUnder(rule.under.scope, rule.posed?.scope)}
                  unposed={{
                    label: "Aucune restriction",
                    selected: rule.posed === undefined,
                    onSelect: () => onChange({ [rule.key]: undefined }),
                  }}
                  onChange={(posed: AccessRule) => onChange({ [rule.key]: posed })}
                />
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

// The field's identifier (docs/forms.md « Identités », ADR 0017). Persisted:
// a chip and « Changer », staging the rename locally — the impact headcount
// is a Server Action but the confirm never writes. Not yet persisted: a
// visible input derived from the label until the author types in it
// (emptied, it derives again).
function NameSetting({
  field,
  formSlug,
  referenceCounts,
  onChange,
  onRenameStaged,
}: {
  field: CanvasField;
  formSlug: string | null;
  referenceCounts: FieldReferenceCounts;
  onChange: (patch: Partial<FormField>) => void;
  onRenameStaged: (to: string) => void;
}) {
  const persistedName = field.persistedName;
  if (persistedName !== undefined) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">
          Identifiant{" "}
          <RequiredMark />
        </p>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          {field.name}
        </code>
        <RenameSlugDialog
          trigger={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
            >
              <Pencil className="size-3.5" />
              Changer
            </Button>
          }
          title="Changer l'identifiant du champ"
          currentLabel="Identifiant actuel"
          current={field.name}
          inputLabel="Nouvel identifiant"
          confirmLabel="Changer l'identifiant"
          searchingText="Recherche des fiches portant ce champ…"
          impactSentence={(impact) =>
            fieldImpactSentence(impact, referenceCounts)
          }
          note="Les modifications ne seront prises en compte qu'à l'enregistrement du formulaire."
          fetchImpact={async () => ({
            pages: 0,
            entries: formSlug
              ? await countFieldReferences(formSlug, persistedName)
              : 0,
            forms: 0,
          })}
          rename={async (to) => onRenameStaged(to)}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="setting-name" className="gap-1">
        Identifiant
        <RequiredMark />
      </Label>
      <SlugInlineEdit
        id="setting-name"
        value={field.name}
        editLabel="Personnaliser l'identifiant"
        // Typing decouples the identifier from the label (ADR 0017); the
        // value may stay empty while editing — only leaving the field empty
        // re-derives it from the label.
        onValueChange={(name) =>
          onChange({ name, nameCustomized: true } as Partial<FormField>)
        }
        onBlur={() => {
          if (field.name === "") {
            onChange({
              name: slugify(field.label),
              nameCustomized: false,
            } as Partial<FormField>);
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        Généré à partir du libellé ou personnalisable. Minuscules, chiffres et
        tirets uniquement.
      </p>
    </div>
  );
}

// The full impact of a staged field rename: the entries carrying the key
// (server headcount) plus what the canvas will rewrite locally — references
// in the form definition and in the entry template.
function fieldImpactSentence(
  impact: SlugReferenceImpact,
  counts: FieldReferenceCounts
): string {
  const sentences: string[] = [];
  if (impact.entries === 0) {
    sentences.push("Aucune fiche ne porte encore ce champ.");
  } else if (impact.entries === 1) {
    sentences.push(
      "1 fiche porte ce champ : elle sera mise à jour automatiquement, historique compris."
    );
  } else {
    sentences.push(
      `${impact.entries} fiches portent ce champ : elles seront mises à jour automatiquement, historique compris.`
    );
  }
  const references = [
    counts.schema > 0
      ? `${referenceNoun(counts.schema)} dans le formulaire`
      : null,
    counts.template > 0
      ? `${referenceNoun(counts.template)} dans le gabarit`
      : null,
  ].filter((part): part is string => part !== null);
  if (references.length > 0) {
    const verb =
      counts.schema + counts.template > 1
        ? "seront également réécrites"
        : "sera également réécrite";
    sentences.push(`${references.join(" et ")} ${verb}.`);
  }
  return sentences.join(" ");
}

function referenceNoun(total: number): string {
  return `${total} référence${total > 1 ? "s" : ""}`;
}

function TypeSpecificSettings({
  field,
  otherFields,
  forms,
  onChange,
}: {
  field: CanvasField;
  otherFields: CanvasField[];
  forms: { slug: string; name: string }[];
  onChange: (patch: Partial<FormField>) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="setting-subtype">Type de saisie</Label>
            <Select
              value={field.subtype ?? "text"}
              onValueChange={(subtype) =>
                onChange({ subtype: subtype as "text" | "number" })
              }
            >
              <SelectTrigger id="setting-subtype" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texte</SelectItem>
                <SelectItem value="number">Nombre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <TextSetting
            id="setting-default"
            label="Valeur par défaut"
            value={field.defaultValue ?? ""}
            onChange={(value) =>
              onChange({ defaultValue: value === "" ? undefined : value })
            }
          />
          <NumberSetting
            id="setting-maxlength"
            label="Longueur maximale"
            value={field.maxLength}
            onChange={(maxLength) => onChange({ maxLength })}
          />
          <TextSetting
            id="setting-pattern"
            label="Motif de validation (regex, avancé)"
            value={field.pattern ?? ""}
            onChange={(value) =>
              onChange({ pattern: value === "" ? undefined : value })
            }
          />
        </div>
      );
    case "textarea":
      return (
        <div className="grid gap-3">
          <NumberSetting
            id="setting-rows"
            label="Nombre de lignes"
            value={field.rows}
            onChange={(rows) => onChange({ rows })}
          />
          <TextSetting
            id="setting-default"
            label="Valeur par défaut"
            value={field.defaultValue ?? ""}
            onChange={(value) =>
              onChange({ defaultValue: value === "" ? undefined : value })
            }
          />
          <label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={field.allowMdx === true}
              onCheckedChange={(checked) =>
                onChange({ allowMdx: checked === true })
              }
            />
            Autoriser la mise en forme MDX de la valeur
          </label>
        </div>
      );
    case "image":
      return (
        <div className="grid gap-3">
          <NumberSetting
            id="setting-resize-width"
            label="Largeur d'affichage (pixels)"
            value={field.resizeWidth}
            onChange={(resizeWidth) => onChange({ resizeWidth })}
          />
          <NumberSetting
            id="setting-resize-height"
            label="Hauteur d'affichage (pixels)"
            value={field.resizeHeight}
            onChange={(resizeHeight) => onChange({ resizeHeight })}
          />
          <p className="text-xs text-muted-foreground">
            L&apos;image garde ses proportions : elle est réduite pour tenir
            dans ce cadre, sans jamais être agrandie. Renseigner une seule des
            deux valeurs suffit ; vide = taille d&apos;origine.
          </p>
        </div>
      );
    case "date":
      return (
        <label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={field.initTodayButton === true}
            onCheckedChange={(checked) =>
              onChange({ initTodayButton: checked === true })
            }
          />
          Proposer un bouton «&nbsp;Aujourd&apos;hui&nbsp;»
        </label>
      );
    case "list":
    case "radio":
    case "multiChoice":
      return (
        <OptionsSettings field={field} forms={forms} onChange={onChange} />
      );
    case "geolocation":
      return (
        <GeolocationSettings
          field={field}
          otherFields={otherFields}
          onChange={onChange}
        />
      );
    case "customContent":
      return (
        <div className="grid gap-3">
          <MdxSetting
            label="Contenu affiché dans le formulaire de saisie"
            value={field.entryContent ?? ""}
            onChange={(entryContent) => onChange({ entryContent })}
          />
          <MdxSetting
            label="Contenu affiché dans la fiche"
            value={field.displayContent ?? ""}
            onChange={(displayContent) => onChange({ displayContent })}
          />
        </div>
      );
    case "title":
      return <TitleSettings field={field} onChange={onChange} />;
    default:
      return null;
  }
}

function OptionsSettings({
  field,
  forms,
  onChange,
}: {
  field: Extract<CanvasField, { type: "list" | "radio" | "multiChoice" }>;
  forms: { slug: string; name: string }[];
  onChange: (patch: Partial<FormField>) => void;
}) {
  const fromForm = field.sourceFormId !== undefined;
  const options = field.options ?? {};

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="grid gap-1.5">
        <Label>Source des options</Label>
        <Select
          value={fromForm ? "form" : "inline"}
          onValueChange={(source) =>
            onChange(
              source === "form"
                ? { options: undefined, sourceFormId: forms[0]?.slug ?? "" }
                : { sourceFormId: undefined, options: {} }
            )
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inline">Paires saisies</SelectItem>
            <SelectItem value="form">Fiches d&apos;un formulaire</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {fromForm ? (
        <Select
          value={field.sourceFormId}
          onValueChange={(sourceFormId) => onChange({ sourceFormId })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choisir un formulaire…" />
          </SelectTrigger>
          <SelectContent>
            {forms.map((form) => (
              <SelectItem key={form.slug} value={form.slug}>
                {form.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <InlineOptions
          options={options}
          onChange={(next) => onChange({ options: next })}
        />
      )}

      {field.type !== "list" && (
        <div className="grid gap-1.5">
          <Label>Mode de saisie</Label>
          <Select
            value={field.fillingMode ?? "normal"}
            onValueChange={(mode) =>
              onChange({ fillingMode: mode as typeof field.fillingMode })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">
                {field.type === "radio" ? "Boutons radio" : "Cases à cocher"}
              </SelectItem>
              <SelectItem value="tags">Pastilles cliquables</SelectItem>
              {field.type === "multiChoice" && (
                <SelectItem value="dragAndDrop">Glisser-déposer</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// value → label pairs, the key derived from the label (fixed-identity motif).
function InlineOptions({
  options,
  onChange,
}: {
  options: Record<string, string>;
  onChange: (options: Record<string, string>) => void;
}) {
  const entries = Object.entries(options);

  const setLabel = (index: number, label: string) => {
    const next = entries.map(([key, value], i) =>
      i === index ? [slugify(label) || key, label] : [key, value]
    );
    onChange(Object.fromEntries(next));
  };
  const remove = (index: number) =>
    onChange(Object.fromEntries(entries.filter((_, i) => i !== index)));
  const add = () => onChange({ ...options, "": "" });

  return (
    <div className="grid gap-2">
      {entries.map(([key, label], index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={label}
            placeholder="Libellé"
            onChange={(event) => setLabel(index, event.target.value)}
          />
          <code className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">
            {key}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Retirer l'option"
            onClick={() => remove(index)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus />
        Ajouter une option
      </Button>
    </div>
  );
}

function GeolocationSettings({
  field,
  otherFields,
  onChange,
}: {
  field: Extract<CanvasField, { type: "geolocation" }>;
  otherFields: CanvasField[];
  onChange: (patch: Partial<FormField>) => void;
}) {
  const addressFields = otherFields.filter(
    (candidate) => candidate.type === "text" || candidate.type === "textarea"
  );
  const bindings = [
    ["streetField", "Rue"],
    ["street1Field", "Complément d'adresse 1"],
    ["street2Field", "Complément d'adresse 2"],
    ["postalCodeField", "Code postal"],
    ["townField", "Ville"],
    ["countyField", "Département"],
    ["stateField", "Région / État"],
  ] as const;

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <p className="text-sm font-medium">Champs adresse (pour le géocodage)</p>
      {bindings.map(([key, label]) => (
        <div key={key} className="grid gap-1.5">
          <Label>{label}</Label>
          <Select
            value={(field[key] as string | undefined) ?? "__none__"}
            onValueChange={(value) =>
              onChange({ [key]: value === "__none__" ? undefined : value })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Aucun</SelectItem>
              {addressFields.map((candidate) => (
                <SelectItem key={candidate.name} value={candidate.name}>
                  {candidate.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      <label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox
          checked={field.geolocateButton === true}
          onCheckedChange={(checked) =>
            onChange({ geolocateButton: checked === true })
          }
        />
        Bouton «&nbsp;Depuis ma position&nbsp;»
      </label>
    </div>
  );
}

function TitleSettings({
  field,
  onChange,
}: {
  field: Extract<CanvasField, { type: "title" }>;
  onChange: (patch: Partial<FormField>) => void;
}) {
  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox
          checked={field.automatic === true}
          onCheckedChange={(checked) =>
            onChange({ automatic: checked === true })
          }
        />
        Titre automatique (calculé depuis un gabarit)
      </label>
      {settingRequired(field, "template") && (
        <TextSetting
          id="setting-title-template"
          label="Gabarit du titre (ex. {prenom} {nom})"
          required
          value={field.template ?? ""}
          onChange={(template) => onChange({ template })}
        />
      )}
    </div>
  );
}

function RequiredMark() {
  return (
    <span aria-hidden className="text-destructive">
      *
    </span>
  );
}

/** Shows a setting exactly when it is one the author must fill in. */
function settingRequired(field: FormField, key: RequiredSetting["key"]) {
  return requiredSettings(field).some((setting) => setting.key === key);
}

function TextSetting({
  id,
  label,
  value,
  required,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  /** Marks a setting the form cannot be saved without. */
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="gap-1">
        {label}
        {required && (
          <RequiredMark />
        )}
      </Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

// A positive-integer parameter (maxLength, rows, resize dimensions); empty
// clears it back to undefined.
function NumberSetting({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={1}
        value={value ?? ""}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          onChange(
            event.target.value === "" || !Number.isFinite(parsed) || parsed <= 0
              ? undefined
              : Math.floor(parsed)
          );
        }}
      />
    </div>
  );
}

function MdxSetting({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Textarea
        value={value}
        rows={3}
        className="font-mono text-xs"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

// Text-like types carry a placeholder; used to decide whether to show it.
function fieldParams(field: FormField): Record<string, unknown> {
  return field as unknown as Record<string, unknown>;
}
function stringParam(field: FormField, key: string): string {
  const value = fieldParams(field)[key];
  return typeof value === "string" ? value : "";
}
