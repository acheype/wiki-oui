# Déploiement Docker : sortie standalone, outils Prisma isolés, migrate à chaque démarrage et seed une seule fois

L'image de production (`Dockerfile`) construit WikiOui avec `output: "standalone"` (Next.js). À chaque démarrage du conteneur elle exécute `prisma migrate deploy` (idempotent, seules les migrations manquantes) ; le seed, lui, ne s'exécute **qu'une seule fois**, quand la base est encore vide.

## Contexte

Jusqu'à la v0.4, WikiOui n'avait aucune histoire de déploiement en production — seule l'installation développeur (`pnpm dev` contre un Postgres local) était documentée. [`docs/deployment-dokploy.md`](../deployment-dokploy.md) introduit un chemin VPS via [Dokploy](https://dokploy.com), ce qui impose de packager l'application en image Docker.

Deux contraintes structurent ce choix :

- Le seed (`prisma/seed.ts`) n'est pas qu'un jeu de données de démo : il crée aussi les pages structurelles réservées (page d'accueil, menus, aide-mémoire — `specialSlugs` dans `wiki.config.ts`), nécessaires au fonctionnement du wiki. Il doit donc s'exécuter à l'installation.
- Son idempotence *par élément* (chaque page/fiche/formulaire vérifié avant création) ne suffit pas côté déploiement : si l'opérateur supprime une page ou une fiche d'exemple, un rejeu au démarrage suivant la **ressusciterait**. Le seed de déploiement doit donc être tout-ou-rien : ne s'exécuter qu'une fois, sur une base vierge.

Le dossier `files/` (ADR 0012) fait foi sur disque, hors base ; il doit survivre aux redéploiements via un volume monté sur `/app/files`.

Testé (build + exécution complète contre un Postgres jetable, redémarrage, suppression d'une fiche puis redémarrage, recréation du conteneur avec volume nommé) avant d'écrire la documentation.

## Décision

- **`output: "standalone"`** (`next.config.ts`) : l'image ne contient que ce que le serveur Next.js trace réellement — pas les dépendances de développement (ESLint, Vitest, TypeScript, ts-morph…). Image finale mesurée à 338 Mo.
- **`prisma migrate deploy` et `prisma db seed` tournent comme des processus séparés du serveur Next.js** (`docker-entrypoint.sh`), donc jamais tracés par le mode standalone. Plutôt que de reconstituer à la main leur arbre de dépendances transitif (engines, `@prisma/debug`, `esbuild`…), un `package.json` dédié (`docker/deploy-tools/`) déclare exactement ce qu'il leur faut — `prisma`, `tsx`, `dotenv`, `zod`, `@prisma/client`, `@prisma/adapter-pg`, épinglés aux mêmes versions exactes que la racine — et un vrai `pnpm install` isolé résout l'arbre complet, fusionné dans `node_modules` du build standalone.
- **`migrate deploy` tourne à chaque démarrage** (n'applique que les migrations manquantes, jamais destructif) ; **le seed ne tourne qu'une fois, sur une base vide.** Le seed s'exécute sous `SEED_ONLY_IF_EMPTY=1` (posé par `docker-entrypoint.sh` et par la commande de démarrage Nixpacks documentée) : ce drapeau lui fait vérifier `prisma.page.count()` et sortir sans rien faire dès qu'une page existe. Comme les pages spéciales sont non supprimables (`wiki.config.ts`), le compteur ne retombe jamais à zéro après l'installation — le seed ne se redéclenche donc plus. Sans le drapeau (dev, `pnpm prisma db seed` manuel), le seed garde son comportement idempotent d'origine et complète ce qui manque.
- **`Dockerfile` au dépôt comme voie principale** de déploiement ; une voie alternative sans Dockerfile (build Nixpacks piloté depuis l'UI Dokploy) est documentée pour qui préfère l'éviter.

## Conséquences

- Toute montée de version de `prisma`, `tsx`, `zod`, `@prisma/client` ou `@prisma/adapter-pg` dans `package.json` doit être répercutée à l'identique dans `docker/deploy-tools/package.json` — point de synchronisation manuel à ne pas oublier.
- Chaque démarrage de conteneur applique les migrations et interroge le compteur de pages avant de décider de seeder ou non — quelques secondes, contre un redéploiement toujours sûr et sans job d'initialisation séparé à maintenir.
- Le contenu d'exemple supprimé par l'opérateur ne réapparaît jamais ; en contrepartie, sur une installation existante, le seed ne « répare » plus une page spéciale qui aurait été vidée de son contenu (elle reste, éditable, mais son contenu par défaut ne se réinjecte pas). Acceptable : les pages spéciales sont éditables et réparables à la main.
- Le volume `/app/files` (Dokploy : onglet Advanced → Mounts) reste une étape manuelle de configuration — rien ne l'impose au niveau du `Dockerfile` lui-même au-delà d'un `VOLUME` documentaire.
