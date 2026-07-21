// Example forms seeded alongside the special pages (docs/forms.md): the four
// YesWiki demo forms (Annuaire, Agenda, Blog-actu, Ressources — see
// docs/reference/yeswiki-seed/), translated to the WikiOui descriptor via the
// migration table (docs/reference/yeswiki-form-migration.md). They exist so a
// fresh install has real forms + entries to exercise <EntriesView> with.

import type { FormDescriptor } from "../../lib/form-descriptor";

export interface FormSeed {
  slug: string;
  name: string;
  schema: FormDescriptor;
}

const geolocationOf = (label: string): FormDescriptor["fields"][number] => ({
  type: "geolocation",
  name: "position",
  label,
  streetField: "adresse",
  postalCodeField: "code-postal",
  townField: "ville",
  geolocateButton: true,
});

export const formSeeds: FormSeed[] = [
  {
    slug: "annuaire",
    name: "Annuaire",
    schema: {
      fields: [
        {
          type: "title",
          name: "title",
          label: "Titre de la fiche",
          automatic: true,
          template: "{prenom} {nom}",
        },
        { type: "text", name: "prenom", label: "Prénom", required: true },
        { type: "text", name: "nom", label: "Nom", required: true },
        { type: "image", name: "photo", label: "Photo de présentation" },
        { type: "text", name: "fonction", label: "Fonction, rôle dans le collectif" },
        {
          type: "textarea",
          name: "presentation",
          label: "Présentation",
          rows: 5,
        },
        { type: "email", name: "email", label: "Email" },
        { type: "text", name: "structure", label: "Structure" },
        { type: "url", name: "site-web", label: "Site web" },
        { type: "text", name: "adresse", label: "Adresse" },
        { type: "text", name: "code-postal", label: "Code postal" },
        { type: "text", name: "ville", label: "Ville" },
        geolocationOf("Localisation"),
      ],
    },
  },
  {
    slug: "agenda",
    name: "Agenda",
    schema: {
      fields: [
        { type: "title", name: "title", label: "Nom de l'événement" },
        {
          type: "textarea",
          name: "description",
          label: "Description",
          rows: 6,
          allowMdx: true,
        },
        {
          type: "date",
          name: "date-debut",
          label: "Début de l'événement",
          initTodayButton: true,
          required: true,
        },
        {
          type: "date",
          name: "date-fin",
          label: "Fin de l'événement",
          initTodayButton: true,
        },
        { type: "url", name: "site-web", label: "Adresse url" },
        { type: "image", name: "photo", label: "Image (facultatif)" },
        { type: "file", name: "documents", label: "Documents" },
        { type: "text", name: "adresse", label: "Adresse" },
        { type: "text", name: "code-postal", label: "Code postal" },
        { type: "text", name: "ville", label: "Ville" },
        geolocationOf("Localisation"),
      ],
    },
  },
  {
    slug: "blog",
    name: "Blog-actu",
    schema: {
      fields: [
        { type: "image", name: "photo", label: "Image", required: true },
        { type: "title", name: "title", label: "Titre" },
        {
          type: "textarea",
          name: "chapeau",
          label: "Résumé",
          rows: 3,
          allowMdx: true,
        },
        {
          type: "textarea",
          name: "contenu",
          label: "Billet",
          rows: 9,
          allowMdx: true,
        },
      ],
    },
  },
  {
    slug: "ressources",
    name: "Ressources",
    schema: {
      fields: [
        { type: "title", name: "title", label: "Nom de la ressource" },
        { type: "url", name: "site-web", label: "Site web" },
        {
          type: "multiChoice",
          name: "type",
          label: "Type de ressource",
          options: {
            "site-ressource": "Site web ressource",
            "experience-inspirante": "Expérience inspirante",
            "partenaire-ressource": "Partenaire ressource",
            "methodologie-guide": "Méthodologie / guide",
          },
        },
        {
          type: "textarea",
          name: "description",
          label: "Description",
          rows: 5,
          allowMdx: true,
        },
        { type: "text", name: "auteur", label: "Auteur" },
        { type: "image", name: "photo", label: "Image de présentation" },
        { type: "file", name: "documents", label: "Documents" },
      ],
    },
  },
];
