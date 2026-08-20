import { describe, expect, it } from "vitest";
import {
  type FormDescriptor,
  computeAutomaticTitle,
  deriveEntrySchema,
  emptyTitleMessage,
  extractFieldReferences,
  formAuthoringIssues,
  initialEntryValues,
  orderedEntryData,
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

  // The slug format is an authoring rule now (formAuthoringIssues): parsing
  // stays permissive so a stored descriptor keeps loading, and so the empty
  // label that derives an empty identifier can be reported as such.
  it("parses a field name outside the slug format", () => {
    const raw = {
      fields: [
        { type: "title", name: "title", label: "Titre de la fiche" },
        { type: "text", name: "Prénom", label: "Prénom" },
      ],
    };
    expect(parseFormDescriptor(raw).descriptor).toBeDefined();
  });

  it("rejects duplicate field names, pointing at the second", () => {
    const descriptor = contactDescriptor();
    descriptor.fields.push({ type: "text", name: "prenom", label: "Bis" });
    const result = parseFormDescriptor(descriptor);
    expect(result).toEqual({
      issues: [
        { fieldIndex: 2, message: "Deux champs portent le nom «\u00A0prenom\u00A0»." },
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
            "Le formulaire doit comporter le champ «\u00A0Titre de la fiche\u00A0».",
        },
      ],
    });
  });

  // The « one per form » rule went with the coupling to Page.tags: a
  // « Mots-clés » field is now an ordinary field of the fiche, and a form may
  // hold as many as it has kinds of keyword.
  it("accepts several tags fields", () => {
    const descriptor = contactDescriptor();
    descriptor.fields.push(
      { type: "tags", name: "themes", label: "Thèmes" },
      { type: "tags", name: "publics", label: "Publics" }
    );
    expect(parseFormDescriptor(descriptor).descriptor).toBeDefined();
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
            "Le titre automatique référence un champ inconnu : «\u00A0prenon\u00A0».",
        },
      ],
    });
  });

  // A blank gabarit stays readable, so it is a saveForm rule, not a parsing
  // one (formAuthoringIssues) — a form already stored with one must keep
  // loading, or its author could no longer open it to fix it.
  it("still parses an automatic title left without a template", () => {
    const descriptor = contactDescriptor();
    descriptor.fields[0] = {
      type: "title",
      name: "title",
      label: "Titre de la fiche",
      automatic: true,
      template: "",
    };
    expect(parseFormDescriptor(descriptor)).toEqual({ descriptor });
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
            "Le champ «\u00A0Statut\u00A0» doit tirer ses options des paires saisies ou d'un formulaire source.",
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
            "Le champ «\u00A0Statut\u00A0» doit tirer ses options des paires saisies ou d'un formulaire source.",
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
            "La valeur par défaut «\u00A0president\u00A0» ne fait pas partie des options.",
        },
      ],
    });
  });

  // The « Accès » tab writes into the same descriptor as the canvas
  // (docs/permissions.md § Formulaire), so what it poses has to survive the
  // round trip Zod puts every save through — an object stripped on the way in
  // would look exactly like defaults that never got copied.
  it("keeps the three rights the « Accès » tab poses", () => {
    const descriptor = contactDescriptor();
    descriptor.permissions = {
      createEntry: { scope: "authenticated" },
      defaultEntryRead: { scope: "everyone" },
      defaultEntryWrite: { scope: "restricted", groupSlugs: ["bureau"] },
    };
    expect(parseFormDescriptor(descriptor).descriptor?.permissions).toEqual(
      descriptor.permissions
    );
  });

  it("reads back a form saved before the tab existed", () => {
    const parsed = parseFormDescriptor(contactDescriptor());
    expect(parsed.descriptor?.permissions).toBeUndefined();
    expect(parsed.issues).toBeUndefined();
  });

  it("refuses a scope the vocabulary does not have", () => {
    const descriptor = {
      ...contactDescriptor(),
      permissions: {
        createEntry: { scope: "admins" },
        defaultEntryRead: { scope: "everyone" },
        defaultEntryWrite: { scope: "everyone" },
      },
    };
    expect(parseFormDescriptor(descriptor).descriptor).toBeUndefined();
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

  // "" is the empty every entry field shares (initialEntryValues), so an
  // optional numeric field has to accept it like the string ones do.
  it("accepts the shared empty on an optional numeric field", () => {
    expect(schema.safeParse({ ...validData, age: "" }).success).toBe(true);
    expect(
      schema.safeParse(initialEntryValues(descriptor, validData)).success
    ).toBe(true);
  });

  it("still rejects a non-numeric value on a numeric field", () => {
    expect(schema.safeParse({ ...validData, age: "trente" }).success).toBe(
      false
    );
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

// docs/permissions.md § /{slug}/raw: storage makes no order promise (jsonb),
// so a snapshot's keys are rebuilt in the form's own order wherever that
// order has to be relied on — this is the one function that does it.
describe("orderedEntryData", () => {
  const descriptor: FormDescriptor = {
    fields: [
      { type: "title", name: "title", label: "Titre de la fiche" },
      { type: "text", name: "prenom", label: "Prénom" },
      { type: "text", name: "nom", label: "Nom" },
    ],
  };

  it("reorders a snapshot to the form's own field order", () => {
    expect(
      orderedEntryData(descriptor, { nom: "Durand", title: "Marie Durand", prenom: "Marie" })
    ).toEqual({ title: "Marie Durand", prenom: "Marie", nom: "Durand" });
    expect(
      Object.keys(
        orderedEntryData(descriptor, { nom: "Durand", title: "Marie Durand", prenom: "Marie" })
      )
    ).toEqual(["title", "prenom", "nom"]);
  });

  // A schema that moved on leaves a value behind (docs/architecture.md's
  // graceful degradation): kept, not dropped, just no longer part of the form.
  it("keeps a value no field claims, trailing in its own order", () => {
    const data = { ancien: "valeur orpheline", title: "Marie Durand", autre: "aussi" };
    expect(Object.keys(orderedEntryData(descriptor, data))).toEqual([
      "title",
      "ancien",
      "autre",
    ]);
  });

  it("leaves out a field the snapshot never carried", () => {
    expect(Object.keys(orderedEntryData(descriptor, { title: "Marie" }))).toEqual([
      "title",
    ]);
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

// ADR 0020: the title is stored, so the refusal has to name the fields the
// author can fill — in automatic mode the title field is not on screen.
// Checked at save (saveForm) rather than at parse, so a form already stored
// with a blank gabarit still opens in the FormBuilder to be repaired.
describe("formAuthoringIssues", () => {
  const withField = (patch: Record<string, unknown>): FormDescriptor => {
    const descriptor = contactDescriptor();
    descriptor.fields[1] = {
      ...descriptor.fields[1],
      ...patch,
    } as FormDescriptor["fields"][number];
    return descriptor;
  };
  const withTitle = (patch: Record<string, unknown>): FormDescriptor => {
    const descriptor = contactDescriptor();
    descriptor.fields[0] = {
      ...descriptor.fields[0],
      ...patch,
    } as FormDescriptor["fields"][number];
    return descriptor;
  };

  it("accepts a descriptor whose required settings are all filled", () => {
    expect(formAuthoringIssues(contactDescriptor())).toEqual([]);
  });

  // «\u00A0Libellé\u00A0» carries an asterisk on every field type, so every field type
  // owes it a value — the generic rule, not a title special case.
  it.each([
    ["empty", ""],
    ["blank", "   "],
  ])("refuses a field whose label is %s", (_case, label) => {
    expect(formAuthoringIssues(withField({ label }))).toContainEqual({
      fieldIndex: 1,
      message:
        "«\u00A0Libellé\u00A0» est obligatoire pour le champ «\u00A0Texte court\u00A0».",
    });
  });

  // Naming the field by its label would name it "" — the missing setting
  // itself — so the refusal falls back on the type it was dropped from.
  it("names a label-less field by its type", () => {
    const [issue] = formAuthoringIssues(withField({ type: "date", label: "" }));
    expect(issue.message).toContain("«\u00A0Champ date\u00A0»");
  });

  it("refuses a field whose identifier is empty", () => {
    expect(formAuthoringIssues(withField({ name: "" }))).toEqual([
      {
        fieldIndex: 1,
        message:
          "«\u00A0Identifiant\u00A0» est obligatoire pour le champ «\u00A0Prénom\u00A0».",
      },
    ]);
  });

  // The slug format moved off the parsing path, so it has to be caught here
  // — with words instead of the Zod pattern the author cannot read.
  it("refuses an identifier that is not slug-shaped", () => {
    expect(formAuthoringIssues(withField({ name: "Prénom Usuel" }))).toEqual([
      {
        fieldIndex: 1,
        message:
          "L'identifiant «\u00A0Prénom Usuel\u00A0» du champ «\u00A0Prénom\u00A0» est invalide (minuscules, chiffres et tirets).",
      },
    ]);
  });

  // The title's identifier is the fixed `title`: the panel never shows it,
  // so it is not the author's to fill.
  it("never asks the title field for an identifier", () => {
    expect(formAuthoringIssues(withTitle({ name: "" }))).toEqual([]);
  });

  // form-id and metadata are what /{slug}/raw itself writes next to a
  // fiche's fields (docs/permissions.md § /{slug}/raw) — a field carrying
  // either name would silently collide with that, so it is refused here,
  // before such a descriptor can ever be saved.
  it.each(["content", "form-id", "metadata"])(
    "refuses a field named %s, reserved by /{slug}/raw",
    (name) => {
      expect(formAuthoringIssues(withField({ name }))).toEqual([
        {
          fieldIndex: 1,
          message: `L'identifiant « ${name} » est réservé à \`/{slug}/raw\` et ne peut pas nommer un champ.`,
        },
      ]);
    }
  );

  it.each([
    ["absent", {}],
    ["empty", { template: "" }],
    ["blank", { template: "   " }],
  ])("refuses an automatic title whose gabarit is %s", (_case, template) => {
    expect(
      formAuthoringIssues(withTitle({ automatic: true, ...template }))
    ).toEqual([
      {
        fieldIndex: 0,
        message:
          "«\u00A0Gabarit du titre\u00A0» est obligatoire pour le champ «\u00A0Titre de la fiche\u00A0».",
      },
    ]);
  });

  it("accepts an automatic title carrying a gabarit", () => {
    expect(
      formAuthoringIssues(withTitle({ automatic: true, template: "{prenom}" }))
    ).toEqual([]);
  });

  // Without automatic mode the entry form shows the title field, so the
  // absent gabarit is simply the setting not being used.
  it("ignores a missing gabarit on a manual title", () => {
    expect(formAuthoringIssues(withTitle({ template: "" }))).toEqual([]);
  });

  it("reports every missing setting of the same field at once", () => {
    expect(formAuthoringIssues(withField({ label: "", name: "" }))).toHaveLength(
      2
    );
  });

  // The two leaks a field's rights open, refused at the form's save rather
  // than patched at render (docs/permissions.md § Champ) — a title is read
  // where no right is ever consulted: the URL, the menus, every list.
  describe("the two leaks of a restricted field", () => {
    const restricted = { scope: "restricted", groupSlugs: ["bureau"] } as const;

    it("refuses an automatic title referencing a read-restricted field", () => {
      const descriptor = withField({ readAcl: restricted });
      descriptor.fields[0] = {
        ...descriptor.fields[0],
        automatic: true,
        template: "{prenom}",
      } as FormDescriptor["fields"][number];
      expect(formAuthoringIssues(descriptor)).toEqual([
        {
          fieldIndex: 0,
          message:
            "Le titre automatique référence un champ à lecture restreinte : «\u00A0prenom\u00A0».",
        },
      ]);
    });

    it("accepts an automatic title referencing an open field", () => {
      expect(
        formAuthoringIssues(withTitle({ automatic: true, template: "{prenom}" }))
      ).toEqual([]);
    });

    // A restricted writing is another matter: the title stays visible, which
    // is the whole of what the invariant asks.
    it("accepts an automatic title referencing a write-restricted field", () => {
      const descriptor = withField({ writeAcl: restricted });
      descriptor.fields[0] = {
        ...descriptor.fields[0],
        automatic: true,
        template: "{prenom}",
      } as FormDescriptor["fields"][number];
      expect(formAuthoringIssues(descriptor)).toEqual([]);
    });

    it.each([
      ["authenticated" as const, {}],
      ["restricted" as const, { groupSlugs: ["bureau"] }],
    ])("refuses a title field restricted to %s readers", (scope, list) => {
      expect(formAuthoringIssues(withTitle({ readAcl: { scope, ...list } }))).toEqual([
        {
          fieldIndex: 0,
          message:
            "Le titre de la fiche ne peut pas être restreint en lecture : il nomme la fiche partout dans le wiki.",
        },
      ]);
    });

    // The panel offers neither setting on the title, so a descriptor carrying
    // one was written by hand — and this is what stands between it and a form
    // whose fiches nobody but @Bureau could ever create.
    it("refuses a title field restricted to some writers", () => {
      expect(formAuthoringIssues(withTitle({ writeAcl: restricted }))).toEqual([
        {
          fieldIndex: 0,
          message:
            "Le titre de la fiche ne peut pas être restreint en écriture : sans lui, personne d'autre ne pourrait créer de fiche.",
        },
      ]);
    });

    // A « Mots-clés » field carries its value in the snapshot like any other
    // (docs/forms.md): both its senses restrict, and neither is refused.
    it("accepts a restricted tags field, both senses", () => {
      const descriptor = contactDescriptor();
      descriptor.fields.push({
        type: "tags",
        name: "mots-cles",
        label: "Mots-clés",
        readAcl: restricted,
        writeAcl: restricted,
      });
      expect(formAuthoringIssues(descriptor)).toEqual([]);
    });
  });
});

describe("emptyTitleMessage", () => {
  const automatic = (template: string): FormDescriptor => ({
    fields: [
      {
        type: "title",
        name: "title",
        label: "Titre de la fiche",
        automatic: true,
        template,
      },
      { type: "text", name: "prenom", label: "Prénom" },
      { type: "text", name: "nom", label: "Nom" },
    ],
  });

  it("names the single field an automatic title draws from", () => {
    expect(emptyTitleMessage(automatic("{nom}"))).toBe(
      "Le titre de la fiche est calculé à partir de «\u00A0Nom\u00A0» : renseignez ce champ."
    );
  });

  it("lists every field the template draws from, deduplicated", () => {
    expect(emptyTitleMessage(automatic("{prenom} {nom} ({prenom})"))).toBe(
      "Le titre de la fiche est calculé à partir de «\u00A0Prénom\u00A0» et «\u00A0Nom\u00A0» : renseignez au moins l'un de ces champs."
    );
  });

  it("falls back to the plain message when the title is manual", () => {
    expect(emptyTitleMessage(contactDescriptor())).toBe(
      "Le titre de la fiche est vide."
    );
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
