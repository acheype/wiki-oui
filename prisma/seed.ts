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

  [wikiConfig.layoutPages.titre]: `WikiOui
`,

  [wikiConfig.layoutPages.menuHaut]: `{/* Une liste imbriquée dans <Menu> devient un menu à plusieurs niveaux (voir l'aide-mémoire). */}

<Menu>
- [Accueil](page-principale)
</Menu>
`,

  [wikiConfig.layoutPages.rapideHaut]: `[Accueil](page-principale) · [Aide-mémoire](aide-memoire)

<Menu>
- <Bouton icone="roue" texte="Configuration" />
  - [Titre du site](page-titre)
  - [Menu principal](page-menu-haut)
  - [Accès rapide](page-rapide-haut)
  - [Bandeau](page-header)
  - [Pied de page](page-footer)
</Menu>
`,

  [wikiConfig.layoutPages.header]: `{/* Contenu affiché dans le bandeau d'en-tête, sous le menu. */}
`,

  [wikiConfig.layoutPages.footer]: `Propulsé par **WikiOui**.
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

- Menu de navigation : une liste imbriquée entre \`<Menu>\` et \`</Menu>\` devient un menu à plusieurs niveaux. Un item est un texte, un lien ou un \`<Bouton>\`.
- Bouton : \`<Bouton icone="roue" texte="Configuration" lien="ma-page" />\` — icônes disponibles : roue, maison, aide, crayon, page, calendrier, etoile, utilisateur.

\`\`\`
<Menu>
- [Accueil](page-principale)
- Rubrique
  - [Une page](une-page)
</Menu>
\`\`\`

## Attributs (avancé)

Ajoutez un identifiant ou une classe à l'élément qui précède :

- \`# Mon titre {{ id: 'ancre' }}\` — puis \`[lien](autre-page#ancre)\`
- \`[lien](une-page){{ className: 'btn' }}\` — sans espace avant \`{{\`
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
