"use client";

// Per-field settings panel of the FormBuilder (docs/forms.md): the common
// trunk (label, name, required, hint) plus the type-specific parameters. The
// field `name` follows the fixed-identity pattern (ADR 0014): derived from
// the label, revealed in one click to customize, frozen once the form is
// saved.

import { ChevronRight, Plus, Trash2 } from "lucide-react";
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
import { slugify } from "@/lib/slug";
import type { CanvasField } from "./form-builder";

export function FieldSettings({
  field,
  otherFields,
  forms,
  onChange,
  onRevealName,
}: {
  field: CanvasField;
  /** Sibling fields, for geolocation address bindings and options sources. */
  otherFields: CanvasField[];
  forms: { slug: string; name: string }[];
  onChange: (patch: Partial<FormField>) => void;
  onRevealName: () => void;
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
            // Derive the name from the label until the user reveals and
            // customizes it, and never for the fixed-name title field.
            patch(
              field.nameRevealed || field.frozen || field.type === "title"
                ? { label }
                : ({ label, name: slugify(label) } as Partial<FormField>)
            );
          }}
        />
      </div>

      {field.type !== "title" && (
        <NameSetting field={field} onChange={onChange} onReveal={onRevealName} />
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

function NameSetting({
  field,
  onChange,
  onReveal,
}: {
  field: CanvasField;
  onChange: (patch: Partial<FormField>) => void;
  onReveal: () => void;
}) {
  if (!field.nameRevealed) {
    return (
      <button
        type="button"
        onClick={onReveal}
        className="flex items-center gap-1 justify-self-start text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="size-3.5" aria-hidden />
        Nom technique : <code className="font-mono">{field.name}</code>
      </button>
    );
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="setting-name">Nom technique (clé et cible des {"{champ}"})</Label>
      <Input
        id="setting-name"
        value={field.name}
        disabled={field.frozen}
        onChange={(event) => onChange({ name: slugify(event.target.value) })}
      />
      {field.frozen && (
        <p className="text-xs text-muted-foreground">
          Figé depuis la première sauvegarde du formulaire.
        </p>
      )}
    </div>
  );
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
      );
    case "textarea":
      return (
        <label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={field.allowMdx === true}
            onCheckedChange={(checked) =>
              onChange({ allowMdx: checked === true })
            }
          />
          Autoriser la mise en forme MDX de la valeur
        </label>
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
    ["postalCodeField", "Code postal"],
    ["townField", "Ville"],
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
