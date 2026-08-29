# WikiOui

Conception : [`docs/architecture.md`](docs/architecture.md) (+ ADR dans `docs/adr/`), glossaire du domaine : [`CONTEXT.md`](CONTEXT.md), les cinq contrôles qui font échouer le build : [`docs/invariants.md`](docs/invariants.md).

## Organisation en modules

**Le code est rangé par concept du domaine** (ADR 0029) : `modules/<concept>/`, un dossier par concept de `CONTEXT.md`. Ailleurs, `app/` ne garde que les routes, `components/ui/` que les primitives shadcn, `lib/` que les utilitaires sans concept.

### La profondeur dit la visibilité

- Un fichier **à la racine** d'un module est **public** : n'importe quel module l'importe.
- Un fichier **dans un sous-dossier** est **privé** : seul son propre module l'importe.
- Deux sous-dossiers échappent à cette règle, et deux seulement : `ui/` et `wiki-components/` (voir le gabarit ci-dessous).
- La règle ESLint `wikioui/module-seam` le garde, imports relatifs et `import()` à gabarit compris.
- **Viser le module profond** (ADR 0030) : peu de fichiers et d'exports à la racine, toute la complexité dans les sous-dossiers.

### Le gabarit d'un module

| Contenu | Rôle |
| --- | --- |
| `<sujet>.ts` | Un sujet du module, nommé d'après le domaine et jamais d'après la forme du code. |
| `rules.ts` | Les règles pures. |
| `actions.ts` | Les Server Actions. `<sujet>-actions.ts` quand le module en a plusieurs (`forms/form-actions.ts`, `forms/entry-actions.ts`). |
| `<sujet>/` | Un sujet regroupé dans son propre dossier, pour le séparer du reste du module (`accounts/invitation/`, `forms/field-rename/`, `entries-view/views/`). Un sujet peut avoir les deux : `forms/entry-title.ts` en public, `forms/entry-title/` en privé. |
| `access/` | La couche d'accès du module (ADR 0025) : `guards.ts` pour les gardes — lire et trancher dans le même appel —, plus ses autres fichiers d'accès (`pages/access/page-rights.ts`). C'est un sous-dossier, donc la profondeur le rend privé, pas son nom. |
| `ui/` | Les composants React du module. Privé, **sauf pour `app/`**, qui les compose. |
| `wiki-components/` | Les composants wiki du module (ADR 0002), quand il en a. **Public** : le registre de composants l'atteint depuis l'extérieur, le module s'y déclarant par une entrée dans `modules/authoring/registry/sources.ts`. |

## Carte des modules

Une ligne par module : ce qu'il possède, quelle doc en détaille le fonctionnement, quel ADR le gouverne. L'arborescence répond à « quel dossier » ; cette carte répond à « qu'y a-t-il dedans ».

| Module | Gère | Doc | ADR |
| --- | --- | --- | --- |
| `pages` | `Page` : contenu, révisions, droits, fiches liées, `WikiFrame` | [`forms.md`](docs/forms.md), [`permissions.md`](docs/permissions.md) | 0025 |
| `forms` | `Form` : descripteur, rendu de fiche, titre automatique, renommage de champ | [`forms.md`](docs/forms.md), [`permissions.md`](docs/permissions.md) | 0014 |
| `permissions` | Niveaux d'accès, groupes, droits et droits par défaut, aux quatre étages (page, formulaire, champ, wiki) | [`permissions.md`](docs/permissions.md) | 0023, 0024, 0026 |
| `accounts` | `Account` (BetterAuth), identités, invitations, mailer | [`permissions.md`](docs/permissions.md) | 0023 |
| `entries-view` | `<EntriesView>`, ses neuf vues et leurs règles | [`entries-view.md`](docs/entries-view.md) | 0018 |
| `authoring` | Sandbox MDX, pipeline du registre de composants, ComponentBuilder, éditeur | [`component-builder.md`](docs/component-builder.md) | 0002, 0013 |
| `files` | Fichiers uploadés : stockage, redimensionnement | — | 0012 |
| `settings` | `Settings` : drapeau d'installation, paramétrage global | [`permissions.md`](docs/permissions.md) | 0027 |

## Conventions de code

- **Tout le code est en anglais** : noms de fichiers, composants (y compris les composants MDX du registre, ex. `<Button>`), props/attributs, variables, fonctions, clés de config, classes CSS. Le français est réservé à ce que voit ou tape l'utilisateur : textes d'UI, contenus seedés, slugs des pages spéciales, valeurs saisies par les auteurs (ex. noms d'icônes).
- **Les commentaires sont toujours en anglais** (le reste — docs, ADR, UI — est en français).
- **Préférer du code clair avec des noms explicites plutôt que des commentaires.** Un commentaire ne paraphrase jamais le code : il apporte une spécificité que le code ne peut pas montrer — la raison d'un choix, une contrainte externe, une référence d'ADR.
- **Viser le module profond** (ADR 0030) : beaucoup de comportement derrière peu d'interface. Un fichier racine est public, un sous-dossier est privé (ADR 0029) — approfondir un module, c'est donc réduire le nombre de fichiers et d'exports à sa racine, et cacher le reste dans ses sous-dossiers.
- **Faire le test de suppression avant d'ajouter un export racine.** Supprimer cette fonction : si la complexité disparaît, c'était un passe-plat ; si elle réapparaît chez N appelants, elle gagne sa place. Un export racine que personne n'importe depuis un autre module descend dans le sous-dossier de son sujet.
- **Une seule exception, le transport** : un passe-plat `"use server"` est légitime, un composant client ne pouvant pas atteindre la couche d'accès (`canAddForm`, `listFormChoices`, `canAddEntry`, `readInvitation`).
- **Préférer un test qui passe par la racine du module** : il décrit un comportement et survit aux refactorings internes. Tester directement un fichier privé reste admis quand la règle est du calcul pur (ex. `accounts/admin/rules.test.ts`).

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