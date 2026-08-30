# Un module est profond : beaucoup de comportement derrière peu d'interface

L'ADR 0029 dit **où** va un fichier et **qui** peut l'importer. Il ne dit rien de **combien** un module expose. Cet ADR l'ajoute : un module vise le maximum de comportement derrière le minimum d'interface. Comme l'interface d'un module est sa racine, cela se lit en une phrase — le moins de fichiers et d'exports possible à la racine, toute la complexité dans les sous-dossiers, que l'ADR 0029 rend privés.

Deux sens de « profond » cohabitent donc, et ils ne se contredisent pas. La **profondeur de dossier** (ADR 0029) dit **qui importe** : racine publique, sous-dossier privé. Un **module profond** (cet ADR) dit **combien on expose** : peu d'interface, beaucoup de comportement. Le second se mesure sur ce que le premier rend public.

## Contexte

La règle existe déjà dans le projet, mais seulement comme argument ponctuel. L'ADR 0029 écarte « une porte qui rend des résultats déjà gardés » **par le test de suppression** : son interface serait aussi compliquée que ce qu'elle cache. L'ADR 0025 avait opposé la même objection à l'extension Prisma. Deux décisions structurantes reposent donc sur un critère que rien n'énonce.

Ne pas l'énoncer a un coût précis. Le critère ne s'applique qu'en revue, donc après le codage, quand déplacer une fonction coûte un refactoring au lieu d'un choix. Le vocabulaire qui le porte (`.agents/skills/codebase-design/`) est un outil d'agent : il se charge quand on lance une revue, jamais quand on écrit.

Ce que la mesure montre au 2026-08-29 : **sept fichiers racine n'ont aucun appelant hors de leur module** — `authoring/descriptor-source.ts`, `entries-view/actions.ts`, `entries-view/entries-view.tsx`, `forms/entry-form.tsx`, `forms/entry-render.ts`, `forms/refusal.ts`, `settings/actions.ts`. Chacun est public sans que personne le demande. C'est exactement ce que l'issue #25 a corrigé dans `accounts`, un module à la fois, faute d'une règle qui le dise d'avance.

## Options considérées

**Un contrôle dans `docs/invariants.md`.** Écarté : ce fichier ne liste que ce qu'un outil fait échouer. La profondeur d'un module est un jugement. Un compteur d'exports refuserait `permissions/person.ts`, public par nécessité, et laisserait passer le passe-plat isolé, qui est le vrai défaut.

**Laisser la règle dans les skills.** Écarté : ils s'exécutent en revue. Une règle de codage doit vivre là où le codage commence, c'est-à-dire dans ce qui est chargé à chaque session.

**Un barrel `index.ts` pour porter une interface explicite.** Déjà écarté par l'ADR 0029, et écarté ici pour les mêmes raisons : l'import cesse de dire où vit la fonction, et huit index se désynchronisent en silence.

## Décision

- **L'interface d'un module, c'est sa racine.** Un fichier racine est public, un sous-dossier est privé (ADR 0029). Approfondir un module, c'est donc réduire le nombre de fichiers et d'exports à sa racine, et cacher le reste dans ses sous-dossiers.
- **Le test de suppression tranche.** Supprimer ce fichier ou cette fonction : si la complexité disparaît, c'était un passe-plat ; si elle réapparaît chez N appelants, il gagne sa place.
- **Un export racine sans appelant externe est un fichier mal rangé.** Il descend dans le sous-dossier de son sujet. Public se mérite : c'est un autre module qui le demande, jamais l'auteur qui l'accorde.
- **Exception nommée, le transport.** Un fichier `"use server"` est un passe-plat structurellement nécessaire : un composant client ne peut pas atteindre la couche d'accès (ADR 0025). `canAddForm`, `listFormChoices`, `canAddEntry` et `readInvitation` restent tels quels. Le test de suppression ne s'y applique pas — les supprimer ne concentre rien, cela coupe le fil.
- **Tester par la racine est une préférence, pas une règle.** Un test qui passe par l'interface décrit un comportement et survit aux refactorings internes. Tester directement un `rules.ts` privé reste légitime quand la règle est du calcul pur, et que l'atteindre par une Server Action coûterait plus cher que ce que le test vérifie. Au 2026-08-29, 30 fichiers de test sont à la racine d'un module et 8 dans un sous-dossier : les deux sont admis.

## Conséquences

- **Aucun nombre n'est plafonné.** Un module qui possède beaucoup expose beaucoup. Ce qui est refusé, c'est l'export que personne n'appelle et le passe-plat qui ne concentre rien.
- **Les sept fichiers racine sans appelant externe deviennent un arriéré, pas une urgence.** Chacun descend quand on touche à son module, comme les fichiers de `accounts` sont descendus avec l'issue #25.
- **`CLAUDE.md` porte la règle opérationnelle**, en quatre lignes dans ses conventions de code. C'est le seul document chargé à chaque session, donc le seul emplacement qui agit pendant le codage plutôt qu'après.
- **`CONTEXT.md` fixe le vocabulaire** dans son entrée `Module`, et son `_Avoid_` écarte la confusion entre les deux sens de « profond ».
- **La revue garde son rôle.** Aucun outil ne mesure la profondeur d'un module ; le lint continue de ne garder que la visibilité. Cet ADR ne ferme pas un trou, il donne un critère nommé à qui code et à qui relit.
