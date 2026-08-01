# Un droit par défaut se recopie à la création, il ne se lie jamais

Les droits par défaut descendent par **copie**, à un seul instant — la création — et jamais par un lien vivant : `wiki.config.ts` fournit ceux d'une page nouvelle et ceux d'un formulaire nouveau, un formulaire fournit ceux de ses fiches. Modifier un défaut ne touche donc **rien** de ce qui existe déjà.

```
wiki.config.ts  ──copie à la création du formulaire──▶  Form
Form            ──copie à la création de la fiche────▶  Page
```

## Contexte

Deux concepts se ressemblent et n'ont pas les mêmes besoins. Un **droit par défaut** est un gabarit : il n'est jamais interrogé pour autoriser qui que ce soit. Un **droit effectif** est ce qui garde l'accès, interrogé à chaque affichage. Les distinguer explique pourquoi ils ne vivent pas au même endroit : les défauts dans `wiki.config.ts` et dans `Form.schema` (là où un humain les rédige), les effectifs dans une colonne de portée et la table `PageAcl` (là où Postgres garantit qu'un droit ne survit pas à ce qu'il désigne).

## Considered Options

**L'héritage vivant** — une fiche qui suit en permanence les défauts de son formulaire — est la solution attendue, et c'est pour ça qu'elle mérite d'être écrite ici. Elle est écartée parce qu'un réglage discret rouvrirait en masse des fiches verrouillées à la main : changer un défaut deviendrait une opération à conséquences invisibles sur des centaines d'objets. Elle obligerait aussi à inventer une notion de surcharge (« cette fiche suit-elle encore son formulaire ? »), donc un état de plus à afficher et à expliquer.

## Consequences

- Rien à expliquer à l'utilisateur : il n'y a **pas de valeur héritée**, seulement des valeurs, préremplies à la naissance.
- Le seul chemin vers l'existant est une action explicite — **« Appliquer ces accès par défaut aux fiches existantes »**, à confirmation chiffrée, sur le motif des recalculs de masse des ADR 0017 et 0020.
- Aucune clé de configuration propre aux fiches : un formulaire naît avec les défauts du wiki recopiés, et la vraie décision se prend de toute façon formulaire par formulaire.
- Un défaut qui référence un compte ou un groupe disparu ne peut pas **accorder** un droit en douce : les principaux inexistants sont écartés au moment de la copie.
