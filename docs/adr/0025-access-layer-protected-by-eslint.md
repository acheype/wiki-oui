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
- Deux chemins y échappent délibérément : `getLayoutContents()`, qui lit les cinq pages de layout à chaque rendu de n'importe quelle page (c'est du chrome, pas du contenu — le soumettre aux droits de la personne ferait disparaître le menu pour les uns et pas pour les autres), et le seed, qui écrit sans personne.
- Le handler `/{slug}/raw` naît **dans** la couche, et non à côté : c'est le genre d'accès au contenu qui, ajouté plus tard et branché en direct, aurait court-circuité tout le dispositif.
