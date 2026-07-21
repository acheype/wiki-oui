# Le titre automatique d'une fiche est calculé à l'écriture, jamais à la lecture

En mode **titre automatique** (ADR 0014), le titre d'une fiche est calculé depuis un template `{champ}`. La première implémentation ne le stockait pas : `deriveEntrySchema` l'écartait des valeurs enregistrées et chaque lecteur devait le recalculer via `computeAutomaticTitle`. On inverse : le titre calculé est **écrit dans `data` comme n'importe quelle valeur de champ**, et les lecteurs se contentent de le lire.

## Pourquoi

Le calcul à la lecture impose son cas particulier à un ensemble de lecteurs **non borné et croissant** — les neuf vues d'`<EntriesView>`, l'administration des fiches, l'export et l'API d'interopérabilité à venir, la recherche. Le coût n'est pas théorique : deux des trois lecteurs existants l'avaient oublié et affichaient le slug à la place du titre.

Surtout, il **ferme une porte que la spécification déclare ouverte** : `docs/entries-view.md` inscrit le filtrage serveur au backlog (« optimisation d'échelle »). Un titre absent de la base n'est ni requêtable (`WHERE data->>'title' ILIKE …`) ni indexable — l'optimisation devient impossible, pas seulement plus lente.

Le calcul à l'écriture déplace la charge vers les **écrivains**, peu nombreux et centralisés (`saveEntry`, `restoreRevision`, le balayage ci-dessous), et rend l'invariant vérifiable par la base.

Deux bénéfices de bord : chaque révision fige le titre qu'elle affichait vraiment, conformément au modèle d'instantané de l'ADR 0003 ; et basculer un formulaire d'automatique vers manuel conserve le dernier titre calculé comme valeur éditable, au lieu de vider le titre de toutes ses fiches.

## Conséquences

**Recalcul de masse.** Deux gestes admin invalident les titres stockés : modifier le gabarit, et activer le mode automatique. À l'enregistrement du formulaire, derrière une confirmation qui annonce les nombres, chaque fiche dont le titre change effectivement gagne une **nouvelle révision** — l'historique reste en ajout seul (ADR 0003) et aucun titre saisi à la main n'est détruit. La désactivation du mode automatique ne déclenche rien.

Cette réécriture n'est **pas** celle de l'ADR 0017 : un renommage de champ retouche la *représentation* et doit donc parcourir tout l'historique en place, sous peine de le rendre illisible ; un recalcul de titre change ce que la fiche **dit** et ne touche donc que l'état courant, sous peine de le rendre faux.

**Titre vide.** Une fiche a toujours un titre non vide. La règle est tenue par deux moyens selon l'interlocuteur disponible : à la saisie on **refuse** (avec un message nommant les champs du gabarit, le champ Titre étant invisible en mode automatique) ; au balayage, qui n'a personne à qui répondre, on **saute la fiche** et on le signale (« le gabarit produit une chaîne vide pour elles »).

**Restauration.** Restaurer une révision recalcule le titre au lieu de le recopier : l'état courant suit toujours la définition courante du formulaire. Quand le gabarit produit une chaîne vide, le titre archivé est conservé — sans quoi une fiche périmée bloquerait sa propre restauration — et **l'utilisateur en est averti**, la fiche redevenant courante avec un titre que son formulaire ne produirait pas. C'est le pendant du signalement des fiches sautées par le recalcul de masse : même règle, même devoir d'information. `restoreRevision` retourne donc au lieu de rediriger (`redirect()` lève, ce qui ne laissait aucun canal au chemin du succès) ; la navigation revient à l'appelant, sur la même page qu'avant.

**Contrainte SQL.** `Revision_entry_has_title` (`CHECK ("data" IS NULL OR coalesce(length("data"->>'title'), 0) > 0)`), à côté de `Revision_content_xor_data` : le futur import qui écrirait une fiche sans titre échoue à l'écriture plutôt que de se découvrir des semaines plus tard dans une vue.

**Pas de migration.** Les fiches antérieures n'ont pas de titre stocké ; la base de développement est simplement vidée et re-seedée. Décidé sciemment — rien n'est en production.

## Écartés

**Une colonne `Page.title`.** `data->>'title'` est requêtable et indexable en jsonb : la motivation est satisfaite sans dupliquer la valeur une seconde fois, ni la tenir synchrone à chaque écriture. La colonne n'aurait de sens qu'en valant aussi pour les pages MDX, dont le titre est le premier `#` du contenu — ce qui ouvre l'extraction et la synchronisation de ce titre-là, et contredit le modèle (`CONTEXT.md` : une Page « n'a pas de champ titre distinct »). À rouvrir si une recherche globale du wiki arrive, pages MDX comprises.
