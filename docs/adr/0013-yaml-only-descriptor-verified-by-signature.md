# Descripteur ComponentBuilder : YAML seul, composants sans contrat, vérifié par signature

Le descripteur d'un composant (les champs de sa modale de paramétrage) vit **entièrement dans le YAML** co-localisé, défauts compris. Le `.tsx` n'exporte plus rien que le loader lise — c'est un composant React ordinaire, **client ou serveur, sans contrat**. La correspondance entre le YAML et le composant est vérifiée en analysant la **signature** du composant (sa source), au build et en dev, jamais au runtime de production.

## Contexte

En v0.2, le loader (`lib/component-descriptors.ts`) `import()`ait le `.tsx` pour lire son objet `xxxDefaults`. Or importer *n'importe quel* export d'un module `"use client"` depuis le serveur donne une **référence client**, pas la valeur — donc tout composant à builder devait être serveur (`button.tsx` : « No "use client" »). Ce couplage a une portée dépassant les défauts : il a par exemple forcé `<Button>` côté serveur, ce qui a produit le bug d'imbrication `<button>` dans `<button>` du `<Menu>` (le composant serveur, pré-rendu avant la frontière client, perdait ses props — commit `67ffd53`).

L'objectif est d'**incorporer plus tard n'importe quel composant React** — client comme serveur — sans lui imposer de contrat (pas d'export obligatoire, pas de forme de props imposée). Il faut donc sortir les défauts du module composant, tout en gardant une vérification que le YAML et le composant restent cohérents.

## Décision

**Descripteur = YAML seul.** Chaque champ porte son `default`. Le loader **n'importe plus** le `.tsx` ; il dérive les défauts du descripteur. Le composant peut être `"use client"` ou serveur, il n'expose rien de spécial. Il garde ses propres défauts inline (déstructuration : `function Button({ color = "primary" })`), qui servent son rendu ; le `default` du YAML sert la règle d'omission du builder. Les deux doivent coïncider — non plus garanti par un contrat de compilation (`satisfies`), mais **vérifié par analyse de signature**.

**Vérification par la source, pas par import.** On lit et parse la *source* du `.tsx` (API du compilateur TypeScript via `ts-morph`, *devDependency*), on n'évalue jamais le module — ce qui esquive la frontière de référence client RSC (un composant client est parsé, jamais exécuté). Le projet TS complet est chargé (checker) pour résoudre les types de props importés, déplier les unions littérales, et **tracer un défaut jusqu'à un littéral** : littéral direct, référence à une constante, propriété d'un objet constant, y compris importés. Seul un défaut **calculé au runtime** (appel de fonction, expression dépendant du runtime) reste « non vérifiable ».

**Deux familles de checks, complémentaires** (la signature ne remplace qu'*un seul* ancien check structurel — « champ ∈ défauts exportés » devient « champ ∈ props ») :

- **Structurels** — le YAML est-il auto-cohérent, sans regarder le composant : type de champ connu ; `default` d'une `list` ∈ ses `options` ; cibles de `showif` existantes et regex valides ; `family` connue ; `emits` valide.
- **Signature** — le YAML colle-t-il au composant ; **uniquement pour les émetteurs de balise** (les émetteurs `markdown-link` comme wiki-link n'ont que les structurels), et on **saute les champs `divider`** :
  - champ ∈ props du composant (sinon nom de prop erroné) ;
  - prop **obligatoire au runtime** (requise en TS *et* sans défaut de déstructuration) → doit avoir `required: true` en YAML (ni `value` ni `default` ne satisfont) ;
  - type du champ = type de la prop ;
  - `options` / `default` d'une `list` ∈ l'union littérale de la prop ;
  - **dérive** : `default` YAML = défaut de déstructuration du composant ;
  - type de `value` = type de la prop.

**`default` vs `value`.** `default` est la référence de l'omission → vérifié en **type et en dérive** (doit égaler le défaut du composant). `value` est un pré-remplissage d'insertion, toujours écrit dans la balise → vérifié **en type seulement** ; il a le droit de différer du défaut (aucun check de dérive).

**Sévérité : tout est erreur, sauf un avertissement.** Seul un `default` **non vérifiable** (calculé au runtime) est un avertissement non bloquant ; tout le reste est une erreur.

**Surfaçage uniforme par `throw`, pas de bandeau.** Un `throw` avec message clair, structurel comme signature :

- **structurel** : inchangé, `throw` dans tous les environnements ;
- **signature** : tourne en **dev** (au chargement de l'éditeur) et au **build** (`prebuild`), et `throw`e de la même façon ;
- **dev** → l'overlay d'erreur Next s'affiche sur la page de l'éditeur (message clair, dans le navigateur : le dev voit *pourquoi*) ;
- **build** → le `prebuild` échoue avec le message ;
- **prod** → le structurel reste fail-fast (comme aujourd'hui) ; le signature est absent (`ts-morph` est une *devDependency*, hors bundle ; un build vert garantit la cohérence) ;
- l'**avertissement** `default` non vérifiable ne peut pas se `throw` → `console.warn` (terminal dev + log de build), non bloquant.

## Conséquences

- Un composant wiki peut être client ou serveur librement ; la classe de bug « composant serveur pré-rendu à travers la frontière client » (le `<button>` imbriqué du menu) perd sa cause forcée.
- DX auteur : une divergence YAML ↔ composant est **bloquée au build** (donc avant déploiement) et **montrée en direct en dev** via l'overlay d'erreur, message clair — le filet de sécurité pour qui ajoute un composant.
- Le défaut d'une prop est désormais déclaré à **deux endroits** (déstructuration du composant + YAML), réconciliés par le vérificateur, en remplacement du contrat `satisfies` à source unique. C'est le prix assumé de la liberté client/serveur.
- **Cas résiduel** : éditer un YAML en prod puis **redémarrer sans rebuild** contourne le gate (le loader relit les YAML au runtime). Un changement de descripteur est un changement de code → il passe par un build. Le structurel restant fail-fast au runtime couvre partiellement ce cas ; figer les descripteurs en artefact de build (runtime relisant des données générées) le fermerait — backlog.
- L'inline serveur des icônes (`iconSvg`) garde encore `<Button>` côté serveur ; le changement compagnon — une route d'API d'icônes (`GET /api/icons/[id]`) + un `<Icon>` client — permettra aux composants à icône d'être client aussi (**étape séparée**).
- `docs/component-builder.md` détaille le format et la vérification ; ce document en fixe la décision d'architecture.
