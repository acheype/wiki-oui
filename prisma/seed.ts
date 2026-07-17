// Seeds the special pages (reserved slugs, ADR 0004). Idempotent: existing
// pages are left untouched so user edits survive a re-seed.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { specialSlugs, wikiConfig } from "../wiki.config";

const AUTHOR = "Anonyme";

const defaultContent: Record<string, string> = {
  [wikiConfig.homeSlug]: `# Bienvenue sur WikiOui

Ce wiki est le vôtre : chaque page est écrite en MDX et **éditable en ligne**.

- Pour modifier cette page, ouvrez [page-principale/edit](page-principale/edit).
- Pour créer une page, tapez son adresse dans le navigateur : \`/ma-nouvelle-page\`.
- La syntaxe est résumée dans l'[aide-mémoire](aide-memoire).
`,

  [wikiConfig.layoutPages.title]: `WikiOui
`,

  [wikiConfig.layoutPages.topMenu]: `{/* Une liste imbriquée dans <Menu> devient un menu à plusieurs niveaux (voir l'aide-mémoire).
   Menu d'exemple à adapter : les pages liées n'existent pas encore — cliquer dessus propose de les créer. */}

<Menu>
- L'association
  - [Présentation](presentation)
  - [L'équipe](equipe)
  - Documents
    - [Statuts](statuts)
    - [Comptes rendus](comptes-rendus)
- Activités
  - [Agenda](agenda)
  - [Ateliers](ateliers)
  - [Sorties nature](sorties-nature)
- [Contact](contact)
</Menu>
`,

  [wikiConfig.layoutPages.topQuickAccess]: `<Menu>
  - <Button icon="lucide:settings"/>
    - [Titre du site](page-titre)
    - [Menu principal](page-menu-haut)
    - [Accès rapide](page-rapide-haut)
    - [Bandeau](page-header)
    - [Pied de page](page-footer)
    - [Formulaires](formulaires)
</Menu>
`,

  [wikiConfig.layoutPages.header]: `{/* Contenu affiché dans le bandeau d'en-tête, sous le menu. */}
`,

  [wikiConfig.layoutPages.footer]: `Propulsé par **WikiOui**.
`,

  // The admin screens live in the wiki (ADR 0014): a special page whose
  // default content calls the built-in component. Editable, hence breakable
  // by edition — re-editing the page repairs it.
  formulaires: `<FormsAdmin />
`,

  fiches: `<EntriesAdmin />
`,

  "aide-memoire": `# Aide-mémoire

## Mise en forme

| Pour obtenir | Écrivez |
| --- | --- |
| **gras** | \`**gras**\` |
| *italique* | \`*italique*\` |
| ~~barré~~ | \`~~barré~~\` |
| \`code\` | \`\` \`code\` \`\` |

## Titres

\`# Titre 1\`, \`## Titre 2\`, \`### Titre 3\`…

## Listes

- Puces : \`- élément\`
- Numérotée : \`1. élément\`
- Tâches : \`- [ ] à faire\`, \`- [x] fait\`

## Liens

- Vers une page du wiki : \`[texte](slug-de-la-page)\`
- Vers l'extérieur : \`[texte](https://exemple.org)\`

## Blocs

- Citation : \`> texte\`
- Bloc de code : trois accents graves \`\`\` en début et fin
- Ligne horizontale : \`---\`
- Commentaire (invisible à l'affichage) : \`{/* note */}\`

## Tableaux

\`\`\`
| Colonne A | Colonne B |
| --- | --- |
| a | b |
\`\`\`

## Composants

- Menu de navigation : une liste imbriquée entre \`<Menu>\` et \`</Menu>\` devient un menu à plusieurs niveaux. Un item est un texte, un lien ou un \`<Button>\`.
- Bouton : \`<Button icon="lucide:settings" text="Configuration" link="ma-page" />\` — les icônes viennent des jeux Iconify embarqués (noms en anglais), à choisir via le sélecteur de l'éditeur.

\`\`\`
<Menu>
- [Accueil](page-principale)
- Rubrique
  - [Une page](une-page)
</Menu>
\`\`\`

## Annotations (avancé)

Ajoutez un identifiant ou une classe à l'élément qui précède :

- \`# Mon titre {{ id: 'ancre' }}\` — puis \`[lien](autre-page#ancre)\`
- \`Texte centré {{ className: 'text-center' }}\` — sans espace avant \`{{\`

Classes utilisables (les autres sont sans effet) :

- Alignement : \`text-left\`, \`text-center\`, \`text-right\`, \`text-justify\`
`,
};

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  for (const slug of specialSlugs) {
    const existing = await prisma.page.findUnique({ where: { slug } });
    if (existing) {
      console.log(`= ${slug} (déjà présente, inchangée)`);
      continue;
    }

    // Two-step creation (see docs/architecture.md): the current-revision
    // pointer can only be set once the revision row exists.
    await prisma.$transaction(async (tx) => {
      const page = await tx.page.create({
        data: { slug, ownerName: AUTHOR },
      });
      const revision = await tx.revision.create({
        data: {
          pageId: page.id,
          content: defaultContent[slug] ?? "",
          authorName: AUTHOR,
        },
      });
      await tx.page.update({
        where: { id: page.id },
        data: { currentRevisionId: revision.id },
      });
    });
    console.log(`+ ${slug}`);
  }

  await prisma.$disconnect();
}

main();
