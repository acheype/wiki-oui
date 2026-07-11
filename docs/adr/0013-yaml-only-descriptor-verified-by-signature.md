# Descripteur ComponentBuilder : YAML seul, composants sans contrat, vérifié par signature

Le descripteur d'un composant (les champs de sa modale de paramétrage) vit **entièrement dans le YAML** co-localisé, défauts compris. Le `.tsx` n'exporte plus rien que le loader lise — c'est un composant React ordinaire, **client ou serveur, sans contrat**. La correspondance entre le YAML et le composant est vérifiée en analysant la **signature** du composant, au build et en dev, jamais au runtime de production.

## Contexte

En v0.2, le loader (`lib/component-descriptors.ts`) `import()`ait le `.tsx` pour lire son objet `xxxDefaults`. Or importer *n'importe quel* export d'un module `"use client"` depuis le serveur donne une **référence client**, pas la valeur — donc tout composant à builder devait être serveur (`button.tsx` : « No "use client" »). Ce couplage a une portée dépassant les défauts : il a par exemple forcé `<Button>` côté serveur, ce qui a produit le bug d'imbrication `<button>` dans `<button>` du `<Menu>` (le composant serveur, pré-rendu avant la frontière client, perdait ses props — commit `67ffd53`).

L'objectif est d'**incorporer plus tard n'importe quel composant React** — client comme serveur — sans lui imposer de contrat (pas d'export obligatoire, pas de forme de props imposée). Il faut donc sortir les défauts du module composant, tout en gardant une vérification que le YAML et le composant restent cohérents.

## Décision

- **Descripteur = YAML seul.** Chaque champ porte son `default`. Le loader **n'importe plus** le `.tsx` ; il lit les défauts depuis le descripteur. Le composant peut être `"use client"` ou serveur, il n'expose rien de spécial.
- **Deux déclarations, réconciliées.** Le composant garde ses propres défauts inline (déstructuration : `function Button({ color = "primary" })`), qui servent son rendu ; le `default` du YAML sert la règle d'omission du builder. Ils doivent coïncider — non plus garanti par un contrat de compilation (`satisfies`), mais **vérifié par analyse de signature**.
- **Vérification par la source, pas par import.** On lit et parse la *source* du `.tsx` (API du compilateur TypeScript via `ts-morph`, *devDependency*), on n'évalue jamais le module — ce qui esquive la frontière de référence client RSC (un composant client est parsé, jamais exécuté). On en extrait noms de props, obligation (`label: string` vs `disabled?:`), types (unions littérales comprises) et défauts de déstructuration.
- **Ce que la vérification croise** avec le YAML : champ inconnu (nom de prop erroné), obligatoire oublié (prop requise en TS sans `default` YAML), type incompatible, options d'une `list` hors de l'union de la prop, **dérive des défauts** (`default` YAML ≠ défaut de déstructuration).
- **Quand — le plus lean possible.** Ces incohérences sont des erreurs de *développeur*, pas d'auteur de page. Donc :
  - **structurels** (YAML auto-cohérent : type de champ, `showif`, `family`, `emits`, `list`/options) → au chargement des specs, toujours ;
  - **cross-check de signature** → au **build** (`prebuild`, qui **fait échouer le build** en cas d'incohérence) et en **dev** (au chargement de l'éditeur, erreurs affichées dans la modale de paramétrage) ; **jamais au runtime de prod** — `ts-morph` reste une *devDependency*, hors bundle.

## Conséquences

- Un composant wiki peut être client ou serveur librement ; la classe de bug « composant serveur pré-rendu à travers la frontière client » (le `<button>` imbriqué du menu) perd sa cause forcée.
- DX auteur : une divergence YAML ↔ composant est **bloquée au build** (donc avant déploiement) et **montrée en direct en dev**, la modale nommant l'incohérence — le filet de sécurité pour qui ajoute un composant.
- Le défaut d'une prop est désormais déclaré à **deux endroits** (déstructuration du composant + YAML), réconciliés par le vérificateur, en remplacement du contrat `satisfies` à source unique. C'est le prix assumé de la liberté client/serveur.
- **Cas résiduel** : éditer un YAML en prod puis **redémarrer sans rebuild** contourne le gate (le loader relit les YAML au runtime). Un changement de descripteur est un changement de code → il passe par un build. Figer les descripteurs en artefact de build (runtime relisant des données générées) fermerait ce cas — backlog.
- L'inline serveur des icônes (`iconSvg`) garde encore `<Button>` côté serveur ; le changement compagnon — une route d'API d'icônes + un `<Icon>` client — permettra aux composants à icône d'être client aussi (étape séparée).
- `docs/component-builder.md` détaille le format et la vérification ; ce document en fixe la décision d'architecture.
