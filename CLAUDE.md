# WikiOui

Conception : [`docs/architecture.md`](docs/architecture.md) (+ ADR dans `docs/adr/`), glossaire du domaine : [`CONTEXT.md`](CONTEXT.md).

## Conventions de code

- **Tout le code est en anglais** : noms de fichiers, composants (y compris les composants MDX du registre, ex. `<Button>`), props/attributs, variables, fonctions, clés de config, classes CSS. Le français est réservé à ce que voit ou tape l'utilisateur : textes d'UI, contenus seedés, slugs des pages spéciales, valeurs saisies par les auteurs (ex. noms d'icônes).
- **Les commentaires sont toujours en anglais** (le reste — docs, ADR, UI — est en français).
- **Préférer du code clair avec des noms explicites plutôt que des commentaires.** Un commentaire ne paraphrase jamais le code : il apporte une spécificité que le code ne peut pas montrer — la raison d'un choix, une contrainte externe, une référence d'ADR.
