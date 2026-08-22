# WikiOui

Conception : [`docs/architecture.md`](docs/architecture.md) (+ ADR dans `docs/adr/`), glossaire du domaine : [`CONTEXT.md`](CONTEXT.md).

## Organisation en modules

**Le code est rangé par concept du domaine, et la profondeur dit la visibilité** (ADR 0029) : `modules/<concept>/`, un dossier par concept de `CONTEXT.md`. `app/` ne garde que les routes, `components/ui/` que les primitives shadcn, `lib/` que les utilitaires sans concept. Un gabarit unique par module : `queries.ts` (les appels Prisma — jamais importé ailleurs, niché dans son propre sous-dossier `queries/` pour que ce soit garanti par la profondeur, pas par son nom), `<sujet>.ts` (un sujet du module), `actions.ts` (les Server Actions), `rules.ts` (les règles pures), `ui/` (les composants React du module), `<chantier>/` (un sous-sujet à deux moitiés, ex. `rules.ts` + `sweep.ts`). Un fichier **racine** s'importe depuis n'importe quel module ; un fichier de **sous-dossier** ne s'importe que depuis son propre module — sauf `ui/`, que `app/` seul peut composer depuis l'extérieur. Une règle ESLint (`wikioui/module-seam`) le garde.

## Carte des modules

Une ligne par module : ce qu'il possède, quelle doc en détaille le fonctionnement, quel ADR le gouverne. L'arborescence répond à « quel dossier » ; cette carte répond à « qu'y a-t-il dedans ».

| Module | Gère | Doc | ADR |
| --- | --- | --- | --- |
| `pages` | `Page` : contenu, révisions, droits, fiches liées, `WikiFrame` | [`forms.md`](docs/forms.md), [`permissions.md`](docs/permissions.md) | 0025 |
| `forms` | `Form` : descripteur, rendu de fiche, titre automatique, renommage de champ | [`forms.md`](docs/forms.md), [`permissions.md`](docs/permissions.md) | 0014 |
| `permissions` | Rôles, groupes, ACL, droits par défaut, niveaux page/formulaire/champ | [`permissions.md`](docs/permissions.md) | 0023, 0024, 0026 |
| `accounts` | `Account` (BetterAuth), identités, invitations, mailer | [`permissions.md`](docs/permissions.md) | 0023 |
| `entries-view` | `<EntriesView>`, ses neuf vues et leurs règles | [`entries-view.md`](docs/entries-view.md) | 0018 |
| `authoring` | Sandbox MDX, registre de composants, ComponentBuilder, éditeur | [`component-builder.md`](docs/component-builder.md) | 0002, 0013 |
| `files` | Fichiers uploadés : stockage, redimensionnement | — | 0012 |
| `settings` | `Settings` : drapeau d'installation, paramétrage global | [`permissions.md`](docs/permissions.md) | 0027 |

## Conventions de code

- **Tout le code est en anglais** : noms de fichiers, composants (y compris les composants MDX du registre, ex. `<Button>`), props/attributs, variables, fonctions, clés de config, classes CSS. Le français est réservé à ce que voit ou tape l'utilisateur : textes d'UI, contenus seedés, slugs des pages spéciales, valeurs saisies par les auteurs (ex. noms d'icônes).
- **Les commentaires sont toujours en anglais** (le reste — docs, ADR, UI — est en français).
- **Préférer du code clair avec des noms explicites plutôt que des commentaires.** Un commentaire ne paraphrase jamais le code : il apporte une spécificité que le code ne peut pas montrer — la raison d'un choix, une contrainte externe, une référence d'ADR.

## Règles de commit Git

- Toujours écrire le commit en anglais.
- Utiliser le format de Conventional Commits (feat, fix, refactor, docs, chore).
- Limiter l'objet (la première ligne) à 72 caractères maximum.
- Ajouter systématiquement un corps de message expliquant le raisonnement ou la motivation des changements.
- Référencer les numéros d'issue lorsque c'est pertinent.
- N'utiliser jamais de messages génériques tels que "fix bug" ou "update code".

## Conventions de rédaction

- Mettre toujours un espace insécable après « ou avant » dans les textes affichés à l'utilisateur.

## Conventions Markdown

- Dans les tableaux, la ligne de séparation doit utiliser le même espacement que les lignes de contenu : `| --- | --- |` (avec espaces), jamais `|---|---|` (règle markdownlint MD060, style « compact »).

## Agent skills

### Issue tracker

Les issues vivent dans GitHub Issues (`acheype/wiki-oui`), via le CLI `gh`. Voir `docs/agents/issue-tracker.md`.

### Triage labels

Les cinq rôles canoniques, libellés inchangés. Voir `docs/agents/triage-labels.md`.

### Domain docs

Contexte unique : `CONTEXT.md` + `docs/adr/` à la racine. Voir `docs/agents/domain.md`.