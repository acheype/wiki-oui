# Le builder d'EntriesView reste généré par descripteur, via des types de champ étendus

`<EntriesView>` (v0.4) est le composant le plus configurable du wiki : neuf vues, une quarantaine de paramètres, et des widgets que le vocabulaire du descripteur (docs/component-builder.md) ne savait pas décrire — sélecteur de vues, sélecteurs de champs du formulaire choisi, listes ordonnées champ + titre, mappings valeur → couleur/icône. Plutôt que de coder une modale spécifique, on **étend le vocabulaire** et EntriesView reste 100 % piloté par son YAML.

## Décision

Six nouveaux types de champ **génériques** : `view-picker` (tuiles radio avec icône), `form-field` (sélecteur de champ·s des formulaires choisis — la nouveauté mécanique : ses **options se chargent dynamiquement**, par Server Action, selon la valeur d'un champ frère de la modale, ici `form` ; restriction par types de champs et pseudo-champs déclarables), `field-rows` (lignes ordonnées : champ + titre éditable en place + extra optionnel comme l'icône des filtres), `color-mapping` (avec palette automatique), `icon-mapping`, `map-view` (centre + zoom, le widget du champ géolocalisation).

## Contre l'alternative

Une modale codée à la main aurait été plus directe pour ces widgets exotiques, mais elle créait un **deuxième chemin de builder** à maintenir, cassait l'invariant « tout composant à descripteur est généré et vérifié » (ADR 0013), et devait de toute façon parser/régénérer la balise pour la réédition. Chaque widget aurait dû être codé dans les deux cas : le surcoût de le déclarer générique est marginal, et YesWiki a fait le même choix (types `facette`, `sort-fields`, `color-mapping` de son Actions Builder).

## Conséquences

- Le moteur du builder apprend les **options dépendantes d'un champ frère** (chargement par Server Action) — réutilisable par tout futur composant lié aux formulaires.
- La vérification par signature doit savoir croiser un champ structuré (`field-rows`…) avec le type TS de sa prop (tableau d'objets).
- Les six types rejoignent la table des types de docs/component-builder.md et son vérificateur structurel.
