"use client";

// Per-field settings panel of the FormBuilder (docs/forms.md): the common
// trunk (label, identifier, required, hint) plus the type-specific
// parameters. The field identifier (`name`) follows the unified rule (ADR
// 0014/0017): a visible input derived from the label until the author types
// in it, then — once the form is saved — a chip whose « Changer » stages a
// rename applied at the next save.

import { Pencil, Plus, Trash2 } from "lucide-react";
import { countFieldReferences } from "@/app/form-actions";
import { RenameSlugDialog } from "@/components/rename-slug-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { FormField } from "@/lib/form-descriptor";
import { normalizeSlugInput, slugify } from "@/lib/slug";
import type { SlugReferenceImpact } from "@/lib/slug-rename-db";
import type { CanvasField } from "./form-builder";

export function FieldSettings({
  field,
  otherFields,
  forms,
  formSlug,
  onChange,
  onRenameStaged,
}: {
  field: CanvasField;
  /** Sibling fields, for geolocation address bindings and options sources. */
  otherFields: CanvasField[];
  forms: { slug: string; name: string }[];
  /** The edited form's slug; null while the form has never been saved. */
  formSlug: string | null;
  onChange: (patch: Partial<FormField>) => void;
  /** Confirms the rename dialog: stages the rename on the canvas (ADR 0017). */
  onRenameStaged: (to: string) => void;
}) {
  const patch = (values: Partial<FormField>) => onChange(values);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="setting-label">Libellé</Label>
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

      {field.type !== "title" && (
        <NameSetting
          field={field}
          formSlug={formSlug}
          onChange={onChange}
          onRenameStaged={onRenameStaged}
        />
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

      {field.type !== "title" && field.type !== "customContent" && (
        <label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={field.required === true}
            onCheckedChange={(checked) => patch({ required: checked === true })}
          />
          Champ obligatoire
        </label>
      )}

      <TypeSpecificSettings
        field={field}
        otherFields={otherFields}
        forms={forms}
        onChange={onChange}
      />
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
  onChange,
  onRenameStaged,
}: {
  field: CanvasField;
  formSlug: string | null;
  onChange: (patch: Partial<FormField>) => void;
  onRenameStaged: (to: string) => void;
}) {
  const persistedName = field.persistedName;
  if (persistedName !== undefined) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm">
          Identifiant :{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
            {field.name}
          </code>
        </p>
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
          impactSentence={fieldImpactSentence}
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
      <Label htmlFor="setting-name">Identifiant (clé et cible des {"{champ}"})</Label>
      <Input
        id="setting-name"
        value={field.name}
        className="font-mono text-sm"
        onChange={(event) => {
          const name = normalizeSlugInput(event.target.value);
          // Typing decouples the identifier from the label; emptying
          // re-derives it (ADR 0017).
          onChange(
            name === ""
              ? ({
                  name: slugify(field.label),
                  nameCustomized: false,
                } as Partial<FormField>)
              : ({ name, nameCustomized: true } as Partial<FormField>)
          );
        }}
      />
    </div>
  );
}

function fieldImpactSentence(impact: SlugReferenceImpact): string {
  if (impact.entries === 0) return "Aucune fiche ne porte encore ce champ.";
  if (impact.entries === 1) {
    return "1 fiche porte ce champ : elle sera mise à jour automatiquement, historique compris.";
  }
  return `${impact.entries} fiches portent ce champ : elles seront mises à jour automatiquement, historique compris.`;
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
          Proposer un bouton « Aujourd&apos;hui »
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
        Bouton « Depuis ma position »
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
      {field.automatic && (
        <TextSetting
          id="setting-title-template"
          label="Gabarit du titre (ex. {prenom} {nom})"
          value={field.template ?? ""}
          onChange={(template) => onChange({ template })}
        />
      )}
    </div>
  );
}

function TextSetting({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
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
