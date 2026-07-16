# Menu piloté par liste imbriquée MDX, pas d'auto-listing

Le composant intégré `<Menu>` rend la **liste imbriquée écrite entre ses balises** en menu de navigation multi-niveaux. Sans contenu, il ne rend rien. L'auto-listing initial (toutes les pages de la base, triées par slug) est supprimé.

## Contexte

La première version de `<Menu>` listait automatiquement toutes les pages : zéro configuration, mais aucun contrôle — pas d'ordre choisi, pas de hiérarchie, pas d'items externes, et un menu qui gonfle tout seul à chaque page créée. Le besoin réel (menu principal organisé, roue crantée de configuration dans `page-rapide-haut`) exige des menus **à plusieurs niveaux entièrement choisis par l'auteur**.

Alternatives considérées :

- **(a) Auto-listing + filtres** (tags, préfixes de slug) : garde la magie mais l'ordre et la hiérarchie restent hors de portée de l'auteur ; la configuration fuit vers les tags.
- **(b) Props structurées** (`items={...}` ou YAML) : expressif mais illisible et fragile pour un auteur wiki. *(Amendé le 2026-07-16 : cette option invoquait aussi la neutralisation des expressions JS par le sandbox ; ADR 0002 admet désormais les littéraux statiques, donc un `items={[…]}` passerait. La décision tient sur son seul motif de lisibilité.)*
- **(c) Enfants markdown** : une liste imbriquée est la représentation naturelle d'un menu pour un auteur, sans aucune syntaxe nouvelle ; MDX parse nativement le markdown à l'intérieur d'une balise JSX, vérifié avec le pipeline du projet.

## Décision

Option (c). Le contenu de `<Menu>` est une liste à puces imbriquée :

```mdx
<Menu>
- [Accueil](page-principale)
- Projets
  - [Projet A](projet-a)
- <Button icon="roue" text="Configuration" />
  - [Titre du site](page-titre)
</Menu>
```

- **Item texte** : simple déclencheur de déroulant (clic pour ouvrir).
- **Item lien** : navigue au clic ; s'il a des enfants, son déroulant s'ouvre au survol/focus.
- **Item `<Button>`** : le bouton devient le déclencheur du déroulant (cas de la roue crantée).
- **Rendu** : niveau 1 en barre horizontale, niveau 2 en déroulant ; l'imbrication au-delà est **aplatie** (indentée dans le même déroulant, pas de sous-menus latéraux).
- **Sans enfants** : rien n'est rendu — pas de repli automatique.

Le composant `<Button>` (props `icon`/`text`/`link` ; les valeurs d'icônes restent des noms français d'une liste blanche mappée sur lucide) est avancé du backlog au MVP pour servir de déclencheur ; son UI d'authoring (modales YAML, sélecteur Iconify) reste au backlog.

## Conséquences

- Les menus sont du contenu ordinaire : versionnés, éditables, restructurables sans code (les futures sections de configuration — Tableau de bord, Documentation, Gestion du site, Formulaire — s'ajouteront par édition de `page-rapide-haut`).
- Le seed doit fournir des menus initiaux utiles (`page-menu-haut`, `page-rapide-haut`) : un wiki vierge n'a plus de menu « gratuit ».
- Une nouvelle page n'apparaît plus automatiquement dans le menu : l'inscrire est un geste éditorial délibéré.
- `<Menu>` ne dépend plus de la base de données.
