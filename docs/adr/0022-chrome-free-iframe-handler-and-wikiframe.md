# Rendu chrome-free : handler `/{slug}/iframe` et brique `WikiFrame`

Le rendu d'une page ou d'une fiche **dans une iframe** — popup d'`<EntriesView>`, ligne dépliée de la vue Liste, panneau de la Carte, modale d'un `<Lien>`/`<Button>` en cible modale — passe désormais par **une seule route de rendu sans chrome** (`/{slug}/iframe`) et **une seule brique de mise en cadre** (`WikiFrame`).

## Contexte

Chaque surface qui embarquait une iframe avait sa propre cible et sa propre logique de hauteur :

- le rendu chrome-free n'existait que pour les fiches (`/api/render/entry/[slug]`, limité aux pages `formId`) ;
- `ModalLink` (cible modale d'un lien) iframait la **vraie** page — chrome du site **et** barre d'actions « Modifier / Supprimer » comprises : doublon visuel, et un bouton destructeur offert depuis un simple aperçu ;
- le dimensionnement était disparate (hauteur fixe, ou lecture DOM same-origin dans `EntryFrame`).

On voulait embarquer aussi bien une page interne qu'un site externe — voire une **autre instance WikiOui** — sans dupliquer trois stratégies.

## Décision

**1. Un seul rendu chrome-free : le handler `/{slug}/iframe`** (ADR 0001), pour **toute** page (fiche via `EntryContent` ou page MDX via `renderMdx`), pas seulement les fiches. Il remplace `/api/render/entry/[slug]`. Il vit dans un **groupe de route `(bare)`** distinct de `(site)` : un layout enfant ne peut pas retirer le layout de chrome porté par `(site)`, et un `[slug]` hors groupe entrerait en conflit — mais `(bare)/[slug]/iframe` et `(site)/[slug]` résolvent des chemins **distincts** (`/{slug}/iframe` vs `/{slug}`), coexistence **vérifiée au build** (Next 16). La page enveloppe le rendu dans `[data-wiki-frame]` (boîte mesurable) et n'inclut ni `PageActions` ni pied de page. `?title=hidden` retire le titre pour un conteneur qui le porte déjà (ligne de Liste dépliée).

**2. Une seule brique : `WikiFrame`** (`components/wiki/internal/wiki-frame.tsx`), **agnostique de la présentation** — la même iframe sert la modale (`EntryPopup`, `ModalLink`), le dépliage en ligne (vue Liste) et l'appel du composant `<Iframe>`. Un **seul capteur de hauteur, choisi selon ce que l'origine autorise** :

- **cible interne** → charge `/{slug}/iframe` (same-origin) : hauteur **lue directement dans le DOM** (`ResizeObserver` sur `[data-wiki-frame]`), autoritaire, sans protocole ;
- **cible cross-origin** → `contentDocument` est muré : la hauteur arrive par **`postMessage`**, émis par `WikiFrameResizeEmitter` inclus dans `/{slug}/iframe`, reçu et validé côté parent par `event.source === iframe.contentWindow` (nombre bien formé ; pas de plafond arbitraire — une valeur absurde ne coûte qu'un ascenseur inadapté) ;
- **site tiers non coopératif** → aucun message : repli sur un **ratio** fixe (paysage / portrait / carré), comme l'ancien `<Embed>`.

Pas d'allowlist d'origines en config : `postMessage` n'est pas soumis à CORS, et la validation `event.source` suffit (le parent connaît l'iframe qu'il a créée).

**3. Fédération inter-WikiOui native.** Puisque `/{slug}/iframe` **émet** toujours sa hauteur, embarquer la page d'une **autre** instance WikiOui (cross-origin) s'auto-dimensionne sans aucune configuration : c'est le cas « cross-origin » ci-dessus, servi par le même mécanisme.

**Exception assumée :** le panneau latéral de la Carte garde une iframe **pleine hauteur défilante** (il remplit un panneau à hauteur fixe, l'inverse de l'auto-hauteur) — il ne passe donc pas par `WikiFrame`, mais partage la route `/{slug}/iframe`.

## Conséquences

- Un `<Lien target="modal">` vers une page interne n'affiche plus ni le chrome ni « Modifier / Supprimer » (régression historique corrigée).
- **Sécurité** : une cible **externe** reste sandboxée (ADR 0002 : `sandbox` sans `allow-top-navigation`, `referrer-policy`, http(s) seul) ; une cible **interne** est same-origin et non sandboxée (elle doit exécuter nos composants client, ex. la carte Leaflet). La hauteur `postMessage` n'est pas sensible → `targetOrigin: "*"` côté émetteur (le parent peut être n'importe quelle instance WikiOui, dont l'origine est inconnue d'avance).
- Fichiers : `app/(bare)/[slug]/iframe/page.tsx`, `components/wiki/internal/wiki-frame.tsx`, `components/wiki/internal/wiki-frame-emitter.tsx`. Suppressions : `app/api/render/entry/` et l'ancien `entry-frame.tsx`. (`GET /api/render`, l'aperçu MDX du ComponentBuilder, est indépendant et subsiste.)
- Le composant auteur `<Iframe>` (ex-`<Embed>`) s'appuie sur `WikiFrame` et embarque page interne **ou** URL externe (voir [`component-builder.md`](../component-builder.md)).
