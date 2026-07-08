# Rendu du contenu : MDX bridé (sandbox) avec registre de composants

Le contenu des pages est stocké et rendu au format MDX, mais **bridé** : imports/exports interdits, expressions JS neutralisées (à terme), et seuls les composants d'une liste blanche sont rendus. On vise ce sandbox (« Option 3 »), atteint en deux temps.

## Contexte

Le contenu est éditable en ligne dans un textarea, sans auth au MVP : n'importe qui peut éditer n'importe quelle page. Or MDX compile en JavaScript exécuté (`import`, `export`, expressions `{…}`) → exécution de code arbitraire (RCE) si on le laisse libre. Whitelister les composants ne suffit pas : ça contrôle *quels composants* s'affichent, pas *l'exécution de JS*.

## Décision

Pipeline MDX (`next-mdx-remote` + remark-gfm + mdx-annotations) avec :

- **Registre de composants = répertoire `/components` + fichier de configuration.** Toute balise hors registre n'est pas rendue.
- **`import` / `export` désactivés d'office**, dès le MVP (gratuit, gros gain de sûreté).
- **Neutralisation des expressions JS `{…}`** ajoutée pour les contributeurs non-admins **au moment où l'authentification et les droits arrivent** (post-MVP). Attention : `mdx-annotations` repose sur les expressions (`{{ id: 'x' }}` est un objet JS fusionné en props) — la neutralisation devra s'appliquer **après** le passage du plugin, qui consomme les annotations ; elle ne peut pas bloquer les expressions en amont du pipeline.

Le format stocké et le registre ne changent jamais ; seul le niveau de bridage se resserre quand les rôles apparaissent.

## Conséquences

- Fidèle à la spec « format MDX » sans exposer une RCE.
- Le sandbox complet (neutralisation des expressions) est de la plomberie sécurité sensible ; on l'assume comme tâche de durcissement liée au chantier auth/droits, pas au MVP.
- Un wiki ouvert reste sûr même avec des contributeurs à faibles privilèges (le sandbox n'est pas jetable une fois l'auth en place).
