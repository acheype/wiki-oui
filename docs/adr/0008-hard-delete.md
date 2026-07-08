# Suppression dure des pages

Supprimer une page l'efface réellement (la ligne `Page` et ses révisions, en cascade). Pas de soft delete (`deletedAt`). La suppression est une **Server Action** (pas de route `/{slug}/delete`).

## Contexte

Deux options : soft delete (marquer `deletedAt`, données conservées, récupérable) ou hard delete (effacement réel). Le soft delete est plus sûr pendant la fenêtre MVP sans auth, mais laisse s'accumuler des pages inutilisées en base.

## Décision

Hard delete. Justification : l'authentification arrivera (réduisant le risque de suppression accidentelle/malveillante), et on ne veut pas conserver de pages mortes en base. Le slug redevient libre après suppression ; recréer le même slug crée une page neuve (pas de résurrection d'historique, puisqu'il n'existe plus).

Garde-fous : dialog de confirmation explicite (« action irréversible ») ; pages réservées (pages spéciales de layout + `aide-memoire`) non supprimables. Déclenché par une Server Action, jamais par une URL en GET (un prefetch/crawler pourrait supprimer).

## Conséquences

- Risque assumé : pendant le MVP sans auth, la suppression est irréversible et ouverte à tous ; le dialog de confirmation est le seul garde-fou.
- Schéma : `Revision.pageId` en `onDelete: Cascade` ; le FK circulaire `Page.currentRevisionId` disparaît avec la page.
- Pas de `deletedAt` ni de filtrage « non supprimé » dans les requêtes.
