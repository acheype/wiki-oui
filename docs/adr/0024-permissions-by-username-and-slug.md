# Les droits désignent un `username` et un `groupSlug`, jamais un id

Partout où le modèle référence une personne ou un groupe — propriété d'une page, auteur d'une révision, appartenance à un groupe, lignes de `PageAcl`, droits par champ dans `Form.schema` — la valeur stockée est le **`username`** ou le **`groupSlug`**, avec une clé étrangère `ON UPDATE CASCADE ON DELETE …`. Jamais l'`id` technique, alors que `Page`, `Form` et `Revision` en portent tous un.

## Considered Options

**Cibler `user.id`.** L'immuabilité rendrait le renommage gratuit partout, et `id` est la seule colonne que tous les adaptateurs BetterAuth garantissent. Écarté pour deux raisons : la table d'ACL devient illisible sans jointure, et surtout un `username` est déjà unique, donc une cible de FK parfaitement valide — l'intégrité référentielle est la même dans les deux cas. L'argument classique du « nom qui pourrit » ne vaut que pour un nom stocké **sans** clé étrangère.

**Stocker des noms sans FK, à la YesWiki.** Écarté : un nom mal tapé n'a aucun effet et personne ne le sait, un compte supprimé laisse un droit fantôme, et recréer un compte homonyme lui ferait hériter des droits de l'ancien.

## Consequences

- Le `onDelete` **n'est pas le même partout**, et c'est lui qui porte tout le poids : `Cascade` sur `PageAcl` et `GroupMember` (le droit et l'appartenance disparaissent avec la personne, c'est l'effet voulu) ; **`SetNull`** sur `Page.ownerUsername` et `Revision.authorUsername`, où la même cascade détruirait des pages et des pans d'historique. Une intervertion silencieuse de ces deux réglages est le pire accident possible de ce modèle.
- Un renommage de compte ou de groupe est **cascadé par Postgres** sur toutes les colonnes portant une FK — sans une ligne de code.
- Mais **aucune clé étrangère n'entre dans du JSON.** Les droits par champ et les défauts d'un formulaire vivent dans `Form.schema` : ils exigent un **balayage applicatif**, déclenché au renommage *et* à la suppression, faute de quoi un droit devient inerte ou, pire, ressuscite pour un homonyme. Même facture que `lib/slug-rename-db.ts` et `lib/field-rename-db.ts` (ADR 0016/0017), et à couvrir en test au même titre.
- L'auteur d'une révision est une **référence vivante**, pas une valeur gelée : renommer un compte renomme sa signature dans tout l'historique. C'est le pendant exact de l'ADR 0020, qui gèle le titre automatique parce qu'il est une *valeur* de la fiche. Une photo du nom prise à l'écriture ferait apparaître deux personnes là où il n'y en a qu'une.
