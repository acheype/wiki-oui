# Configuration : module TypeScript typé (`wiki.config.ts`)

Les réglages de WikiOui (slugs des pages spéciales, slug d'accueil, plus tard extensions/taille d'upload, composants enregistrés) vivent dans un module TypeScript typé `wiki.config.ts`, importé là où c'est nécessaire. Pas de config éditable à chaud au MVP.

## Contexte

On voulait au départ un YAML lu à l'exécution pour permettre à un exploitant d'ajuster des réglages sans redéploiement. Constat après vérification : **Next.js ne fournit aucun mécanisme de config métier relue à l'exécution** — `next.config.ts` et les variables d'environnement sont build/boot-time. Un YAML runtime aurait donc été un petit loader custom (js-yaml + zod + mtime) et aurait orienté le produit vers l'auto-hébergement à serveur long-vécu (le serverless a un FS éphémère). Or au MVP il n'y a ni auth ni exploitant non-développeur : personne pour éditer à chaud.

## Décision

Config = `wiki.config.ts`, un objet exporté typé. Suit la logique Next : le fichier est compilé dans le build ; changer une valeur nécessite un **`next build` + redéploiement** (pas un simple redémarrage — `next start` sert un bundle pré-compilé et ne retranspile pas le `.ts`). Au MVP ces réglages sont « de développeur » et changent rarement, donc c'est acceptable.

La redirection page d'accueil `/` → `/page-principale` se fait via `redirects()` dans `next.config.ts` (mécanisme natif Next).

## Conséquences

- Zéro code custom (pas de parseur/watcher), typage fort de bout en bout.
- Modifier un réglage = action de développeur via le pipeline de build, pas d'édition en direct.
- Migration prévue : le jour où auth/admin arrive, les réglages *exploitant* (upload, extensions) iront vers une table `Settings` + UI admin ; les réglages *dev* (slugs des pages spéciales, composants) resteront dans le `.ts`.
