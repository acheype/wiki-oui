# La configuration vit dans les props, le contenu dans les enfants

Un composant décrit sa **configuration** dans ses **props** (les clés du bloc `properties` de son descripteur) et n'accueille du **contenu** — du MDX écrit par l'auteur — qu'entre ses balises, dans ses **enfants**. Un composant est un **wrapper** quand, et seulement quand, ses enfants sont du contenu ; jamais pour loger de la config. Le ComponentBuilder édite la **structure** d'un wrapper et **préserve le contenu** de chaque enfant à la réédition.

## Contexte

Le round-trip du ComponentBuilder (ADR 0013) régénère une balise **feuille** à partir de ses props : `<Button … />`. Il ne savait pas ré-émettre des enfants, donc l'édition des composants **wrapper** était au backlog. Deux faits cadraient déjà le sujet :

- `<Menu>` (ADR 0010) rend la liste imbriquée **écrite entre ses balises** : son contenu est du MDX que l'auteur écrit dans l'éditeur, jamais de la config.
- `<EntriesView>` (ADR 0019) a une config composite (filtres, colonnes, tris). Le choix a été de l'écrire en **props littérales** et de **rejeter les balises enfants**, parce que ces sous-objets sont de la config, pas du contenu.

`<Tabs>` (Onglets) tranche le cas neuf : chaque onglet porte du **contenu MDX arbitraire**. Impossible de le loger dans une prop littérale ; il faut de vrais enfants, donc un wrapper que le builder sait éditer.

## Décision

- **Règle.** La config d'un composant vit dans ses **props** ; son **contenu** vit dans ses **enfants**. Le type des enfants tranche : contenu → wrapper ; config → props littérales (ADR 0019), jamais des enfants.
- **Deux modes de descripteur.** Le contenu d'un wrapper est préservé à la réédition dans tous les cas. Un wrapper à **contenu libre** déclare la clé racine `initialContent:`, qui fournit le MDX de la première insertion. Pour que le builder **crée et gère une liste de balises filles**, le wrapper déclare à la place une section **`children:`** à côté de `properties`. L'`initialContent` racine et `children:` sont exclusifs ; `children.initialContent` fournit le MDX initial de chaque nouvel enfant. Ces contenus et valeurs initiaux ne remplacent jamais ce qui existe à la réédition.
- **Contrat d'un enfant géré.** `children.component` désigne une balise du registre ; `children.properties` reprend le même schéma de champs que les propriétés du parent, notamment `prop`, `prefill`, `default` et `initialValue`, et sa signature est vérifiée contre le composant enfant. `anchorField` désigne, parmi ces champs, celui qui porte l'identité et l'ancre de chaque enfant : il doit être une chaîne requise, toujours visible, avec un `initialValue` non vide. Lui seul est automatiquement numéroté à la création (`Titre … 1`, `Titre … 2`) et contrôlé comme unique après slugification ; les autres champs qui portent un `initialValue` sont seulement préremplis. Il n'existe donc aucune convention implicite sur un champ nommé `title` : `<Tabs>` et `<Accordion>` choisissent explicitement `anchorField: title`.
- **Builder.** Le ComponentBuilder édite la **structure** du wrapper : ajouter, réordonner, supprimer les enfants et régler leurs props. Il crée deux enfants à la première insertion et applique `children.initialContent` à chacun ; un ajout ultérieur reçoit les mêmes préremplissages. Le crayon d'un enfant direct ouvre ce builder contextuel, même lorsque l'enfant possède aussi un builder autonome ; un composant imbriqué dans son contenu garde le sien. Le round-trip **préserve le contenu** de chaque enfant et tout contenu direct placé hors des balises filles attendues, même lorsqu'un wrapper choisit de l'ignorer au rendu et que le lint le signale à l'enregistrement. Ces fragments interstitiels gardent leur position dans la séquence quand les enfants sont réordonnés, et retirer un enfant ne retire jamais ce qui l'entourait. Supprimer un enfant non vide déclenche un avertissement.
- **Sélection initiale explicite** (2026-10-02). Un wrapper qui propose un enfant ouvert au chargement déclare `children.selection: { prop: default, initial: first }` (ou `none`). `prop` appartient au **parent** ; `children.properties` décrit toujours les enfants. Sans `selection`, la liste reste éditable sans sélecteur initial. Cette déclaration remplace `initialSelection` et le nom réservé `default` du moteur : le builder lisait et écrivait cette propriété implicitement, tandis que le lint de page la déclarait inconnue. La génération et les validations partagent désormais les propriétés dérivées du descripteur, et la signature du parent doit accepter la propriété de sélection comme chaîne omissible. Le MDX existant de Tabs et Accordion reste inchangé. Un système général de champs à options dynamiques est écarté : le besoin est de suivre l’identité d’un enfant sélectionné pendant les renommages, déplacements et suppressions.
- **Wrappers éditables.** `<Collapsible>` emploie le mode à contenu libre. `<Tabs>` gère des `<Tab>` et `<Accordion>` des `<Collapsible>` avec `children:`. Leur spécification détaillée est dans [`../component-builder.md`](../component-builder.md).

## Conséquences

- `docs/component-builder.md` décrit les deux modes de wrapper et toutes les clés de `children:` ; il ne repose plus sur l'ancien drapeau `isWrapper`.
- **ADR 0019 mis à jour** : le rejet des balises enfants pour `<EntriesView>` se fonde désormais sur cette règle — les filtres sont de la config —, non sur l'indisponibilité de l'édition des wrappers. Une seule version des faits.
- **`docs/architecture.md` mis à jour** : `<Menu>` n'« attend » plus la capacité ; elle est décidée, et Menu pourra l'adopter via un descripteur `children:`.
- La vérification par signature (ADR 0013) s'applique au composant enfant comme à tout composant à props.
- Le round-trip reste sûr : props inconnues et contenu des enfants préservés à la régénération.
- `initialContent:` appartient au contrat du ComponentBuilder, pas aux props React : la vérification de signature l'ignore.
