# Fichiers uploadés : le répertoire `files/` fait foi

Les fichiers uploadés vivent sur le disque, dans un répertoire `files/` à la racine, servi par le service d'API `GET /api/files/[name]`. **Pas de table Prisma** : le répertoire est la seule source de vérité, comme `/components/wiki` est la seule liste blanche du registre (ADR 0002).

## Contexte

La v0.2 introduit l'upload (composants `Image`, `Pdf`, `FileLink`, combobox `file-list`). Les besoins — lister, filtrer par famille, afficher la taille, dater — sont tous couverts par le système de fichiers (`readdir`, `stat`). Il n'y a pas d'auth : aucune identité d'uploadeur à persister. Et le scénario opérateur dominant est la migration : copier en `scp` des centaines de fichiers d'un vieux YesWiki — sans table, ils apparaissent immédiatement ; avec une table, il faudrait construire et maintenir une resynchronisation, et la désynchronisation disque↔base devient une classe de bugs permanente.

## Décision

- **Stockage** : `files/` à la racine (hors `public/`, figé à la build), accès centralisé dans `lib/files.ts` (écrire, lire, lister, supprimer) — point d'accroche d'un futur adaptateur S3 (hébergement serverless, backlog).
- **Nommage** : nom d'origine slugifié (minuscules, accents translittérés, extension normalisée) ; collision → suffixe numérique (`logo-2.png`) ; jamais de remplacement silencieux (le remplacement attend la « Gestion des fichiers » du backlog). Nom vide après slugification (capture collée) → nom généré (`capture-AAAA-MM-JJ.png`).
- **Orphelins conservés** : un fichier non référencé par une page est un fichier de la bibliothèque, visible dans les `file-list`, réutilisable. Seule exception : annuler la modale de paramétrage *juste après* l'upload qui l'a créé supprime le fichier (toast) — « Annuler = rien ne s'est passé » ; annuler une réédition ou une insertion depuis le menu ne supprime jamais rien.
- **Upload = `POST /api/files`**, service d'API — une **mutation portée par un service** : afficher la progression d'envoi exige de tenir la requête (`xhr.upload.onprogress`) ; les Server Actions cachent leur transport et `fetch` n'expose pas la progression d'émission. Les limites (taille par famille, extensions autorisées) sont vérifiées avant toute écriture.
- **Politique de service** (XSS) : `X-Content-Type-Options: nosniff` sur tout `/api/files/` ; images (sauf svg) et pdf servis inline ; `svg` inline avec `Content-Security-Policy: sandbox` (un SVG est du XML pouvant embarquer du script — inerte une fois sandboxé, intact visuellement) ; famille `other` en `Content-Disposition: attachment` (jamais rendu comme document sur notre origine, même si l'opérateur autorise une extension dangereuse).

## Conséquences

- Aucun slug réservé supplémentaire : les services d'API (fichiers compris) vivent sous le seul segment réservé `/api`.
- Sauvegarde du wiki = `pg_dump` + copie de `files/`.
- L'identité de l'uploadeur et les compteurs d'usage attendent auth + « Gestion des fichiers » (backlog) ; une table `File` se remplira alors par backfill du répertoire.
- Il faut un disque persistant (VPS, volume Docker) ; le serverless attend l'adaptateur S3.
