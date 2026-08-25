# Les invariants tenus par un outil

Cinq contrôles font échouer le build plutôt que de compter sur la vigilance — la culture posée par l'ADR 0013. Trois sont des règles ESLint (`pnpm lint`), deux sont des scripts de `prebuild`. Aucun ne remplace une revue : chacun ferme **un** trou précis, et le dit dans son message d'erreur.

| Contrôle | Ce qu'il refuse | Quand |
| --- | --- | --- |
| `wikioui/module-seam` | importer un fichier de sous-dossier depuis un autre module | `pnpm lint` |
| `wikioui/access-layer` | toucher `Page` ou `Form` hors de la couche d'accès | `pnpm lint` |
| `wikioui/access-clauses` | joindre une clause de droits par un `OR` | `pnpm lint` |
| `scripts/verify-descriptors.ts` | un descripteur qui décrit une propriété que son composant n'a pas ; deux modules qui donnent le même nom à un composant | `pnpm prebuild` |
| `scripts/verify-access/` | une lecture exportée de `Page` ou `Form` qui ne passe par aucune garde | `pnpm prebuild` |

## Un exemple chacun

### `wikioui/module-seam` — la profondeur dit la visibilité (ADR 0029)

L'interface d'un module est son listing de dossier : un fichier racine s'importe de partout, un fichier de sous-dossier ne s'importe que depuis son propre module.

```ts
// dans modules/pages/ — refusé
import { canRead } from "@/modules/permissions/decide/rules";
// → « modules/permissions/decide is private (ADR 0029) »

// ce qui est offert à la place, à la racine de permissions
import { currentCanRead } from "@/modules/permissions/person";
```

Deux exceptions, et deux seulement : `app/` compose `ui/`, et `modules/authoring/registry/sources.ts` atteint les `wiki-components/`.

### `wikioui/access-layer` — une seule couche vers `Page` et `Form` (ADR 0025)

Deux volets, parce qu'une règle syntaxique ne lit que des noms.

```ts
// volet 1 — refusé partout hors de la couche (le `tx.` d'une transaction compris)
const page = await prisma.page.findUnique({ where: { slug } });

// volet 2 — refusé aussi, car il ferme ce que le premier ne voit pas :
// une Page atteinte par une relation, ou du SQL brut
import { prisma } from "@/lib/prisma";
```

La liste d'exceptions vit dans `eslint.config.mjs`, chaque chemin commenté. Les balayages ne l'importent pas : ils **reçoivent** leur client en paramètre.

### `wikioui/access-clauses` — jamais un `OR` autour d'une clause de droits

Une clause vaut `{}` pour qui lit tout, et Prisma **supprime une branche vide d'un `OR`**. La branche qui disait « tout » disparaît, silencieusement, et seulement pour qui a le plus de droits.

```ts
// refusé
where: { OR: [await currentReadableWhere(), { slug: { in: ouvertes } }] }

// ce qui marche : un AND n'a pas ce piège
where: { AND: [{ slug: { in: choisies } }, await currentReadableWhere()] }
```

### `scripts/verify-descriptors.ts` — le descripteur fait foi (ADR 0013, ADR 0002)

**Le descripteur et son composant disent la même chose.** Le YAML décrit les propriétés que le ComponentBuilder offrira à l'auteur ; le `.tsx` les reçoit en props. Le script lit les deux **sources** — il ne charge jamais le composant — et refuse qu'elles divergent : une propriété décrite dans le YAML et absente du composant serait un champ que la modale propose et que le rendu ignore.

```yaml
# modules/pages/wiki-components/button.yaml décrit une propriété `label`…
properties:
  label: { type: string }
```

```tsx
// …que modules/pages/wiki-components/button.tsx ne reçoit pas : le build échoue
export function Button({ text }: { text: string }) { … }
```

**Un nom de composant appartient à un seul module.** Le nom de la balise vient du nom du fichier (`button.tsx` → `<Button>`), et une balise ne peut appeler qu'un composant. Deux modules qui nomment un fichier pareil produiraient deux composants pour une même balise, dont un seul serait rendu, l'autre disparaissant sans un mot.

```text
modules/pages/wiki-components/card.tsx
modules/forms/wiki-components/card.tsx
→ « <Card> is claimed by two modules: pages and forms — rename one of the files »
```

Un troisième contrôle ferme le cas inverse : un module qui a un dossier `wiki-components/` sans figurer dans `modules/authoring/registry/sources.ts` n'est balayé par personne, et ses composants ne rendraient rien, en silence.

### `scripts/verify-access/` — toute lecture exportée passe par une garde (ADR 0025)

Une garde est rarement dans le fichier qui lit : `content.ts` lit la page, `ifReadable` décide, `canRead` répond — trois fichiers. Une règle ESLint ne saurait pas le voir, ne lisant qu'un fichier à la fois. C'est la raison d'être de ce script : il suit le **graphe d'appels** de chaque lecture exportée de la couche d'accès, à travers les fichiers, jusqu'à `canRead`, `canWrite` ou `isAdmin`.

```ts
// dans modules/pages/content.ts — le build échoue
export async function getPagesByTag(tag: string) {
  return prisma.page.findMany({ where: { tags: { has: tag } }, include: WITH_RIGHTS });
}
// → « getPagesByTag reads Page and never reaches canRead, canWrite or isAdmin »
```

Deux pièges connus, écrits dans le message d'erreur et dans les docstrings du script :

- **une garde ne compte que là où elle est appelée** — `rows.map(ifReadable)` se lit comme non gardé, `rows.map((row) => ifReadable(row))` non ;
- **il vérifie qu'une garde est atteinte, jamais qu'elle refuse** — c'est un contrôle de câblage, pas de politique.

Une lecture délibérément non gardée s'ajoute à `UNGUARDED_READS`, **avec son motif écrit**. Un seul invariant y règne, et c'est lui qu'une revue vérifie sur tout ajout : **aucune entrée ne rend de contenu**.

## Ce qui a été écarté

- **Une règle nommant les primitives de droit.** Une liste de noms est une convention déguisée en règle : une primitive écrite demain n'y est pas, et l'oubli **ouvre**. C'est pourquoi `verify-access` suit le graphe d'appels plutôt que des noms.
- **Row-Level Security et l'extension Prisma.** Le raisonnement complet est dans l'[ADR 0025](adr/0025-access-layer-protected-by-eslint.md).
