# Rendu d'une page en place : modale RSC inline, route `/{slug}/iframe`, brique `WikiFrame`

Afficher une page ou une fiche **sans son chrome**, au-dessus ou au sein de la page courante — modale d'un `<WikiLink>` ou d'un `<Button>` en cible modale, clic sur une fiche d'`<EntriesView>`, ligne dépliée de la vue Liste, panneau de la Carte, aide-mémoire de l'éditeur — se fait par un **rendu RSC inline** : le corps de la page, diffusé en flux dans la page courante. Une seule route iframe subsiste, pour le composant `<Iframe>` et la fédération entre instances.

## Contexte

Chaque ouverture passait autrefois par une iframe chargeant `/{slug}/iframe` : une requête non cachée (`force-dynamic`), un second bundle React, un second runtime, une réhydratation. Rien n'était préchargé, un squelette précédait chaque affichage, puis un `ResizeObserver` mesurait la hauteur.

L'état « modale ouverte sur telle fiche » n'était nulle part dans l'URL : le bouton retour quittait la page hôte, un lien ne se partageait pas, un rechargement perdait la fiche. Sur mobile, où `Échap` n'existe pas, le geste de retour faisait sortir du site.

React Server Components lève la contrainte qui justifiait l'iframe : une Server Action peut renvoyer un **élément** rendu côté serveur, diffusé en flux dans la page courante. Le corps chrome-free (`<PageBody>`, [ADR 0025](0025-access-layer.md)) devient réutilisable sans second document.

## Décision

### La modale rend son corps en RSC inline

- **Un hôte unique** — `ModalProvider`, dans `app/(site)/layout.tsx` : un seul `<Dialog>` pour tout le site. Le **niveau unique** devient vrai **par construction** — il n'existe qu'un hôte, donc jamais deux couches ; une fiche B ouverte depuis une fiche A **remplace** A.
- **La Server Action `readPageBody`** (`modules/pages/content-actions.tsx`) retourne `{ title, body }` : le titre est une chaîne, résolue avant le retour, donc la modale a son en-tête tout de suite ; le corps est un **élément non attendu** — l'action retourne aussitôt et React diffuse le corps sous une frontière `Suspense`. `getPageWithCurrent` étant enveloppé dans `cache()`, le titre et le corps ne font qu'une lecture. Un passe-plat `"use server"` légitime (CLAUDE.md) : un composant client ne peut pas atteindre la couche d'accès.
- **Une frontière d'erreur** entoure le corps : un gabarit au MDX malformé fait lever `renderMdx` pendant la diffusion ; sans elle, la modale ne s'ouvrirait pas du tout.

### L'état vit dans l'URL

`?modale={slug}` — le même paramètre sert `<EntriesView>` et les liens en cible modale.

- Mécanisme : `window.history.pushState` **natif**, jamais `router.push`. Le `pushState` natif ne déclenche **aucun aller-retour serveur** : c'est ce qui garantit que l'état d'un `<EntriesView>` sous-jacent — recherche, filtres, tri, pagination — survit intact à chaque ouverture et fermeture, et ce que `router.push` remettrait en jeu sur une route `force-dynamic`. Next 16 synchronise `useSearchParams` sur ce `pushState`.
- Contenu : un **slug interne** seul, validé par `isValidSlug`. Ferme la forge `?modale=https://site-piege` ; une cible externe garde l'iframe sandboxée (`ModalLink` + `WikiFrame`), **sans URL**. Si elle vise une page WikiOui `/{slug}/iframe`, celle-ci **émet son titre** par `postMessage` et la modale le nomme dans sa barre à la place de l'URL (voir « Ce qui reste sur l'iframe »).
- Clic : empile une entrée d'historique (le retour ferme). Une fiche B depuis une fiche A empile aussi — c'est un lien.
- Survol d'un `<Button modal="hover">` : **n'écrit rien** dans l'URL — une intention faible ouvre sur un état local. Le déclencheur reste un vrai `<a href="/{slug}">` : clic droit, clic molette et `Ctrl+clic` ouvrent un onglet sans code.

### Le préchargement

| Déclencheur | Délai |
| --- | --- |
| `mouseenter` | **100 ms** — un balayage de souris à travers un tableau ne déclenche rien, une visée déclenche |
| `focus` | immédiat — intention explicite |
| `touchstart` | immédiat |

Un cache `Map<slug, {title, body}>` plafonné à **20**, partagé par l'hôte et toutes les surfaces en place : un survol qui le réchauffe profite partout où la fiche s'affiche ensuite. Pas d'anticipation au chargement de la vue : sur un tableau de 200 fiches, elle déclencherait des lectures que personne n'a demandées.

### Le titre

Le titre est calculé une fois (`pageTitle`, la règle de `leadingHeading`) et sert à l'en-tête comme au corps, qui le retire (`<PageBody hideTitle>`). Les deux modales — la modale RSC inline (cible interne) et la modale à iframe (`ModalLink`, cible externe) — **nomment leur cible de la même façon**, sur deux niveaux visuels :

- **En grand** (`text-lg font-semibold`, la taille d'un `#` de page) : l'**identité de la page**. Un titre stocké ([ADR 0020](0020-stored-entry-title.md)), un titre d'ouverture `#`, ou **à défaut le slug** — un slug identifie la page autant qu'un titre.
- **Discret** (petit, grisé) : une **URL externe anonyme**, seul cas où la modale n'a aucune identité de page à afficher.

**Modale interne** (`page-modal.tsx`) : le titre de la page, sinon — page sans titre, refusée ou inexistante — le **slug, affiché en grand** (plus jamais `sr-only`). Le `DialogTitle` reste l'exigence d'accessibilité de `Dialog`, désormais toujours visible.

**Modale externe** (`modal-link.tsx`) : la cible est une iframe cross-origin, dont la modale ne peut pas lire le DOM. Le titre voyage par `postMessage` (`WikiFrameResizeEmitter` l'émet, `WikiFrame` le reçoit et le passe à `ModalLink` par `onTitle`). La modale **classe la cible à l'instant du rendu**, sur le suffixe `/{slug}/iframe` que l'auteur écrit pour un embed WikiOui : un embed attend son message, un site tiers ne l'attend pas.

| État | Ce que reçoit `ModalLink` | Affichage |
| --- | --- | --- |
| Embed WikiOui, en attente | `undefined` | l'URL, **`sr-only`** — nom accessible, jamais montré, pour qu'un titre qui arrive ne remplace rien à l'écran |
| Embed WikiOui | le titre `string` posté — titre réel **ou slug**, car `generateMetadata` retombe sur le slug (`title: (await pageTitle(slug)) ?? slug`) | **en grand** |
| Site tiers (URL sans `/iframe`) | `null` **dès le rendu** — un site tiers ne poste rien | l'**URL**, discrète |

Un site tiers est donc connu d'avance : son contenu s'affiche **aussitôt** dans une boîte à ratio, sans attendre, et l'URL nomme la barre dès le rendu. Le délai de **600 ms** n'est plus que le **filet de sécurité d'un embed WikiOui** qui, en erreur, ne posterait jamais son message : passé ce délai, la modale retombe sur l'URL.

### Le confinement CSS

Le sandbox laisse passer une prop littérale `style={{position: 'fixed', inset: 0, zIndex: 9999}}` (`modules/authoring/literal-props.ts` ne refuse que `dangerouslySetInnerHTML` et `srcDoc`) : ce style couvrirait la page hôte. Réponse, sur le conteneur du corps :

```css
contain: layout paint;   /* écrête, et devient bloc conteneur des `fixed` */
isolation: isolate;      /* un zIndex interne ne passe plus devant le voile */
```

Les portails Base UI (`Select`, `Popover`, `Tooltip` d'un `<EntriesView>` imbriqué) s'échappent du conteneur, ce qui est souhaitable.

### Les autres surfaces en place

La ligne dépliée de la Liste, le panneau de la Carte et l'aide-mémoire de l'éditeur rendent le même corps par `InlinePageBody` (`modules/pages/page-modal.tsx`), sans iframe. Le panneau de la Carte défile son corps, la carte restant vivante à côté.

L'aide-mémoire s'ouvre **sans `?modale=`**, délibérément : l'éditeur n'a aucune garde de saisie non enregistrée, et une entrée d'historique y apprendrait que le bouton retour est inoffensif, alors qu'un retour de trop quitterait l'éditeur et perdrait la saisie en silence.

### Ce qui reste sur l'iframe

La route `/{slug}/iframe` (groupe `(bare)`, hors du chrome de `(site)`) et la brique `WikiFrame` (`modules/pages/ui/wiki-frame.tsx`) ne servent plus que **deux** appelants :

1. **Le composant auteur `<Iframe>`** sur cible **interne** — que le rendu inline ne prend **pas** en charge, définitivement. Le navigateur y donne gratuitement deux propriétés qu'il faudrait sinon reconstruire : l'**arrêt de récursion** (A embarque B qui embarque A : en inline, boucle de rendu serveur infinie) et l'**isolation** (l'embarqué est posé dans la prose de la page hôte, pas dans une modale confinable). Same-origin, la hauteur est lue dans le DOM (`ResizeObserver` sur `[data-wiki-frame]`) ; sur cible **externe**, le `contentDocument` est muré et la hauteur arrive par `postMessage`, sinon repli sur un ratio fixe.
2. **La fédération inter-instances.** `/{slug}/iframe` inclut `WikiFrameResizeEmitter` (`modules/pages/ui/wiki-frame-emitter.tsx`), qui publie sa hauteur **et son titre** par `postMessage` : une autre instance WikiOui embarque une de nos pages en s'auto-dimensionnant, sans configuration d'aucun côté.

La route rend la page **entière** par défaut. `?title=hidden` en retire le titre d'ouverture du **corps**, pour le seul cas cross-origin qui a une barre de titre visible : la modale d'un `<WikiLink>`/`<Button>` pointant vers une page WikiOui **externe**. Le titre ne peut pas traverser une frontière cross-origin par lecture du DOM — `data-wiki-title` a donc disparu ; il voyage par `postMessage` (`WikiFrameResizeEmitter` l'émet, `WikiFrame` le reçoit et le passe à `ModalLink` par `onTitle`). L'auteur écrit `?title=hidden` lui-même — comme le suffixe `/iframe` — pour éviter que le titre s'affiche deux fois. Le composant `<Iframe>`, lui, n'a **pas de barre de titre** où reporter le titre (à la différence de la modale et de son `DialogTitle`) : l'auteur n'y met donc pas `?title=hidden`, et la page embarquée affiche son propre titre dans son contenu, comme sur sa page.

## Conséquences

- **Zéro second document** à l'ouverture d'une modale ou d'une ligne dépliée : plus de bundle ni de réhydratation, la fiche est préchargeable et son état survit à l'ouverture.
- **Sécurité** : une cible **externe** reste sandboxée ([ADR 0002](0002-mdx-sandbox.md) : `sandbox` sans `allow-top-navigation`, `referrer-policy`, http(s) seul). Une cible **interne** est same-origin et non sandboxée (elle exécute nos composants client). La hauteur et le titre `postMessage` ne sont pas sensibles → `targetOrigin: "*"` côté émetteur, l'origine du parent étant inconnue d'avance.
- Fichiers : `modules/pages/page-modal.tsx` (hôte, `ModalTrigger`, `InlinePageBody`), `modules/pages/page-body.tsx`, `modules/pages/content-actions.tsx` (`readPageBody`), `app/(bare)/[slug]/iframe/page.tsx`, `modules/pages/ui/wiki-frame.tsx`, `modules/pages/ui/wiki-frame-emitter.tsx`.

## Hors périmètre (backlog)

- **Auto-hauteur des sites tiers via `iframe-resizer`.** `WikiFrame` dimensionne déjà toute cible cross-origin qui parle **notre** protocole `postMessage` (`wikioui:resize`) — donc une autre instance WikiOui. Prendre en charge un site tiers quelconque via *son* protocole n'apporterait qu'un gain étroit : le site cible doit avoir installé le script enfant (rarement sous le contrôle de l'auteur), au prix d'une dépendance tierce (licence GPLv3/commerciale). Différé. Une option avancée sur `<Iframe>` activerait alors l'écoute de ce protocole pour les cibles externes.
