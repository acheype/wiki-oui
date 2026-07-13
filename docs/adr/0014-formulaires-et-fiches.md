# Formulaires & fiches : un formulaire n'est pas une page, une fiche en est une

Un **formulaire** est une définition de champs — entité `Form` en base, écrite à l'exécution via le FormBuilder, jamais historisée. Une **fiche** est une **Page** (`Page.formId` renseigné) dont le contenu est un **snapshot JSON `data` porté par la `Revision`** au lieu du MDX. Les écrans d'administration sont des **pages spéciales** rendant des composants intégrés clients. Spécification complète : [`docs/forms.md`](../forms.md).

## Contexte

La v0.3 reprend le Bazar de YesWiki : définir des formulaires en ligne, saisir des fiches, les afficher. Deux objets nouveaux dont il faut décider la nature vis-à-vis du domaine existant (Page/Révision, ADR 0003), et un premier écran d'application (liste des formulaires + FormBuilder) dont il faut décider le routage — le domaine ne connaissait que les slugs de pages et le segment réservé `api`. L'analyse des alternatives (entité `Fiche` séparée, lib de form-builder, routes `/admin` dédiées) est dans [`docs/research/formulaires-fiches-architecture.md`](../research/formulaires-fiches-architecture.md).

## Décision

**Formulaire ≠ page.** Un formulaire n'a rien à lire : c'est une définition consommée par la machinerie. Entité `Form` (PK uuid technique + `slug` unique + `name` + `schema` Json + `template` MDX nullable), stockée en base parce qu'écrite à l'exécution — à la différence des descripteurs de composants, fichiers du repo (ADR 0013).

**Fiche = page.** Une fiche est adressable, versionnée, taguée, possédée — la définition exacte d'une Page, moins « le contenu est du MDX ». `Page.formId` nullable discrimine : `null` = page MDX (inchangé), renseigné = fiche. La couche identité/versioning est partagée ; seule la couche contenu/édition/rendu branche sur `formId` : le snapshot est `Revision.data` (Json) au lieu de `content` (qui devient nullable — exactement l'un des deux est renseigné), `edit` ouvre le formulaire généré au lieu de CodeMirror, `show` rend la vue par défaut ou le gabarit MDX du formulaire via le pipeline existant (ADR 0002).

**Identités figées, dérivées, révélables.** Le slug d'un formulaire (dérivé de son `name`), le `name` d'un champ (dérivé de son `label`) et le slug d'une fiche (dérivé de son titre) suivent le même motif : auto-dérivés, cachés, révélables en un clic pour personnalisation, **immuables au premier enregistrement** — comme le slug d'une page, qui est une identité, pas un attribut. Collision de slug de fiche : message + révélation du champ, jamais de suffixe silencieux.

**Cycle de vie.** Supprimer un formulaire supprime ses fiches (`onDelete: Cascade`), derrière une confirmation explicite. Le `Form` n'est **pas historisé** (enregistrer écrase, comme les tags — ADR 0007) ; les fiches, elles, héritent des révisions de Page. Modification du schéma après coup : **dégradation gracieuse** — clé orpheline ignorée mais préservée dans les snapshots, champ nouveau vide ; pas de versionnage de schéma.

**Écrans = pages spéciales + composants intégrés.** `formulaires` (→ `<FormsAdmin>`) et `fiches` (→ `<EntriesAdmin>`) sont des pages spéciales seedées, dans la philosophie « le menu est du contenu » : l'écran vit dans le wiki, son hébergement est éditable. Les états de navigation vivent dans les **query params** (`/formulaires?id=…`, `/fiches?nouvelle&formulaire=…`), lus par `useSearchParams()` côté client — F5, retour, liens directs fonctionnent sans toucher au pipeline. Les données passent par **Server Actions, y compris en lecture** : le triptyque du domaine (handler = vue, mutation = écriture, service = API pour du code) s'élargit — une Server Action peut aussi lire pour un composant client, sans URL.

## Conséquences

- Aucun nouveau segment d'URL réservé ; en contrepartie, les handlers des pages spéciales (`/formulaires/edit`, `/formulaires/revisions`) portent sur le **MDX de la page hôte**, pas sur les formulaires — assumé.
- L'écran d'admin est **cassable par édition** (supprimer la balise du contenu) — assumé, réparable en rééditant la page (non supprimable car spéciale).
- `Revision.content` nullable : le code existant qui le lit doit brancher sur la nature de la page.
- Renommer un formulaire après création est impossible ; les `<EntryForm id="…">` écrits dans le MDX ne peuvent donc jamais se casser par renommage (un id inconnu affiche « formulaire introuvable »).
- La suppression cascade rend la confirmation UI critique : elle doit annoncer le nombre de fiches emportées.
