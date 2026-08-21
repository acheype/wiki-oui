// Seeds the special pages (reserved slugs, ADR 0004), the example forms and
// their example entries, and the example MDX pages that showcase them
// (<EntriesView>, <EntryForm>) — the WikiOui counterpart of a fresh YesWiki
// install's default content (docs/reference/yeswiki-seed/). Idempotent:
// existing pages/forms/entries/files are left untouched so user edits
// survive a re-seed.
import "dotenv/config";
import { mkdir, copyFile, access } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "../lib/generated/prisma/client";
import { PrismaClient } from "../lib/generated/prisma/client";
import {
  computeAutomaticTitle,
  parseFormDescriptor,
  withTitleOrdered,
} from "../lib/form-descriptor";
import { bornFormPermissions } from "../modules/permissions/form-level";
import { storedRights } from "../modules/permissions/rules";
import { specialSlugs, wikiConfig } from "../wiki.config";
import { formSeeds } from "./seed/forms";
import { pageSeeds, topMenuContent } from "./seed/pages";
import { entrySeeds, IMAGE_ASSETS } from "./seed/entries";

const ASSETS_DIR = path.join(__dirname, "seed/assets");
const FILES_DIR = path.join(process.cwd(), "files");

const defaultContent: Record<string, string> = {
  [wikiConfig.homeSlug]: `# Félicitations, votre wiki est installé !

**Pour modifier cette page, ouvrez [page-principale/edit](page-principale/edit).**

## WikiOui : un outil convivial et collaboratif

WikiOui a été conçu pour rester **simple d'usage**. Toutes les pages sont écrites en MDX (Markdown + composants interactifs) et **éditables en ligne**, sans rien installer.

Vous pourrez notamment :

- modifier une page, tapez simplement son adresse dans le navigateur pour la créer : \`/ma-nouvelle-page\`
- (ré)organiser le [menu du haut](page-menu-haut)
- concevoir des **formulaires pour récolter des données** diverses, depuis la page [formulaires](formulaires)
- présenter ces données [sous des rendus variés](exemple-formulaire) (agenda, carte, listes, annuaire, galerie…) grâce au composant \`<EntriesView>\`
- **renommer** une page, une fiche ou un formulaire sans jamais casser les liens qui pointent vers eux
- retrouver l'historique complet de chaque page et **restaurer une version précédente** à tout moment

La syntaxe complète est résumée dans l'[aide-mémoire](aide-memoire).

Si vous voulez vous exercer sereinement, essayez de modifier la page [bac à sable](bac-a-sable), où quelques défis vous seront proposés.
`,

  [wikiConfig.layoutPages.title]: `WikiOui
`,

  [wikiConfig.layoutPages.topMenu]: topMenuContent,

  [wikiConfig.layoutPages.topQuickAccess]: `<Menu>
  - <Button icon="lucide:settings"/>
    - [Titre du site](page-titre)
    - [Menu principal](page-menu-haut)
    - [Accès rapide](page-rapide-haut)
    - [Bandeau](page-header)
    - [Pied de page](page-footer)
    - [Formulaires](formulaires)
    - [Utilisateurs](gerer-utilisateurs)
    - [Pages et droits](gerer-pages)
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

  // Both halves of the accounts screen, stacked (docs/permissions.md § Les
  // écrans) — the components themselves refuse to render for anyone but an
  // administrator, so the page needs no special status of its own.
  "gerer-utilisateurs": `<UsersAdmin />

<GroupsAdmin />
`,

  // The rights of the whole wiki, and the action by lot that changes them
  // (docs/permissions.md § gerer-pages).
  "gerer-pages": `<PagesAdmin />
`,

  // The account screens, hosted by pages like every other screen (ADR 0028).
  // Each page holds nothing but its component: the form draws its own title,
  // and anything written above it would sit over the screen.
  [wikiConfig.authPages.signIn]: `<SignIn />
`,

  [wikiConfig.authPages.signUp]: `<SignUp />
`,

  [wikiConfig.authPages.forgotPassword]: `<ForgotPassword />
`,

  [wikiConfig.authPages.invitation]: `<Invitation />
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
- Intégrer une page : \`<Iframe link="https://example.com" title="Description pour les lecteurs d'écran" />\` pour un autre site — ou décochez « Page d'un autre site web » pour afficher une page du wiki. Si le site vous donne un extrait \`<iframe>\` tout fait (YouTube, OpenStreetMap…), collez-le directement, il fonctionne tel quel.

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

## Balises HTML (avancé)

Vous pouvez écrire directement les balises qui mettent en forme du texte : \`<div>\`, \`<span>\`, \`<details>\`/\`<summary>\`, \`<figure>\`, \`<sup>\`, \`<sub>\`, \`<kbd>\`, \`<mark>\`, \`<abbr>\`, les titres, les listes et les tableaux. Ainsi que \`<iframe>\`, pour coller l'extrait d'intégration d'un autre site.

Les autres ne sont pas affichées — \`<script>\`, \`<style>\`, \`<form>\`, \`<object>\`, \`<embed>\`, \`<link>\`. L'éditeur vous prévient avant d'enregistrer.
`,
};

// Writing is `authenticated` rather than the configured default: seeded pages
// have no owner, so a default of « seulement » would ship the aide-mémoire and
// the sandbox closed to everyone but an administrator.
//
// No « seulement » list either: it can only name accounts and groups, and at
// seed time none exists.
const SEEDED_RIGHTS = {
  readScope: storedRights(
    wikiConfig.permissions.defaultPageRead,
    wikiConfig.permissions.defaultPageWrite
  ).readScope,
  writeScope: "authenticated",
} as const;

// Shared two-step creation (docs/architecture.md): the current-revision
// pointer can only be set once the revision row exists.
//
// Seeded content is born without an owner — the seed writes before anyone can
// be a person acting, and it stays free of BetterAuth (ADR 0023). The
// installation screen then takes the special pages under its account (ADR
// 0027); the example pages keep none, so demonstration content has no false
// owner.
async function createMdxPage(
  prisma: PrismaClient,
  slug: string,
  content: string,
  createdAt?: Date
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: { slug, ...SEEDED_RIGHTS, ...(createdAt && { createdAt }) },
    });
    const revision = await tx.revision.create({
      data: { pageId: page.id, content, ...(createdAt && { createdAt }) },
    });
    await tx.page.update({
      where: { id: page.id },
      data: { currentRevisionId: revision.id },
    });
  });
}

async function createEntryPage(
  prisma: PrismaClient,
  formId: string,
  formName: string,
  slug: string,
  data: Prisma.InputJsonValue,
  createdAt: Date
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Same default as modules/pages/entries.ts: the form's name, not the fiche's own
    // `tags` field (docs/forms.md § Mots-clés ≠ tags de Page).
    const page = await tx.page.create({
      data: { slug, formId, tags: [formName], createdAt, ...SEEDED_RIGHTS },
    });
    const revision = await tx.revision.create({
      data: { pageId: page.id, data, createdAt },
    });
    await tx.page.update({
      where: { id: page.id },
      data: { currentRevisionId: revision.id },
    });
  });
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

// Copies the seed's example images into files/ (ADR 0012: the filesystem
// pool, not a Prisma table) under the fixed names entries.ts references.
async function seedImageAssets(): Promise<void> {
  await mkdir(FILES_DIR, { recursive: true });
  for (const [poolName, assetName] of Object.entries(IMAGE_ASSETS)) {
    const target = path.join(FILES_DIR, poolName);
    if (await fileExists(target)) {
      console.log(`= files/${poolName} (déjà présent, inchangé)`);
      continue;
    }
    await copyFile(path.join(ASSETS_DIR, assetName), target);
    console.log(`+ files/${poolName}`);
  }
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  // On a deployed instance the seed runs at every container start
  // (docker-entrypoint.sh). SEED_ONLY_IF_EMPTY makes it a one-shot install
  // step: a fresh database is populated once, but pages/forms/entries the
  // operator later deletes are never silently recreated on restart (ADR 0021).
  // Unset (dev / manual `pnpm prisma db seed`), the seed stays idempotent and
  // tops up whatever is missing.
  if (process.env.SEED_ONLY_IF_EMPTY && (await prisma.page.count()) > 0) {
    console.log("Base de données déjà peuplée, seed ignoré.");
    await prisma.$disconnect();
    return;
  }

  for (const slug of specialSlugs) {
    const existing = await prisma.page.findUnique({ where: { slug } });
    if (existing) {
      console.log(`= ${slug} (déjà présente, inchangée)`);
      continue;
    }
    await createMdxPage(prisma, slug, defaultContent[slug] ?? "");
    console.log(`+ ${slug}`);
  }

  for (const form of formSeeds) {
    const existing = await prisma.form.findUnique({ where: { slug: form.slug } });
    if (existing) {
      console.log(`= formulaire ${form.slug} (déjà présent, inchangé)`);
      continue;
    }
    await prisma.form.create({
      data: {
        slug: form.slug,
        name: form.name,
        // Born with the wiki's own three rules, copied and never linked (ADR
        // 0026) — the same stamp saveForm puts on a form the builder creates.
        schema: {
          ...form.schema,
          permissions: bornFormPermissions(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    console.log(`+ formulaire ${form.slug}`);
  }

  await seedImageAssets();

  for (const [slug, content] of Object.entries(pageSeeds)) {
    const existing = await prisma.page.findUnique({ where: { slug } });
    if (existing) {
      console.log(`= ${slug} (déjà présente, inchangée)`);
      continue;
    }
    await createMdxPage(prisma, slug, content);
    console.log(`+ ${slug}`);
  }

  const forms = await prisma.form.findMany({
    where: { slug: { in: entrySeeds.map((entry) => entry.formSlug) } },
  });
  const formBySlug = new Map(forms.map((form) => [form.slug, form]));

  for (const entry of entrySeeds) {
    const existing = await prisma.page.findUnique({ where: { slug: entry.slug } });
    if (existing) {
      console.log(`= fiche ${entry.slug} (déjà présente, inchangée)`);
      continue;
    }
    const form = formBySlug.get(entry.formSlug);
    if (!form) {
      console.warn(`! formulaire «\u00A0${entry.formSlug}\u00A0» introuvable pour ${entry.slug}, ignoré`);
      continue;
    }
    // Like every other writer (ADR 0020): the title is computed here and
    // stored in `data`. The seeded Annuaire has an automatic title, so its
    // entries carry no `title` key of their own.
    const descriptor = parseFormDescriptor(form.schema).descriptor;
    const title = descriptor
      ? computeAutomaticTitle(descriptor, entry.data)
      : "";
    if (title.trim() === "") {
      throw new Error(`Titre vide pour la fiche «\u00A0${entry.slug}\u00A0»`);
    }
    const createdAt = new Date();
    createdAt.setUTCDate(createdAt.getUTCDate() + entry.daysOffset);
    // Ordered by the form's own fields (docs/permissions.md § /{slug}/raw),
    // like every other writer — title lands wherever the form's own title
    // field sits, never forced to the front.
    const data = descriptor
      ? withTitleOrdered(descriptor, entry.data, title)
      : { ...entry.data, title };
    await createEntryPage(
      prisma,
      form.id,
      form.name,
      entry.slug,
      data as Prisma.InputJsonValue,
      createdAt
    );
    console.log(`+ fiche ${entry.slug}`);
  }

  await prisma.$disconnect();
}

main();
