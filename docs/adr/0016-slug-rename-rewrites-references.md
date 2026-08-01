# Renommer un slug réécrit toutes les références, sans redirection

Un administrateur peut changer le slug d'une page ou d'une fiche (« Changer l'adresse », dans la barre d'actions, avec un dialogue de confirmation chiffrant l'impact). Le renommage réécrit **toutes les références internes** du wiki — révision courante **et historique complet** des pages référentes, **en place, sans créer de révision**. Il n'y a **ni table de redirection, ni UUID dans le contenu** : le MDX en base reste écrit en slugs, lisibles et à jour.

## Contexte

Le MVP avait figé les slugs : un lien wiki stocke le slug de sa cible (ADR 0006), donc renommer aurait cassé les liens. Trois mécanismes ont été pesés pour lever ce verrou. Les trois ont besoin de la même connaissance — la **carte des emplacements de références** (cibles de liens markdown, props typées par les descripteurs comme `link` de `<Button>`, valeurs `entry-list` des snapshots `data`) ; ils diffèrent sur *quand* ils s'en servent.

1. **UUID dans le contenu** (slug affiché à l'édition, UUID stocké en base, transformation aller-retour). Rejeté : la transformation vit sur le chemin chaud (chaque sauvegarde, édition, « Afficher le code Wiki », `/api/render`, diff de révisions) et doit être parfaite dans les deux sens pour toujours ; un lien vers une page **pas encore créée** n'a pas d'UUID (double sémantique invisible pour l'auteur) ; une cible supprimée (hard delete, ADR 0008) n'a plus de slug à réafficher ; le contenu en base devient illisible et non-greppable ; et ça ne répare pas les URLs tapées — il aurait fallu des redirections en plus.
2. **Table de redirection** (à la MediaWiki : `oldSlug → pageId`). Seule option qui préserve les favoris et liens externes, mais on n'y tient pas ; elle laisse des slugs périmés affichés dans les sources des pages référentes, et impose une machinerie de résolution à chaque lookup, par entité (pages, puis formulaires, puis fichiers), pour toujours.
3. **Réécriture au renommage** (choisie) : la carte des références sert une fois, dans une action d'admin rare et froide.

## Décision

- **Retcon intégral** : toutes les révisions des pages et fiches référentes sont réécrites en place, historique compris, sans révision créée (hors historisation, comme les tags — ADR 0007). Justification : restaurer une vieille révision ne doit jamais ressusciter un slug périmé, et un renommage ne doit pas semer de révisions parasites. Les diffs restent propres puisque les deux côtés sont réécrits pareil.
- La réécriture est **pilotée par la carte des références** : cibles de liens markdown (y compris les formes `slug/edit`, `slug/revisions`, `slug#ancre`), props de composants typées « référence » par leur descripteur, valeurs `entry-list` dans `data`. Les mentions du slug en prose ne sont **pas** réécrites. Parsing AST, jamais de remplacement textuel aveugle ; l'opération est transactionnelle.
- **Pas de redirection** : `/ancien-slug` redevient une page inexistante (l'invitation à créer s'affiche). Le dialogue l'annonce avant confirmation.
- **Pages spéciales non renommables** : elles sont adressées par slug depuis la config (`specialSlugs`, `wiki.config.ts`) — même garde que pour la suppression.
- Nouvelle adresse soumise aux **mêmes règles qu'à la création** : motif slug, unicité (message explicite en cas de collision, comme pour les fiches).
- La **fenêtre de concurrence** (un buffer d'éditeur ouvert pendant le renommage peut resauvegarder l'ancien slug) est amortie par l'extension du lint d'enregistrement (`lib/page-lint.ts`) : tout lien wiki ou valeur `entry-list` vers une cible inexistante est signalé — avertissement non bloquant, car lier vers une page à créer reste une action wiki légitime.
- Le mécanisme s'étendra aux **identifiants de formulaires** (prop `id` d'`<EntryForm>`, URLs `?id=`/`?formulaire=`) dans un second temps, puis aux **fichiers** quand ils auront des tables (backlog).

## Conséquences

- L'historique ment sur la forme : une vieille révision montre le slug actuel, pas celui tapé à l'époque. Assumé — l'historique de WikiOui sert à récupérer du contenu, pas de témoignage forensique.
- Un bug de réécriture altérerait l'historique sans copie de secours : la réécriture doit être testée sérieusement (AST, transaction, cas `edit`/ancre/entry-list).
- Les URLs externes et favoris cassent au renommage (assumé, annoncé dans le dialogue).
- Chaque futur type de descripteur portant une référence (`form-list`, `file-list`…) doit être enrôlé dans la carte des références — c'est le prix récurrent de l'option choisie.
- `docs/forms.md` : le « figé » des identités de fiche et la « stabilité » des valeurs `entry-list` deviennent « tenu à jour par le renommage ».
