# Rendu du contenu : MDX bridé (sandbox) avec registre de composants

Le contenu des pages est stocké et rendu au format MDX, mais **bridé** : imports/exports interdits, expressions JS de contenu supprimées, expressions d'attribut réduites aux **littéraux statiques**, et seuls les composants d'une liste blanche sont rendus.

## Contexte

Le contenu est éditable en ligne, sans auth au MVP : n'importe qui peut éditer n'importe quelle page. Or MDX compile en JavaScript exécuté (`import`, `export`, expressions `{…}`) → exécution de code arbitraire (RCE) si on le laisse libre. Whitelister les composants ne suffit pas : ça contrôle *quels composants* s'affichent, pas *l'exécution de JS*.

Tension découverte à l'usage (2026-07-16) : le `blockJS` de `next-mdx-remote`, qui assurait la neutralisation, est un **hachoir** — il supprime tout `mdxJsxAttributeValueExpression` sans regarder son contenu. Une prop JSX ne pouvait donc être qu'une chaîne : `<Image width={400} />` perdait sa largeur en silence, alors que c'est la syntaxe que le ComponentBuilder émet (`serializeAttribute`). Or on veut pouvoir intégrer n'importe quel composant JSX, donc respecter sa spec : une prop `number` doit recevoir un nombre.

## Décision

Pipeline MDX (`next-mdx-remote` + remark-gfm + mdx-annotations) avec :

- **Registre de composants = répertoire `/components/wiki` + fichier de configuration.** Tout composant `.tsx` de ce répertoire est appelable depuis le contenu ; toute balise hors registre n'est pas rendue. Un descripteur co-localisé (`button.yaml`) ne joue que sur le menu « Composants » de l'éditeur, jamais sur l'autorisation de rendu.
- **`import` / `export` désactivés d'office** (`useDynamicImport: false` ⇒ `removeImportsExportsPlugin` du vendeur).
- **Expressions JS de contenu supprimées** (`{variable}`, `{func()}` dans le texte) : une page est de la donnée, pas un programme.
- **Expressions d'attribut réduites à une liste blanche de littéraux statiques** (`lib/mdx-literal-props.ts`) : nombre, chaîne, booléen, `null`, gabarit sans trou, et tableaux/objets composés uniquement de ceux-là. Tout le reste — identifiant, appel, accès membre, gabarit à trou, spread `{...x}` — est retiré de l'arbre.

`mdx-annotations` repose sur les expressions (`{{ id: 'x' }}` est un objet JS fusionné en props) : notre plugin s'exécute **après** lui dans la liste `remarkPlugins`, donc après qu'il a consommé ses annotations. Le vendeur ajoute ses propres plugins *après* les nôtres, d'où l'ordre effectif : `mdx-annotations` → `remark-gfm` → notre liste blanche → plugins du vendeur.

### Pourquoi une liste blanche, et pas la liste noire du vendeur

`blockJS: false` bascule sur `blockDangerousJS`, une liste noire d'identifiants (`eval`, `Function`, `process`, `require`…) que `next-mdx-remote` qualifie lui-même de « best effort ». **Vérifié** : `<Image width={(() => 400)()} />` la traverse et **s'exécute côté serveur** — l'IIFE ne nomme aucun identifiant interdit. C'était donc un RCE serveur pour quiconque édite une page.

Un littéral statique, lui, n'a **pas de sémantique d'évaluation** : il compile en constante. Pas d'identifiant à résoudre, donc rien d'où s'échapper. La sûreté vient de la construction, pas d'une énumération des dangers connus — une liste noire doit deviner à l'avance tous les chemins vers le constructeur `Function`, une liste blanche n'a rien à deviner.

`blockDangerousJS` reste activé comme seconde couche gratuite, jamais comme la barrière.

## Conséquences

- Fidèle à la spec JSX **et** à la spec « format MDX » sans exposer une RCE : un composant reçoit un vrai nombre, un vrai booléen, un vrai tableau. Le bridage ne dépend plus de l'arrivée de l'auth — il est en place, et vaut pour tous les auteurs.
- Le rendu ne peut pas être « moins bridé pour un admin » sans rouvrir cette décision : le sandbox est uniforme.
- **Le rendu reste muet, l'enregistrement parle.** Le plugin laisse tomber sans rien dire — une page rendue n'a pas d'auteur à qui parler, et un encart d'avertissement s'adresserait au lecteur. C'est `lib/page-lint.ts` qui prévient l'auteur au moment où il enregistre, non bloquant. Les deux partagent `isStaticLiteralExpression`, donc ce qui est refusé et ce qui est annoncé ne peuvent pas diverger.
- **ADR 0010 s'appuyait en partie sur cette neutralisation** pour écarter les props structurées (`items={...}`) : cet argument tombe, un tableau littéral passe désormais. La décision de `<Menu>` tient toujours sur son autre motif — la lisibilité pour un auteur wiki.
- Tests : `lib/mdx-literal-props.test.ts` (littéraux acceptés, évaluables refusés sans casser la compilation), vérifiés par mutation.
