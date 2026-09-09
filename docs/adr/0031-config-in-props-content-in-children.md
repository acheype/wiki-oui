# La configuration vit dans les props, le contenu dans les enfants

Un composant décrit sa **configuration** dans ses **props** (les clés du bloc `properties` de son descripteur) et n'accueille du **contenu** — du MDX écrit par l'auteur — qu'entre ses balises, dans ses **enfants**. Un composant est un **wrapper** quand, et seulement quand, ses enfants sont du contenu ; jamais pour loger de la config. Le ComponentBuilder édite la **structure** d'un wrapper et **préserve le contenu** de chaque enfant à la réédition.

## Contexte

Le round-trip du ComponentBuilder (ADR 0013) régénère une balise **feuille** à partir de ses props : `<Button … />`. Il ne savait pas ré-émettre des enfants, donc l'édition des composants **wrapper** était au backlog. Deux faits cadraient déjà le sujet :

- `<Menu>` (ADR 0010) rend la liste imbriquée **écrite entre ses balises** : son contenu est du MDX que l'auteur écrit dans l'éditeur, jamais de la config.
- `<EntriesView>` (ADR 0019) a une config composite (filtres, colonnes, tris). Le choix a été de l'écrire en **props littérales** et de **rejeter les balises enfants**, parce que ces sous-objets sont de la config, pas du contenu.

`<Tabs>` (Onglets) tranche le cas neuf : chaque onglet porte du **contenu MDX arbitraire**. Impossible de le loger dans une prop littérale ; il faut de vrais enfants, donc un wrapper que le builder sait éditer.

## Décision

- **Règle.** La config d'un composant vit dans ses **props** ; son **contenu** vit dans ses **enfants**. Le type des enfants tranche : contenu → wrapper ; config → props littérales (ADR 0019), jamais des enfants.
- **Descripteur.** Le contenu d'un wrapper est préservé à la réédition dans tous les cas. Pour que le builder **crée et gère une liste de balises filles**, le wrapper déclare une section **`children:`** (facultative) à côté de `properties` : le composant enfant (`component: Tab`), son libellé, et le bloc `properties` de **ses** props répétables. L'enfant n'a **pas** de descripteur propre — il ne s'insère pas seul (voir *Registre de composants*) ; ses props sont décrites là. Sans `children:`, le contenu est composé librement par l'auteur (modèle `<Menu>`).
- **Builder.** Le ComponentBuilder édite la **structure** du wrapper : ajouter, réordonner, supprimer les enfants et régler leurs props. Il **préserve le contenu** de chaque enfant à la réédition ; ce contenu s'écrit dans l'éditeur, entre les balises, comme pour `<Menu>`. Supprimer un enfant non vide déclenche un avertissement.
- **Premier wrapper éditable : `<Tabs>`/`<Tab>`.** Sa spécification est dans [`../component-builder.md`](../component-builder.md).

## Conséquences

- `docs/component-builder.md` : la ligne `isWrapper` n'est plus « au backlog » ; elle décrit la section `children:`.
- **ADR 0019 mis à jour** : le rejet des balises enfants pour `<EntriesView>` se fonde désormais sur cette règle — les filtres sont de la config —, non sur l'indisponibilité de l'édition des wrappers. Une seule version des faits.
- **`docs/architecture.md` mis à jour** : `<Menu>` n'« attend » plus la capacité ; elle est décidée, et Menu pourra l'adopter via un descripteur `children:`.
- La vérification par signature (ADR 0013) s'applique au composant enfant comme à tout composant à props.
- Le round-trip reste sûr : props inconnues et contenu des enfants préservés à la régénération.
