import { describe, expect, it } from "vitest";
import {
  type FormDescriptor,
  computeAutomaticTitle,
  deriveEntrySchema,
  extractFieldReferences,
  initialEntryValues,
  parseFormDescriptor,
  substituteFieldReferences,
  unknownFieldReferences,
} from "./form-descriptor";
import { slugify } from "./slug";

// Minimal valid descriptor: the default-present title field plus one text
// field, the shape the FormBuilder writes into Form.schema (docs/forms.md).
function contactDescriptor(): FormDescriptor {
  return {
    fields: [
      { type: "title", name: "title", label: "Titre de la fiche" },
      { type: "text", name: "prenom", label: "Prénom", required: true },
    ],
  };
}

describe("parseFormDescriptor", () => {
  it("accepts a well-formed descriptor and returns it typed", () => {
    const raw: unknown = JSON.parse(JSON.stringify(contactDescriptor()));
    const result = parseFormDescriptor(raw);
    expect(result).toEqual({ descriptor: contactDescriptor() });
  });

  it("rejects a field with an unknown type, pointing at its index", () => {
    const raw = {
      fields: [
        { type: "title", name: "title", label: "Titre de la fiche" },
        { type: "textaera", name: "bio", label: "Bio" },
      ],
    };
    const result = parseFormDescriptor(raw);
    expect(result.issues?.[0].fieldIndex).toBe(1);
  });

  it("rejects a field name outside the slug format", () => {
    const raw = {
      fields: [
        { type: "title", name: "title", label: "Titre de la fiche" },
        { type: "text", name: "Prénom", label: "Prénom" },
      ],
    };
    const result = parseFormDescriptor(raw);
    expect(result.issues?.[0].fieldIndex).toBe(1);
  });

  it("rejects duplicate field names, pointing at the second", () => {
    const descriptor = contactDescriptor();
    descriptor.fields.push({ type: "text", name: "prenom", label: "Bis" });
    const result = parseFormDescriptor(descriptor);
    expect(result).toEqual({
      issues: [
        { fieldIndex: 2, message: "Deux champs portent le nom « prenom »." },
      ],
    });
  });

  it("rejects a descriptor without the title field", () => {
    const result = parseFormDescriptor({
      fields: [{ type: "text", name: "prenom", label: "Prénom" }],
    });
    expect(result).toEqual({
      issues: [
        {
          message:
            "Le formulaire doit comporter le champ « Titre de la fiche ».",
        },
      ],
    });
  });

  it("rejects a second tags field", () => {
    const descriptor = contactDescriptor();
    descriptor.fields.push(
      { type: "tags", name: "mots-cles", label: "Mots-clés" },
      { type: "tags", name: "themes", label: "Thèmes" }
    );
    const result = parseFormDescriptor(descriptor);
    expect(result).toEqual({
      issues: [
        {
          fieldIndex: 3,
          message: "Un seul champ « Mots-clés » par formulaire.",
        },
      ],
    });
  });

  it("accepts an automatic title whose template references existing fields", () => {
    const descriptor = contactDescriptor();
    descriptor.fields[0] = {
      type: "title",
      name: "title",
      label: "Titre de la fiche",
      automatic: true,
      template: "{prenom} (asso)",
    };
    expect(parseFormDescriptor(descriptor)).toEqual({ descriptor });
  });

  it("rejects an automatic title referencing an unknown field", () => {
    const descriptor = contactDescriptor();
    descriptor.fields[0] = {
      type: "title",
      name: "title",
      label: "Titre de la fiche",
      automatic: true,
      template: "{prenon} (asso)",
    };
    expect(parseFormDescriptor(descriptor)).toEqual({
      issues: [
        {
          fieldIndex: 0,
          message:
            "Le titre automatique référence un champ inconnu : « prenon ».",
        },
      ],
    });
  });

  it("accepts a list drawing its options from entered pairs", () => {
    const descriptor = contactDescriptor();
    descriptor.fields.push({
      type: "list",
      name: "statut",
      label: "Statut",
      options: { membre: "Membre", sympathisant: "Sympathisant" },
      defaultValue: "membre",
    });
    expect(parseFormDescriptor(descriptor)).toEqual({ descriptor });
  });

  it("rejects an options field without any options source", () => {
    const descriptor = contactDescriptor();
    descriptor.fields.push({ type: "radio", name: "statut", label: "Statut" });
    expect(parseFormDescriptor(descriptor)).toEqual({
      issues: [
        {
          fieldIndex: 2,
          message:
            "Le champ « Statut » doit tirer ses options des paires saisies ou d'un formulaire source.",
        },
      ],
    });
  });

  it("rejects an options field naming both sources at once", () => {
    const descriptor = contactDescriptor();
    descriptor.fields.push({
      type: "list",
      name: "statut",
      label: "Statut",
      options: { membre: "Membre" },
      sourceFormId: "annuaire",
    });
    expect(parseFormDescriptor(descriptor)).toEqual({
      issues: [
        {
          fieldIndex: 2,
          message:
            "Le champ « Statut » doit tirer ses options des paires saisies ou d'un formulaire source.",
        },
      ],
    });
  });

  it("rejects a default value outside the entered options", () => {
    const descriptor = contactDescriptor();
    descriptor.fields.push({
      type: "list",
      name: "statut",
      label: "Statut",
      options: { membre: "Membre" },
      defaultValue: "president",
    });
    expect(parseFormDescriptor(descriptor)).toEqual({
      issues: [
        {
          fieldIndex: 2,
          message:
            "La valeur par défaut « president » ne fait pas partie des options.",
        },
      ],
    });
  });
});

describe("extractFieldReferences", () => {
  it("extracts {champ} tokens from a template", () => {
    expect(extractFieldReferences("{prenom} {nom} (asso)")).toEqual([
      "prenom",
      "nom",
    ]);
  });

  it("ignores braces not holding a field-name shape", () => {
    expect(extractFieldReferences("{/* note */} {Maj} {a b}")).toEqual([]);
  });
});

describe("unknownFieldReferences", () => {
  it("lists template references matching no field", () => {
    expect(
      unknownFieldReferences("# {title}\n\n{prenon}", contactDescriptor())
    ).toEqual(["prenon"]);
  });

  it("is empty when every reference resolves", () => {
    expect(
      unknownFieldReferences("# {title}\n\n{prenom}", contactDescriptor())
    ).toEqual([]);
  });
});

describe("deriveEntrySchema", () => {
  // One descriptor exercising every value-carrying type (docs/forms.md).
  const descriptor: FormDescriptor = {
    fields: [
      { type: "title", name: "title", label: "Titre de la fiche" },
      { type: "text", name: "prenom", label: "Prénom", required: true },
      { type: "text", name: "age", label: "Âge", subtype: "number" },
      {
        type: "text",
        name: "code",
        label: "Code",
        maxLength: 4,
        pattern: "^[A-Z]+$",
      },
      { type: "textarea", name: "bio", label: "Bio" },
      { type: "email", name: "email", label: "Email", required: true },
      { type: "url", name: "site", label: "Site" },
      { type: "date", name: "naissance", label: "Naissance" },
      {
        type: "list",
        name: "statut",
        label: "Statut",
        options: { membre: "Membre", sympathisant: "Sympathisant" },
      },
      {
        type: "multiChoice",
        name: "ateliers",
        label: "Ateliers",
        required: true,
        options: { jardin: "Jardin", cuisine: "Cuisine" },
      },
      {
        type: "radio",
        name: "structure",
        label: "Structure",
        sourceFormId: "annuaire",
      },
      { type: "image", name: "photo", label: "Photo" },
      { type: "file", name: "statuts", label: "Statuts" },
      { type: "geolocation", name: "adresse", label: "Adresse" },
      { type: "tags", name: "mots-cles", label: "Mots-clés" },
      { type: "customContent", name: "note", label: "Note" },
    ],
  };
  const schema = deriveEntrySchema(descriptor);

  const validData = {
    title: "Alice",
    prenom: "Alice",
    email: "alice@exemple.org",
    ateliers: ["jardin"],
  };

  it("accepts a complete valid entry", () => {
    const result = schema.safeParse({
      ...validData,
      age: 34,
      code: "ABC",
      bio: "Bonjour",
      site: "https://exemple.org",
      naissance: "1992-03-14",
      statut: "membre",
      structure: "mon-asso",
      photo: "alice.jpg",
      statuts: "statuts.pdf",
      adresse: { lat: 47.21, lng: -1.55 },
      "mots-cles": ["jardin"],
    });
    expect(result.success).toBe(true);
  });

  it("requires a non-empty value for a required field", () => {
    expect(schema.safeParse({ ...validData, prenom: "" }).success).toBe(false);
    expect(
      schema.safeParse({ ...validData, prenom: undefined }).success
    ).toBe(false);
  });

  it("reports the required-field message in French", () => {
    const result = schema.safeParse({ ...validData, prenom: "" });
    expect(!result.success && result.error.issues[0].message).toBe(
      "Ce champ est obligatoire."
    );
  });

  it("accepts an absent or empty optional value", () => {
    expect(schema.safeParse(validData).success).toBe(true);
    expect(
      schema.safeParse({ ...validData, bio: "", site: "", naissance: "" })
        .success
    ).toBe(true);
  });

  it("validates the email format", () => {
    expect(
      schema.safeParse({ ...validData, email: "pas-un-email" }).success
    ).toBe(false);
  });

  it("validates the url format", () => {
    expect(
      schema.safeParse({ ...validData, site: "pas-une-url" }).success
    ).toBe(false);
  });

  it("stores a date as ISO yyyy-mm-dd", () => {
    expect(
      schema.safeParse({ ...validData, naissance: "14/03/1992" }).success
    ).toBe(false);
  });

  it("restricts inline options to their keys", () => {
    expect(
      schema.safeParse({ ...validData, statut: "president" }).success
    ).toBe(false);
  });

  it("requires at least one choice on a required multiChoice", () => {
    expect(schema.safeParse({ ...validData, ateliers: [] }).success).toBe(
      false
    );
  });

  it("accepts any slug for a form-sourced options field", () => {
    expect(
      schema.safeParse({ ...validData, structure: "une-fiche" }).success
    ).toBe(true);
  });

  it("types a number subtype as a number", () => {
    expect(schema.safeParse({ ...validData, age: "34" }).success).toBe(false);
  });

  it("enforces maxLength and pattern", () => {
    expect(schema.safeParse({ ...validData, code: "ABCDE" }).success).toBe(
      false
    );
    expect(schema.safeParse({ ...validData, code: "abc" }).success).toBe(
      false
    );
  });

  it("validates a geolocation as lat/lng numbers", () => {
    expect(
      schema.safeParse({ ...validData, adresse: { lat: "47", lng: -1 } })
        .success
    ).toBe(false);
  });

  it("gives customContent no data key", () => {
    expect(Object.keys(schema.shape)).not.toContain("note");
  });

  it("drops the title from the input schema in automatic mode", () => {
    const automatic: FormDescriptor = {
      fields: [
        {
          type: "title",
          name: "title",
          label: "Titre de la fiche",
          automatic: true,
          template: "{prenom}",
        },
        { type: "text", name: "prenom", label: "Prénom", required: true },
      ],
    };
    const derived = deriveEntrySchema(automatic);
    expect(Object.keys(derived.shape)).not.toContain("title");
    expect(derived.safeParse({ prenom: "Alice" }).success).toBe(true);
  });

  it("strips keys matching no field (orphans live in old snapshots only)", () => {
    const result = schema.safeParse({ ...validData, fantome: "x" });
    expect(result.success && "fantome" in result.data).toBe(false);
  });
});

describe("substituteFieldReferences", () => {
  it("replaces {champ} references with entry values", () => {
    expect(
      substituteFieldReferences("{prenom} {nom} (asso)", {
        prenom: "Alice",
        nom: "Dupont",
      })
    ).toBe("Alice Dupont (asso)");
  });

  it("renders an absent value as an empty string, silently", () => {
    expect(substituteFieldReferences("{prenom} {nom}", {})).toBe(" ");
  });

  it("stringifies non-text values", () => {
    expect(substituteFieldReferences("{age} ans", { age: 34 })).toBe("34 ans");
  });
});

describe("initialEntryValues", () => {
  it("seeds declared default values, leaving others empty", () => {
    const descriptor: FormDescriptor = {
      fields: [
        { type: "title", name: "title", label: "Titre de la fiche" },
        { type: "text", name: "prenom", label: "Prénom", defaultValue: "Alice" },
        { type: "text", name: "nom", label: "Nom" },
        {
          type: "multiChoice",
          name: "ateliers",
          label: "Ateliers",
          options: { jardin: "Jardin" },
          defaultValue: ["jardin"],
        },
      ],
    };
    expect(initialEntryValues(descriptor)).toEqual({
      title: "",
      prenom: "Alice",
      nom: "",
      ateliers: ["jardin"],
    });
  });

  it("prefills from an existing snapshot over the defaults", () => {
    const descriptor: FormDescriptor = {
      fields: [
        { type: "title", name: "title", label: "Titre de la fiche" },
        { type: "text", name: "prenom", label: "Prénom", defaultValue: "Alice" },
      ],
    };
    expect(initialEntryValues(descriptor, { prenom: "Bob" })).toEqual({
      title: "",
      prenom: "Bob",
    });
  });

  it("omits value-less fields (customContent, automatic title)", () => {
    const descriptor: FormDescriptor = {
      fields: [
        {
          type: "title",
          name: "title",
          label: "Titre de la fiche",
          automatic: true,
          template: "{prenom}",
        },
        { type: "text", name: "prenom", label: "Prénom" },
        { type: "customContent", name: "note", label: "Note" },
      ],
    };
    expect(Object.keys(initialEntryValues(descriptor))).toEqual(["prenom"]);
  });
});

describe("computeAutomaticTitle", () => {
  it("returns the manual title value when the title is not automatic", () => {
    const descriptor = contactDescriptor();
    expect(computeAutomaticTitle(descriptor, { title: "Alice" })).toBe("Alice");
  });

  it("recomputes an automatic title from its template", () => {
    const descriptor: FormDescriptor = {
      fields: [
        {
          type: "title",
          name: "title",
          label: "Titre de la fiche",
          automatic: true,
          template: "{prenom} {nom} (asso)",
        },
        { type: "text", name: "prenom", label: "Prénom" },
        { type: "text", name: "nom", label: "Nom" },
      ],
    };
    expect(
      computeAutomaticTitle(descriptor, { prenom: "Alice", nom: "Dupont" })
    ).toBe("Alice Dupont (asso)");
  });
});

describe("slugify", () => {
  it("derives a slug from a French label", () => {
    expect(slugify("Prénom de l'adhérent")).toBe("prenom-de-l-adherent");
  });

  it("returns an empty string when nothing survives", () => {
    expect(slugify("’’ !!")).toBe("");
  });
});
