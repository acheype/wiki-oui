# WikiOui

Conception : [`docs/architecture.md`](docs/architecture.md) (+ ADR dans `docs/adr/`), glossaire du domaine : [`CONTEXT.md`](CONTEXT.md).

## Conventions de code

- **Tout le code est en anglais** : noms de fichiers, composants (y compris les composants MDX du registre, ex. `<Button>`), props/attributs, variables, fonctions, clés de config, classes CSS. Le français est réservé à ce que voit ou tape l'utilisateur : textes d'UI, contenus seedés, slugs des pages spéciales, valeurs saisies par les auteurs (ex. noms d'icônes).
- **Les commentaires sont toujours en anglais** (le reste — docs, ADR, UI — est en français).
- **Préférer du code clair avec des noms explicites plutôt que des commentaires.** Un commentaire ne paraphrase jamais le code : il apporte une spécificité que le code ne peut pas montrer — la raison d'un choix, une contrainte externe, une référence d'ADR.

## Règles de commit Git

- Toujours écrire le commit en anglais.
- Utiliser le format de Conventional Commits (feat, fix, refactor, docs, chore).
- Limiter l'objet (la première ligne) à 72 caractères maximum.
- Ajouter systématiquement un corps de message expliquant le raisonnement ou la motivation des changements.
- Référencer les numéros d'issue lorsque c'est pertinent.
- N'utiliser jamais de messages génériques tels que "fix bug" ou "update code".

## Conventions de rédaction

- Mettre toujours un espace insécable après « ou avant » dans les textes affichés à l'utilisateur.

## Conventions Markdown

- Dans les tableaux, la ligne de séparation doit utiliser le même espacement que les lignes de contenu : `| --- | --- |` (avec espaces), jamais `|---|---|` (règle markdownlint MD060, style « compact »).
