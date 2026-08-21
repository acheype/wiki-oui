// Sample entries for the builder preview (docs/entries-view.md): when no
// form is chosen or the form has no entries yet, the preview renders 3–6
// generated entries with plausible values per field type — the FormBuilder
// template-preview motif. Pure and deterministic: same schema, same samples.

import type { ViewEntry } from "@/modules/entries-view/rules";
import type { FormDescriptor, FormField } from "./form-descriptor";
import { isOptionsField } from "./form-descriptor";

export const SAMPLE_COUNT = 5;

/** The sentinel image value: views render their neutral placeholder for it
 * (there may be no uploaded file to point at). */
export const SAMPLE_IMAGE = "$sample-image";

const SAMPLE_TITLES = [
  "Les Jardins partagés",
  "Atelier vélo du centre",
  "Fête de quartier",
  "La Ressourcerie",
  "Café des habitants",
  "Grainothèque mobile",
];

const SAMPLE_WORDS = [
  "Un lieu ouvert à toutes et à tous, animé par des bénévoles.",
  "Rendez-vous chaque semaine pour partager savoir-faire et convivialité.",
  "Une initiative locale née d'une envie de faire ensemble.",
  "Entrée libre, venez comme vous êtes.",
  "Projet porté par le collectif du quartier depuis trois ans.",
  "On y répare, on y échange, on y apprend.",
];

const SAMPLE_TOWNS = ["Nouméa", "Dumbéa", "Païta", "Mont-Dore", "Koné", "Bourail"];
const SAMPLE_NAMES = ["Camille", "Dominique", "Sacha", "Andrée", "Maxime", "Claude"];
const SAMPLE_TAGS = ["nature", "entraide", "culture", "sport", "jeunesse"];

/** yyyy-mm-dd shifted from `today` by a few days, one per sample index. */
function sampleDay(today: string, index: number, span: number): string {
  const offsets = [-3, 2, 7, 12, 19, 26];
  const days = Math.round((offsets[index % offsets.length] * span) / 7);
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Geo points dispersed around a common center, so a map preview shows a
// plausible scatter instead of a stack.
function samplePoint(index: number): { lat: number; lng: number } {
  const around = { lat: 46.6, lng: 2.4 };
  const angle = (index * 2 * Math.PI) / SAMPLE_COUNT;
  return {
    lat: Math.round((around.lat + Math.sin(angle) * 1.8) * 1e4) / 1e4,
    lng: Math.round((around.lng + Math.cos(angle) * 2.6) * 1e4) / 1e4,
  };
}

function sampleValue(
  field: FormField,
  index: number,
  today: string
): unknown {
  if (isOptionsField(field)) {
    const options = Object.keys(field.options ?? {});
    if (options.length === 0) return undefined;
    if (field.type === "multiChoice") {
      return [
        options[index % options.length],
        ...(index % 2 === 0 && options.length > 1
          ? [options[(index + 1) % options.length]]
          : []),
      ];
    }
    return options[index % options.length];
  }
  switch (field.type) {
    case "title":
      return SAMPLE_TITLES[index % SAMPLE_TITLES.length];
    case "text":
      return field.subtype === "number"
        ? (index + 1) * 12
        : SAMPLE_TOWNS[index % SAMPLE_TOWNS.length];
    case "textarea":
      return SAMPLE_WORDS[index % SAMPLE_WORDS.length];
    case "email":
      return `${SAMPLE_NAMES[index % SAMPLE_NAMES.length].toLowerCase()}@exemple.org`;
    case "url":
      return "https://exemple.org";
    case "date":
      return sampleDay(today, index, 7);
    case "image":
      return SAMPLE_IMAGE;
    case "file":
      return undefined;
    case "geolocation":
      return samplePoint(index);
    case "tags":
      return [
        SAMPLE_TAGS[index % SAMPLE_TAGS.length],
        SAMPLE_TAGS[(index + 2) % SAMPLE_TAGS.length],
      ];
    case "customContent":
      return undefined;
  }
}

/** A generic schema for the no-form-chosen preview: title + type + date. */
export const FALLBACK_SAMPLE_DESCRIPTOR: FormDescriptor = {
  fields: [
    { type: "title", name: "title", label: "Titre" },
    {
      type: "list",
      name: "type",
      label: "Type",
      options: { initiative: "Initiative", evenement: "Événement", lieu: "Lieu" },
    },
    { type: "textarea", name: "description", label: "Description" },
    { type: "date", name: "date", label: "Date" },
    { type: "image", name: "image", label: "Image" },
    { type: "geolocation", name: "position", label: "Position" },
  ],
};

/**
 * Generates the sample entries for a form's schema. Pseudo-fields are filled
 * too ($createdAt/$editedAt around `today`, $owner, $form when given), so a
 * view configured on them previews sensibly.
 */
export function sampleEntries(
  descriptor: FormDescriptor,
  today: string,
  formSlug?: string
): ViewEntry[] {
  return Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const values: Record<string, unknown> = {};
    for (const field of descriptor.fields) {
      const value = sampleValue(field, index, today);
      if (value !== undefined) values[field.name] = value;
    }
    values.$owner = SAMPLE_NAMES[index % SAMPLE_NAMES.length];
    values.$createdAt = `${sampleDay(today, index, -14)}T10:00:00.000Z`;
    values.$editedAt = `${sampleDay(today, index, -7)}T10:00:00.000Z`;
    if (formSlug) values.$form = formSlug;
    const title = values.title;
    return {
      slug: `fiche-exemple-${index + 1}`,
      title:
        typeof title === "string" && title !== ""
          ? title
          : SAMPLE_TITLES[index % SAMPLE_TITLES.length],
      values,
    };
  });
}
