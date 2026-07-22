# Formulaires & fiches — bibliothèque et architecture

> **Note (2026-07-13)** : les décisions ont depuis été affinées et figées — voir les ADR [0014](../adr/0014-formulaires-et-fiches.md) et [0015](../adr/0015-shared-field-renderer-zod.md) et la spec [`docs/forms.md`](../forms.md), qui prévalent en cas d'écart (notamment : suppression d'un formulaire en **cascade** et non `Restrict`, écrans d'admin en **pages spéciales** et non routes dédiées, gabarit `{champ}` à accolades simples).

**Date : 2026-07-12.** Question posée : *ajouter la fonctionnalité Bazar de YesWiki (renommée **Formulaires**, ses instances devenant des **fiches**). Quelle bibliothèque WYSIWYG de construction de formulaires est adaptée à la stack ? Comment stocker et rendre les fiches ?* Référence YeswWiki : <https://yeswiki.net/?doc#/docs/fr/bazar>.

## Réponse courte

**Aucune bibliothèque de form-builder monolithique.** Le `formBuilder` de YesWiki (kevinchappell) est en jQuery — hors sujet en React 19. Les équivalents React clé-en-main (SurveyJS, Form.io, react-form-builder2) apportent leur propre moteur de rendu, leur thème et leur stockage : ils entrent en collision avec shadcn/Tailwind **et** avec l'architecture de descripteurs (ADR 0013). On ferait comme pour le **ComponentBuilder** — on construit l'UI, parce qu'elle sera mieux adaptée — en s'appuyant sur trois briques déjà natives à la stack.

Deux décisions de fond, détaillées plus bas :

1. **Un formulaire n'est *pas* une page** : c'est une *définition* (une liste de champs), stockée en base, consommée par la machinerie — pas un contenu qu'on lit. Nouvelle entité `Form`.
2. **Une fiche *est* une page** (comme dans YesWiki) : elle réutilise slug, URL, handlers, révisions, tags, propriétaire, liens wiki. Son « contenu » n'est pas du MDX mais un **snapshot JSON des valeurs de champs**, porté par la `Revision` (donc historisé comme un contenu de page). Elle est **éditée par le formulaire généré** (pas CodeMirror) et **rendue par un gabarit MDX** du formulaire.

## Les trois briques (natives à la stack)

| # | Rôle | Outil |
| --- | --- | --- |
| 1 | **Définir** un formulaire (schéma de champs) | Descripteur JSON en base + **Zod** comme contrat runtime |
| 2 | **Rendre & valider** une fiche (saisie) | `react-hook-form` + `@hookform/resolvers` (zod) + `<Form>` shadcn, **branchés sur le renderer de champs partagé** (voir plus bas) |
| 3 | **Construire** le formulaire (WYSIWYG) | UI maison + **dnd-kit** (ou Pragmatic drag-and-drop d'Atlassian) pour l'ordre/ajout des champs |

Rien de ceci n'introduit d'écosystème parallèle : brique 2 est exactement ce pour quoi le composant `<Form>` de shadcn existe (Radix pour l'accessibilité, Tailwind pour le thème, zod pour la validation), et brique 3 est un ComponentBuilder qui, au lieu de produire du MDX, produit un descripteur.

## À quoi sert Zod ?

C'est la question clé, et la réponse tient à une **différence de moment d'écriture** :

- Un **composant** est écrit par un développeur, dans le repo. Sa cohérence descripteur ↔ code est vérifiée **au build** par analyse de signature (`ts-morph`, ADR 0013). Il y a un `.tsx` à confronter, et un build pour le faire.
- Un **formulaire** est écrit par un utilisateur, **à l'exécution**. Il n'y a **ni `.tsx`, ni build, ni signature** à analyser. Il faut donc un contrat qui vive *au runtime*. **C'est précisément le rôle de Zod** — le pendant runtime du check de signature.

Concrètement, Zod intervient à trois endroits :

1. **Méta-schéma du formulaire** : quand un auteur enregistre un formulaire, un schéma Zod valide *que le descripteur lui-même est bien formé* (types de champs connus, `options` cohérentes, `showif` valides…). C'est l'équivalent runtime des « checks structurels » de l'ADR 0013.
2. **Schéma dérivé par formulaire** : de la liste de champs on **dérive un schéma Zod** (`champ requis → z.string().min(1)`, `nombre → z.number()`, `email → z.string().email()`, `liste → z.enum([...])`…). Ce schéma valide les **valeurs d'une fiche** à la soumission — **côté client** (résolveur de `react-hook-form`) **et côté serveur** avant l'écriture Prisma. **Une seule source de vérité, les deux côtés.**
3. **Types & inférence** : `z.infer` donne le type TS des données d'une fiche pour le reste du code.

En une phrase : **Zod est au formulaire ce que la signature `ts-morph` est au composant** — le garant que la forme déclarée et les données réelles restent cohérentes. Le contrat migre du build vers le runtime parce que l'objet migre du code vers la donnée.

## Quel avantage donnerait `@autoform/react` ?

`@autoform/react` génère une UI de formulaire shadcn/react-hook-form **directement depuis un schéma Zod** : labels, widgets, messages de validation, tout est dérivé. Sur le papier c'est exactement la brique 2.

**Verdict : ne pas l'ajouter comme dépendance — on possède déjà son équivalent.** Le renderer de champs du **ComponentBuilder** *est* un « schéma → formulaire » : il rend déjà des champs typés (`text`, `number`, `list`, `checkbox`, `page-list`, `file-list`, `icon`, `divider`), gère `showif`, collecte des valeurs. Autoform le referait, mais :

- son mapping type→widget est **fixe et primitif** ; il ignore tes types riches (`page-list`, `file-list`, `icon`) qui viennent de ton univers ;
- il impose **son** style, à réaligner sur ton design system ;
- il ne connaît pas ton moteur `showif`.

`@autoform/react` **confirme le pattern** (schéma → UI de formulaire), il n'apporte pas de raccourci ici : tu as déjà payé ce coût pour le ComponentBuilder. **On réutilise le renderer interne** (voir juste après), ce qui est aussi la raison même pour laquelle on n'a besoin d'aucune lib de rendu de formulaire.

## L'insight structurant : un renderer de champs partagé

Le ComponentBuilder (modale → props MDX) et la saisie d'une fiche (panneau → valeurs JSON) sont **le même problème** : rendre un jeu de champs typés depuis un descripteur, collecter des valeurs, valider, gérer `showif`. Seules diffèrent :

- **l'enveloppe** : modale d'insertion vs. page/panneau d'édition de fiche ;
- **la sérialisation** : règle d'omission → MDX (ComponentBuilder) vs. objet JSON nu (fiche).

Le **cœur** — les widgets de champ + le moteur `showif` + les règles de validation — est commun. On l'extrait en un module profond réutilisable :

```
FieldRenderer(descriptor, values, onChange)   ← widgets + showif + validation
   ├── ComponentBuilder : descriptor YAML (repo)      → sérialise en MDX
   └── Formulaire        : descriptor JSON (base)      → sérialise en JSON (data de la fiche)
```

Conséquences :

- **Le vocabulaire de champs est partagé et étendu, pas forké.** Les champs de formulaire sont un **sur-ensemble** de ceux des composants : on ajoute `email`, `textarea`, `date`, `radio` (choix unique), `multi` (choix multiple), éventuellement `file` (pièce jointe de fiche). Chaque nouveau widget profite aux deux consommateurs.
- C'est la vraie raison pour laquelle **autoform est redondant** : sa valeur (dériver une UI d'un schéma) est déjà chez toi, en mieux adapté.

## ComponentBuilder & Zod : où Zod aiderait, et quand refactorer

Zod ne sert pas qu'aux formulaires : il comble aussi un trou côté ComponentBuilder. Mais son apport est ciblé — le moteur (`lib/component-descriptor.ts` + `lib/component-descriptors.ts`) a **trois couches de validation**, Zod n'en concerne qu'une :

| Couche | Aujourd'hui | Zod aide ? |
| --- | --- | --- |
| **Forme brute du YAML** (bord du loader) | `yaml.parse` → **cast** en `ComponentDescriptor`, avec un simple spot-check (`component-descriptors.ts` : `label` string + `properties` présent) | **Oui — vrai trou comblé** |
| **Règles sémantiques croisées** (`validateDescriptor`) | `throw` impératifs, avec **ligne YAML exacte** | Marginal / latéral |
| **Signature ↔ `.tsx`** (`verify-descriptors`, ts-morph) | analyse statique de la source (ADR 0013) | **Non — orthogonal** |

**Le vrai gain (couche 1).** Aujourd'hui rien ne garantit au runtime que `showif` est un record, que `options` est un `Record<string,string>`, que `advanced`/`required` sont des booléens, que `value` a un type de base valide : le YAML est *cast* vers l'interface `ComponentDescriptor` (de la confiance, pas une vérification), et `validateDescriptor` itère `descriptor.properties` en **supposant** cette forme. Un `z.object(...)` au bord du loader :

- garantit la forme **avant** que la moindre règle sémantique ne tourne ;
- devient la **source unique** du type (`type ComponentDescriptor = z.infer<…>` remplace l'interface maintenue à la main) ;
- expose `error.issues[].path` (ex. `["properties","color","type"]`) qui branche **directement** sur le `lineOf(path)` existant (`lib/descriptor-source.ts`) — les messages ligne-précis restent donc préservables.

**Ce que Zod ne remplace pas.** La signature ts-morph (analyse du `.tsx`) reste — hors de portée de Zod. Et réécrire les règles croisées (`default ∈ options`, cible `showif` existante, regex valide) en `.superRefine()` est **possible mais latéral** : on troquerait des `throw` clairs et lisibles contre des refinements, en devant reconstruire la même qualité de message. Peu de valeur en soi.

**Verdict : refacto justifié, mais porté par le chantier Formulaires — pas isolément.** En standalone, ce n'est qu'un nettoyage de la couche 1. Mais dès que le `FieldRenderer` devient partagé (section précédente), **les deux sortes de descripteurs — composant *écrit dans le repo*, formulaire *écrit à l'exécution* — gagnent à être validées par le même mécanisme Zod** : méta-schéma commun, un seul vocabulaire de forme. À faire **à ce moment-là**, comme partie de l'unification, pas comme un refacto préalable gratuit.

## Modèle de données

### Un formulaire n'est pas une page

Une page est un **contenu rendu à un humain** (MDX, titre = premier `#`). Un formulaire n'a rien à lire : c'est une **définition** consommée par la machinerie (générer la saisie, valider, produire des vues liste). Cycle de vie différent (écrit rarement, par des éditeurs), forme différente (liste de champs, pas de la prose). → **entité `Form` de plein droit**, stockée en base parce qu'écrite à l'exécution (à la différence des descripteurs de composants, fichiers du repo).

### Une fiche est une page

Une fiche est naturellement une unité **adressable, versionnée, taguée, possédée** — soit la définition exacte d'une Page, moins « le contenu est du MDX ». On réutilise donc **toute** la machinerie Page/Révision plutôt que de la redupliquer :

- **slug + URL** `/{slug}`, handlers `/{slug}/edit`, `/{slug}/revisions` — gratuits ;
- **révisions + pointeur courant + restauration** (ADR 0003) — gratuits : l'édition d'une fiche crée une Révision, l'historique et « Restaurer » marchent tels quels ;
- **tags, propriétaire, suppression, liens wiki** — gratuits.

L'alternative (entité `Fiche` séparée) rejouerait tout cela en double — deux arbres de routing, deux vues d'historique, deux flux de suppression. À écarter.

Le prix : la Page devient une **union discriminée par `formId`**. `formId = null` → page MDX (comportement actuel, inchangé). `formId ≠ null` → fiche (contenu, édition et rendu pilotés par le formulaire). La couche **identité/versioning est partagée** ; seule la couche **contenu/édition/rendu branche** sur `formId`. C'est une polymorphie propre et *moins* de code qu'une entité parallèle.

### Esquisse Prisma

```prisma
model Form {
  id        String   @id @default(uuid(7)) @db.Uuid
  slug      String   @unique          // identité + URL de la vue liste / "nouvelle fiche"
  title     String
  schema    Json                      // le descripteur de champs (écrit via le builder)
  template  String?                   // gabarit MDX de la vue "show" d'une fiche
  createdAt DateTime @default(now())
  ownerName String?
  fiches    Page[]                    // ses fiches (Page.formId)
}

model Page {
  // … champs existants (slug, tags, ownerName, currentRevisionId, …) …
  formId String? @db.Uuid            // null = page MDX ; renseigné = fiche de ce Form
  form   Form?   @relation(fields: [formId], references: [id], onDelete: Restrict)
}

model Revision {
  // … champs existants (authorName, createdAt, restoredFromId, …) …
  content String?                    // snapshot MDX — pages MDX (devient nullable)
  data    Json?                      // snapshot des valeurs de champs — fiches
  // invariant : selon la nature de la page, exactement l'un de (content, data) est renseigné
}
```

Le choix **colonne `Json` (jsonb)** pour les valeurs est acté : les champs sont dynamiques, l'EAV serait lourd, et jsonb reste requêtable pour les futures vues liste/filtre. Le `data` vit sur la **Révision** (pas la Page) : éditer une fiche *est* un changement de contenu → historisé, en snapshot complet, exactement comme le MDX (ADR 0003).

### Rendu, édition, titre, slug d'une fiche

- **Rendu (`show`)** : on rend le `template` MDX du formulaire, valeurs de `data` injectées (`{{champ}}` → valeur), **à travers le pipeline MDX existant** (sandbox ADR 0002, composants autorisés). Un gabarit de fiche peut donc contenir des composants. Réutilisation maximale : la fiche n'a pas son propre moteur de rendu, c'est le pipeline de pages.
- **Titre de la fiche** : la règle « titre = premier `#` » est **préservée au niveau du gabarit rendu** — un `template` qui commence par `# {{nom}}` fait émerger le titre exactement comme une page. Pas de champ titre spécial.
- **Slug de la fiche** : dérivé à la première sauvegarde d'un champ-titre désigné (slugification + désambiguïsation), à la YesWiki. À arbitrer (voir questions ouvertes).
- **Édition (`edit`)** : pour une fiche, le handler `edit` n'ouvre **pas** CodeMirror mais le **formulaire généré** (brique 2 = renderer de champs partagé), pré-rempli depuis `data` ; soumission → validation par le schéma Zod du formulaire → nouvelle Révision avec le nouveau `data`. Historique et restauration inchangés (snapshots de `data`).
- **Vues liste/carte/carto** (le Bazar au sens strict) : requête des Pages `where formId = X`, rendu de `data`. Hors périmètre immédiat mais le modèle les porte (jsonb requêtable, filtrage par champ ou par tag).

## Bibliothèques à installer

| Besoin | Choix | Note |
| --- | --- | --- |
| État & validation de la saisie de fiche | `react-hook-form` + `@hookform/resolvers` + `zod` | Ce que shadcn `<Form>` présuppose déjà |
| Drag-and-drop du builder | **dnd-kit** (défaut) ou **Pragmatic drag-and-drop** (Atlassian) | Compatibles React 19 ; réordonner/ajouter des champs |
| Rendu du formulaire | *(aucune)* | Renderer de champs partagé avec le ComponentBuilder |
| Rendu de fiche | *(aucune)* | Pipeline MDX existant + gabarit du formulaire |

Bibliothèques **écartées** : `formBuilder` (jQuery), `react-form-builder2` (portage jQuery, class components/Bootstrap, non maintenu), **SurveyJS** (le plus mûr mais Creator sous licence commerciale, thème maison, gros bundle, ne parle pas Tailwind), **Form.io** (enterprise, backend propre), **@autoform/react** (redondant avec le renderer interne — cf. plus haut).

## Points à arbitrer avant l'ADR

- **Migration de schéma d'un formulaire** après existence de fiches (renommer/supprimer/retyper un champ). Le modèle **dégrade gracieusement** — `data` est un snapshot par révision, clés en trop ignorées, clés manquantes → vide, dans l'esprit « props inconnues préservées » de l'ADR 0013 — mais un versionnage/migration explicite est à décider (backlog probable).
- **Révisions du formulaire lui-même** : `Form.schema` historisé ou non ? Proposé : non au départ (config, à la manière des tags non historisés) ; backlog.
- **Dérivation du slug de fiche** : champ-titre désigné vs. motif déclaré par le formulaire vs. saisie libre.
- **Suppression d'un formulaire** encore référencé par des fiches (`onDelete: Restrict` proposé).
- **Périmètre v1** : saisie + rendu d'une fiche (gabarit) d'abord ; vues liste/filtre/carto ensuite.

## Prochaines étapes suggérées

1. Une **ADR « Formulaires & fiches »** figeant : formulaire ≠ page / fiche = page, `data` JSON sur la Révision, Zod comme contrat runtime, renderer de champs partagé.
2. Une **ADR ou une section** sur l'extraction du `FieldRenderer` commun au ComponentBuilder et aux formulaires (vocabulaire de champs sur-ensemble).
3. Mise à jour de `CONTEXT.md` (glossaire) : **Formulaire**, **Fiche**, **Gabarit de fiche**.
