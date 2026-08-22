# Le renommage d'un identifiant de champ est différé à l'enregistrement

Contrairement aux adresses de pages et aux identifiants de formulaires (ADR 0016, renommage immédiat), renommer l'identifiant d'un champ (« Changer » dans le panneau de paramétrage) ne fait que **mettre le renommage en attente** : tout s'applique au clic sur Enregistrer, dans la transaction de sauvegarde du formulaire.

## Contexte

L'identifiant d'un champ (`name`) est la clé de ses valeurs dans les snapshots `data`, la cible des références `{champ}` (gabarit, titre automatique) et des liaisons de géocodage (`streetField`…). Le rendre renommable pose une question que pages et formulaires n'avaient pas : l'action vit **dans le FormBuilder**, dont l'enregistrement écrase le schéma entier (pas d'historique de Form, ADR 0014). Un renommage immédiat devrait soit écrire le schéma entier (enregistrant prématurément tout le canvas non sauvegardé), soit inventer une seconde voie d'écriture partielle du schéma. Les deux cassent l'unité transactionnelle du builder : Enregistrer est sa seule écriture.

## Décision

- **Un identifiant pas encore en base** (nouveau champ, nouveau formulaire, nouvelle fiche) est un **chip éditable en place** (clic → input au même endroit, valeur sélectionnée), dérivé automatiquement (du libellé pour un champ, du nom pour le formulaire, du titre pour une fiche) jusqu'à la première modification par l'utilisateur ; **laissé vide à la perte de focus, il redevient dérivé**. Plus de révélation par chevron ni de bouton « Personnaliser ».
- **Un identifiant en base** s'affiche en chip avec un bouton « Changer » ouvrant la modale de renommage unifiée. Pour un champ, elle affiche l'impact (« N fiches portent ce champ… mises à jour, historique compris », compté sur le nom persisté) et une note : *les modifications ne seront prises en compte qu'à l'enregistrement du formulaire*. Pas d'avertissement : rien d'externe ne casse.
- Confirmer la modale **réécrit le canvas localement** (nom du champ, `{champ}` du gabarit et du template de titre automatique, liaisons géoloc) ; chaque champ figé garde son **`persistedName`** (le nom encore en base).
- À l'enregistrement, tout champ figé dont `name` ≠ `persistedName` alimente une **table de correspondance** ; le serveur réécrit les clés `data` de toutes les révisions des fiches du formulaire en **une passe par révision** (les échanges croisés `a`↔`b` restent corrects), dans la même transaction que l'écrasement du schéma. Gabarit et schéma arrivent déjà réécrits du canvas.
- Le champ **`title` n'est pas renommable** : son nom est le littéral `title`, cible fixe des gabarits.

## Conséquences

- Deux timings de renommage coexistent : immédiat (page, formulaire), différé (champ). C'est le prix pour garder Enregistrer comme unique écriture du schéma.
- Fermer le builder sans enregistrer abandonne les renommages en attente — comme toute modification du canvas.
- `saveForm` reçoit la liste des renommages ; l'unicité des noms dans le formulaire couvre les collisions, y compris vers un nom libéré par un autre renommage en attente.
- L'historique des fiches est réécrit (retcon, ADR 0016) : une vieille révision expose ses valeurs sous les clés actuelles.
