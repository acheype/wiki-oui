import { describe, expect, it } from "vitest";
import type { ComponentBuilderSpec } from "./component-descriptors";
import { lintPageSource } from "./page-lint";

// The registry as the directory sees it: Menu is registered but has no .yaml,
// which is exactly the case whose props cannot be checked.
const REGISTRY = ["Image", "Button", "Menu"];

const BUILDERS = [
  {
    base: "image",
    name: "Image",
    defaults: {},
    descriptor: {
      label: "Image",
      properties: {
        file: { label: "Fichier", type: "file-list", required: true },
        alt: { label: "Texte alternatif", type: "text" },
        width: { label: "Largeur", type: "number" },
        align: {
          label: "Position",
          type: "list",
          default: "none",
          options: { none: "Aucune", left: "Gauche", center: "Centre" },
        },
        effects: { label: "Effets", type: "divider" },
      },
    },
  },
] as unknown as ComponentBuilderSpec[];

const lint = (source: string) => lintPageSource(source, REGISTRY, BUILDERS);
const messages = (source: string) => lint(source).map((w) => w.message);

describe("a page that holds up raises nothing", () => {
  it("accepts a well-formed component", () => {
    expect(lint('<Image file="a.png" width={400} align="left" />')).toEqual([]);
  });

  it("accepts plain markdown and html", () => {
    expect(lint("# Titre\n\nDu **gras**, un [lien](/page).\n")).toEqual([]);
  });

  it("stays silent on a registered component without a descriptor", () => {
    expect(lint("<Menu quoi=\"bidule\">\n- [A](/a)\n</Menu>")).toEqual([]);
  });
});

describe("what would silently do nothing", () => {
  it("flags an unknown component", () => {
    expect(messages('<Buton text="Salut" />')[0]).toContain(
      "« Buton » n'existe pas"
    );
  });

  it("flags a missing required attribute", () => {
    expect(messages("<Image />")[0]).toContain("attend l'attribut « file »");
  });

  it("flags an unknown attribute", () => {
    expect(messages('<Image file="a.png" foo="bar" />')[0]).toContain(
      "n'a pas d'attribut « foo »"
    );
  });

  it("flags a value outside the declared options", () => {
    expect(messages('<Image file="a.png" align="middle" />')[0]).toContain(
      "n'est pas une valeur attendue"
    );
  });

  it("flags a non-literal expression, as the sandbox drops it", () => {
    expect(messages('<Image file="a.png" width={someVar} />')[0]).toContain(
      "seules les valeurs littérales"
    );
  });

  it("flags a spread", () => {
    expect(messages('<Image file="a.png" {...props} />')[0]).toContain(
      "étalés"
    );
  });

  it("does not mistake a literal expression for an evaluable one", () => {
    expect(messages('<Image file="a.png" width={400} />')).toEqual([]);
  });

  it("reports the line, so the author can find it", () => {
    expect(lint('# Titre\n\ntexte\n\n<Buton />')[0].line).toBe(5);
  });

  it("treats a divider as no attribute at all", () => {
    // A divider is builder chrome, never a prop the component accepts.
    expect(messages('<Image file="a.png" effects="oui" />')[0]).toContain(
      "n'a pas d'attribut « effects »"
    );
  });
});

describe("MDX that does not even parse", () => {
  // Saving must never become impossible: the author owns the page, broken or
  // not. Throwing here would reject the action behind the save button.
  const BROKEN = [
    '<Image width= />',
    '<Image file="a.png"',
    '<Image width=400 />',
    "texte { cassé",
  ];

  it.each(BROKEN)("reports %j instead of throwing", (source) => {
    const found = lint(source);
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("ne compile pas");
  });

  it("points at the line it broke on", () => {
    expect(lint("# Titre\n\ntexte\n\n<Image width= />")[0].line).toBe(5);
  });
});

describe("what must never be flagged", () => {
  it("ignores JSX inside a code fence", () => {
    expect(lint('```mdx\n<Buton text="exemple" />\n```\n')).toEqual([]);
  });

  it("ignores a link to a page that does not exist yet", () => {
    // ADR 0006: a dangling wiki link is an invitation to create, not an error.
    expect(lint("Voir [cette page](/pas-encore-creee).")).toEqual([]);
  });
});
