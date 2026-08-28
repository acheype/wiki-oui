# Le contrôle des droits passe par une couche d'accès unique, gardée par ESLint

`lib/pages.ts` et `lib/forms.ts` deviennent la **seule porte** vers `Page` et `Form`, et résolvent eux-mêmes la personne qui agit. Une règle ESLint interdit `prisma.page` et `prisma.form` partout ailleurs, avec une liste d'exceptions explicite (le seed, le balayage). Ni Row-Level Security, ni extension Prisma.

## Contexte

Le risque n'est pas d'écrire la mauvaise règle, c'est d'**oublier de l'appeler** — et un oubli en lecture ne casse rien : il divulgue, en silence, sans qu'aucun test ne rougisse. Or `lib/pages.ts` existait déjà sans être étanche : `prisma.page` et `prisma.form` étaient appelés directement dans six fichiers hors seed (environ 33 appels, dont les deux tiers dans `app/form-actions.ts`), y compris depuis un composant serveur qu'on ne penserait pas à auditer et qui énumérait les fiches d'un autre formulaire comme options d'un champ.

## Considered Options

**Gardes explicites à chaque point d'entrée.** Lisible et sans mécanisme caché, mais rien n'empêche d'en oublier une, et l'oubli ne se manifeste jamais.

**Extension Prisma** (`$extends` + `AsyncLocalStorage`). Séduisante parce qu'elle est *fail-closed* : oublier de désactiver un filtre casse bruyamment, là qu'oublier une garde divulgue silencieusement. Écartée parce qu'elle ne couvre que la **lecture** — autoriser un `update` demande de connaître l'état avant, qu'une extension ne voit pas — donc elle s'ajouterait aux gardes explicites au lieu de les remplacer. S'y ajoutent un câblage transverse invisible, des requêtes qui ne disent plus ce qu'elles renvoient, et une fragilité connue sur les `include` imbriqués dont `<EntriesView>` est plein.

**Row-Level Security.** La garantie la plus forte : le contrôle cesse d'être une convention de code pour devenir une propriété de la base, qu'aucun chemin applicatif ne peut contourner. Écartée pour quatre raisons, par ordre de poids : `SET LOCAL` est transactionnel, donc chaque requête HTTP devrait être enveloppée dans une transaction interactive ; la résolution récursive des groupes imbriqués exigerait une table d'appartenance effective matérialisée ; Prisma Migrate ne gère pas les politiques, qui vivraient en SQL manuel ; et il faudrait **deux rôles Postgres**, donc deux DSN — un coût imposé à *chaque personne qui déploie*, alors que l'ADR 0021 a soigné un déploiement en une image et un `migrate` au démarrage.

## Consequences

- La personne est **résolue par la couche**, pas reçue en paramètre : la couche a été rapatriée « à vide » avant toute notion de droit, et les appelants ne changeront pas une seconde fois quand les droits arriveront. Le lieu de cette résolution est `lib/permissions-db.ts`, mémoïsé par requête HTTP.
- La règle a **deux volets**, parce qu'une règle syntaxique ne lit que des noms : elle refuse `prisma.page` et `prisma.form` (le `tx.` d'une transaction compris), et elle refuse l'**import du client** hors des deux portes — ce second volet ferme ce que le premier ne voit pas, une `Page` atteinte par une relation (`include`) ou du SQL brut. Les modules de balayage reçoivent leur client en paramètre, donc ne l'importent pas.
- Un oubli devient une **erreur de lint au build**, pas une fuite en production. C'est la culture déjà installée par l'ADR 0013, qui vérifie la cohérence descripteur/composant en parsant la source au `prebuild` et bloque.
- La règle se contourne par une exception — mais une exception est **visible en revue**, ce qui est précisément son intérêt.
- Un seul chemin y échappe délibérément : le seed, qui écrit sans personne. (Les cinq pages de layout y échappaient aussi ; l'amendement ci-dessous les a soumises au contrôle.)
- Le handler `/{slug}/raw` naît **dans** la couche, et non à côté : c'est le genre d'accès au contenu qui, ajouté plus tard et branché en direct, aurait court-circuité tout le dispositif.

## Amendement du 2026-08-24 — la porte rend des décisions, pas de quoi décider

L'ADR pose une seule porte par table, gardée par ESLint. Il laissait une question ouverte : ce que la porte **rend**. Deux règles s'y ajoutent.

**1. Une lecture non décidée ne s'obtient pas.** Hors de la couche d'accès, aucune fonction ne rend le contenu d'une page ou la définition d'un formulaire sans qu'un droit ait été tranché dessus. Une fonction qui rend le contenu et laisse l'appelant vérifier après coup est un oubli en attente : elle est remplacée par une fonction qui lit et décide en un seul appel. Une fonction qui ne fait qu'un seul des deux temps vit dans un fichier privé de son module.

**2. Un module expose ses décisions prises, jamais de quoi les prendre.** Toute décision de droit prend la **personne** en premier paramètre — et un paramètre s'oublie, un paramètre oublié se lit comme un visiteur, ce qui est la seule erreur qui ouvre au lieu de fermer. Le module `permissions` n'expose donc que les formes qui résolvent la personne elles-mêmes (`currentCanRead(page)`), et garde les formes pures dans `decide/`, privé par la profondeur (ADR 0029). Une forme qui résout la personne lit la session : elle ne s'exécute pas dans un composant client. Trier en mémoire des lignes déjà lues devient donc impossible à écrire, et non plus seulement déconseillé.

### La couche d'accès

Le nom manquait à la documentation, alors que la liste existe : c'est l'ensemble des fichiers exemptés de la règle `wikioui/access-layer` dans `eslint.config.mjs`, chacun commenté. Deux cercles :

- **Les gardes**, privées par la profondeur : `modules/pages/access/guards.ts` et `modules/forms/access/guards.ts`. Elles lisent et refusent dans le même appel.
- **Les fichiers racine qui touchent `Page` ou `Form` directement** : `modules/pages/content.ts`, `revisions.ts`, `rights.ts`, `entries.ts` et `modules/forms/forms.ts`. Ils portent l'API publique de leur module, et chacune de leurs lectures publiques passe par une garde.

S'y ajoutent les voisines derrière la même porte — `modules/accounts/`, `modules/permissions/groups-queries.ts`, `modules/permissions/person.ts`, `modules/settings/settings.ts` — et les balayages, qui reçoivent leur client en paramètre.

### Aucune page n'est exemptée

L'ADR exemptait `getLayoutContents()`, et la v0.5 tenait par ailleurs une liste de slugs — les quatre pages de comptes — qui répondaient à tout le monde quel que soit le droit posé dessus. Les deux disparaissent.

**Le motif décrivait ce que ces pages servent, pas ce qu'elles sont.** Ce sont des pages ordinaires, avec des droits comme les autres. Les mettre hors du contrôle disait beaucoup plus que « sers le chrome à tout le monde » : `/page-menu-haut` s'ouvrait à qui ses droits refusaient, chaque liste l'offrait, et un lien `hideIfNoAccess` qui la nommait restait visible.

**Et une exception qui ne se voit nulle part coûte plus qu'elle ne protège.** Un administrateur qui restreignait `connexion` voyait son réglage s'enregistrer et rien se produire. Le wiki doit faire ce que ses droits disent ; c'est aussi ce qui rend le modèle explicable, une règle valant pour toute page.

Conséquences : `ifReadable` ne connaît plus aucun slug, la clause de liste n'unit plus rien (`listReadableWhere` disparaît), et un emplacement de layout refusé rend vide — le layout le laisse dehors, comme il le faisait déjà d'un emplacement qu'un auteur n'avait pas rempli. Les pages seedées naissent en lecture *tout le monde*, donc rien ne change pour un wiki neuf.

Le revers est assumé, et signalé : restreindre `connexion` ferme la connexion, et si toutes les sessions expirent, seule la base permet de rouvrir. Les deux endroits où un droit de lecture se pose — la modale d'une page et le lot de `gerer-pages` — demandent confirmation avant d'écrire, sans refuser : fermer une page reste le droit de l'administrateur. Sur un lot, la confirmation offre d'épargner les pages de comptes plutôt que d'obliger à recommencer la sélection.

### Ce qui tient la règle

`scripts/verify-access/` suit le graphe d'appels de chaque fonction exportée de la couche, pour chaque table surveillée et chaque direction (lecture, écriture, ou les deux), jusqu'à `canRead`, `canWrite` ou `isAdmin` — ce qu'ESLint ne peut pas faire, ne voyant qu'un fichier à la fois. Une fonction qui n'y arrive pas fait échouer `pnpm build`, sauf si elle figure dans `EXEMPTIONS` avec son fichier, son nom et son motif. Deux questions tiennent sur la liste : pour les lectures, **cette fonction rend-elle du contenu ?** Pour les écritures, **cette fonction agit-elle au nom d'une autre personne ?** Si la réponse est oui, la fonction a besoin d'une garde, pas d'une exemption.

Le nom du fichier suit ce qu'il tient : `queries.ts` est devenu `access/guards.ts` des deux côtés. Trois appels Prisma sur quarante-neuf y vivaient — « porte » et « requêtes » disaient tous deux la mauvaise moitié de ce que ces fichiers font.

### Le fichier JSON partagé (issue #23)

`lib/access-layer-files.json` est la liste canonique des 19 fichiers de la couche d'accès. `eslint.config.mjs` l'importe tel quel pour ses `ignores` ; `scripts/verify-access/scan.ts` l'importe et retire les six fichiers exemptés entièrement (4 balayages, le seed, `auth.ts`) — 13 fichiers scannés pour chaque table.

### Le `via` étendu (issue #23)

Le scan détecte un accès indirect par relation Prisma. Chaque table surveillée déclare ses relations avec un `via: { model, as }[]` : l'étape 1 matche le modèle voisin, l'étape 2 cherche le nom de **relation** (pas du modèle) dans les arguments. `prisma.page.findUnique({ include: { current: true } })` est ainsi détecté comme un accès `Revision`, parce que `current` est un alias de la relation `Revision` sur `Page`.

### Tables et fichiers exclus du scan (issue #23)

| Fichier | Pourquoi hors du scan |
| --- | --- |
| `prisma/seed.ts` | écrit avant qu'une personne existe (ADR 0027) |
| `modules/accounts/auth.ts` | BetterAuth — on lui fournit une requête Prisma pour accéder à User, il gère l'authentification lui-même |
| `lib/slug-rename-db.ts` | intégrité référentielle — réécrit les références de slug dans toute la base, aucune personne n'agit |
| `modules/forms/entry-title/sweep.ts` | intégrité référentielle — recalcule les titres stockés après un renommage, aucune personne n'agit |
| `modules/forms/field-rename/sweep.ts` | intégrité référentielle — renomme les clés de champ dans chaque porteur, aucune personne n'agit |
| `modules/permissions/acl-rename-sweep.ts` | intégrité référentielle — réécrit les noms de principal dans les ACL, aucune personne n'agit |

`Account` et `Verification` ne sont pas surveillées : BetterAuth les gère, aucun appel Prisma direct ne les atteint.
