# Modèle Page / Révision : deux tables + pointeur de révision courante

Deux tables : `Page` (identité) et `Revision` (versions). Chaque révision est un **snapshot complet** du contenu. La révision courante est désignée par un **pointeur explicite** `Page.currentRevisionId`, pas par la date la plus récente.

## Contexte

Chaque édition doit être historisée (~30 versions consultables, configurable), et « Restaurer » doit *ajouter* une version plutôt que rembobiner. Trois axes tranchés :

- **Une table vs deux** : tout mettre dans `Page` (une ligne par version) casse l'unicité du slug, duplique les attributs d'identité (propriétaire, tags) et prive les futures relations d'une cible stable. → deux tables.
- **Source de vérité du contenu** : contenu sur `Page` + historique séparé duplique le contenu (désynchro) ; les diffs imposent des reconstructions. → snapshots complets, la Révision est l'unique porteuse de contenu.
- **Désigner le courant** : `max(createdAt)` est fragile (égalités, imports, horloge) et ambigu après une restauration. → pointeur explicite.

## Décision

```
Page     { id, slug @unique, tags String[], ownerName?, currentRevisionId? -> Revision, createdAt }
Revision { id, pageId -> Page, content, authorName?, restoredFromId? -> Revision, createdAt }
```

Les tags sont sur la **Page** (pas historisés : ce sont de la classification, pas du contenu) — voir ADR 0007.

- Afficher `/{slug}` = lire `Page.current` (lecture par clé primaire).
- Sauvegarder = insérer une Revision + repointer `currentRevisionId`.
- Restaurer une révision = insérer une **nouvelle** Revision (copie du contenu, `createdAt` = maintenant, `restoredFromId` renseigné) + repointer `currentRevisionId`.
- « Dernière édition » affichée = `current.createdAt` (donc l'instant de la restauration si on vient de restaurer — c'est voulu : restaurer est une modification).

## Conséquences

- `currentRevisionId` est nullable : création d'une page en deux temps (insérer Page, insérer Revision, pointer). Prisma gère la relation nullable et la FK circulaire.
- `ownerName` / `authorName` sont de simples chaînes optionnelles au MVP (pas d'auth) ; deviendront des FK vers `User` avec l'authentification.
- `restoredFromId` sert uniquement à étiqueter l'historique (« Restauration de la version du … ») ; sans impact sur le rendu courant.
