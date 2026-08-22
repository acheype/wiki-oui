# Les props structurées s'écrivent en expressions littérales JSX

Les paramètres composites d'`<EntriesView>` (filtres, colonnes, tris proposés, surcharges de couleurs, formulaires multiples) sont des listes d'objets, et la forme écrite dans les pages est **pérenne** — le contenu enregistré en dépendra pour toujours. La forme canonique retenue est l'expression littérale JSX :

```mdx
<EntriesView form={["associations", "evenements"]} view="grid"
  filters={[{ field: "type", title: "Type de structure", icon: "lucide:users" }, { field: "commune" }]} />
```

## Contexte

Le bac à sable accepte déjà les expressions **purement littérales** (`lib/mdx-literal-props.ts`, l'allowlist de l'ADR 0002 : objets, tableaux, chaînes, nombres, booléens — aucun identifiant ni appel) : le rendu n'exige rien de neuf. Côté builder en revanche, la règle issue du commit `3ebc537` traite toute prop connue portant une expression comme « repart du défaut, expression abandonnée » — logique tant qu'aucun type de champ ne savait représenter un tableau.

## Décision

- L'expression littérale est la **forme canonique** des props structurées : le builder la génère, et sait la re-parser (round-trip sur l'AST du littéral, comme pour les props scalaires).
- La règle « expression → abandonnée à la réédition » est **raffinée** : elle ne vaut plus que pour les champs de types scalaires ; un champ de type structuré (`field-rows`, mappings, `form` multiple) parse le littéral et le réédite.
- Alternatives rejetées : un mini-langage en chaîne (`filters="type|Type,commune"` — illisible, fragile à l'échappement, hostile à l'édition au clavier) et des balises enfants (`<Filter …/>` — fait d'EntriesView un wrapper alors que l'édition des wrappers est au backlog, et éclate la config en deux niveaux).

## Conséquences

- Aucune évolution du bac à sable ; la règle d'omission est inchangée (prop égale à son défaut = omise).
- Un littéral hors contrat (objet sans `field`, valeur inconnue) est signalé à l'enregistrement par le lint, comme toute valeur qu'une prop ne peut pas utiliser.
- Le MDX reste éditable à la main : la forme est celle qu'un auteur JS écrirait spontanément.
