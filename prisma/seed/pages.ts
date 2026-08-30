// Example MDX pages seeded alongside the special pages (docs/entries-view.md):
// the WikiOui counterpart of YesWiki's default install content (see
// docs/reference/yeswiki-seed/), minus every admin/config system page (no auth, no
// theme editor, no config file, no user management — none of it exists yet).
// Regular pages, not "special" ones: created once, then left alone like any
// other page a user might edit.

const annuaireNav = `<Menu>
- [Trombinoscope](trombi-annuaire)
- [Annuaire alphabétique](annuaire-alpha)
- [Annuaire cartographique](carto-annuaire)
- [S'inscrire dans l'annuaire](saisir-annuaire)
</Menu>`;

const agendaNav = `<Menu>
- [Voir les prochaines activités](vue-activite)
- [Voir l'agenda](vue-agenda)
- [Proposer une activité](saisir-agenda)
</Menu>`;

const ressourceNav = `<Menu>
- [Les ressources](facette-ressource)
- [Déposer une ressource](saisir-ressource)
</Menu>`;

const blogNav = `<Menu>
- [Le blog](voir-blog)
- [Le blog (liste simple)](voir-blog-simple)
- [Déposer une actu](saisir-blog)
</Menu>`;

const associationsNav = `<Menu>
- [Annuaire des associations](annuaire-associations)
- [Référencer une association](saisir-association)
</Menu>`;

export const pageSeeds: Record<string, string> = {
  "exemple-formulaire": `# Exemples de formulaires à adapter (ou à jeter)

Les formulaires proposés dans le menu du haut sont souvent demandés par les collectifs. Ils sont fournis pour inspiration et **sont bien sûr adaptables (ou supprimables)** depuis la page [formulaires](formulaires).

Vous trouverez un formulaire permettant :

- de gérer un [annuaire](trombi-annuaire) (des membres du collectif par exemple)
- un [agenda](vue-activite) pour présenter les activités **à venir**, ou une vue globale en [calendrier](vue-agenda)
- une [ressourcerie](facette-ressource) pour collecter, filtrer et partager des ressources
- un [blog](voir-blog) permettant d'afficher l'actualité du collectif
- un [annuaire des associations](annuaire-associations) partenaires, filtrable par catégorie et par public visé

Chacun est accompagné de fiches d'exemple et de plusieurs pages illustrant différentes vues possibles (grille, carte, calendrier, annuaire…) grâce au composant \`<EntriesView>\`.
`,

  "bac-a-sable": `# Bac à sable

## Premiers défis à réaliser

1) premier défi => **écrire dans cette page**
  - double-cliquez n'importe où dans le texte (ou cliquez sur «\u00A0Modifier\u00A0» en bas de page)
  - l'aspect de la page change : vous êtes en __mode édition__
  - écrivez ce que vous voulez ici =>
  - puis cliquez sur «\u00A0Enregistrer\u00A0» et observez votre travail

2) deuxième défi => **insérer un bouton**
  - repassez en mode édition
  - positionnez votre curseur ici
  - dans la barre d'outils, cliquez sur __Composants__ (l'icône puzzle), puis choisissez «\u00A0Bouton\u00A0»
  - remplissez les paramètres proposés et validez
  - enregistrez

3) troisième défi => **modifier votre bouton**
  - repassez en mode édition
  - cliquez sur la ligne du bouton : un petit __crayon__ apparaît dans la marge
  - cliquez sur ce crayon pour rouvrir ses paramètres et changez-en un
  - enregistrez
   - cette démarche fonctionne pour tous les composants insérés (menus, fiches, cartes…)

4) quatrième défi => **restaurer une version précédente de cette page** (en cas de préférence ou d'erreur)
  - cliquez sur «\u00A0Historique\u00A0» en bas de page
  - choisissez une révision précédente dans la frise
  - cliquez sur «\u00A0Restaurer cette révision\u00A0»

5) cinquième défi => **insérer une image**
  - en édition, placez-vous tout en bas de cette page
  - cliquez sur l'icône __Uploader un fichier__ de la barre d'outils
  - choisissez une image (jpg, png, gif ou webp) sur votre ordinateur
  - jouez avec les paramètres du composant inséré (largeur, légende…)
  - enregistrez

6) sixième défi => **trouver l'adresse d'une page**
  - regardez l'adresse de cette page dans votre navigateur : c'est le dernier morceau, après le dernier /
  - cherchez maintenant l'adresse de la page d'accueil
  - transformez un texte de cette page en lien cliquable vers elle : \`[retour à l'accueil](nom-de-la-page)\`

Une aide complète sur la syntaxe est à un clic : l'icône __?__ de la barre d'outils, ou la page [aide-mémoire](aide-memoire).
`,

  "trombi-annuaire": `${annuaireNav}

<EntriesView form="annuaire" view="grid" visualField="photo" subtitleField="fonction" columnCount={3} />
`,

  "annuaire-alpha": `${annuaireNav}

<EntriesView form="annuaire" view="directory" />
`,

  "carto-annuaire": `${annuaireNav}

<EntriesView form="annuaire" view="map" height="600px" />
`,

  "saisir-annuaire": `${annuaireNav}

<EntryForm id="annuaire" />
`,

  "vue-activite": `${agendaNav}

<EntriesView form="agenda" view="agenda" startDateField="date-debut" endDateField="date-fin" period="future" />
`,

  "vue-agenda": `${agendaNav}

<EntriesView form="agenda" view="calendar" startDateField="date-debut" endDateField="date-fin" />
`,

  "saisir-agenda": `${agendaNav}

<EntryForm id="agenda" />
`,

  "facette-ressource": `${ressourceNav}

<EntriesView form="ressources" view="list" subtitleField="description" search filters={[{ field: "type", title: "Tri par type" }]} />
`,

  "saisir-ressource": `${ressourceNav}

<EntryForm id="ressources" />
`,

  "voir-blog": `${blogNav}

<EntriesView form="blog" view="grid" visualField="photo" textField="chapeau" columnCount={2} layout="horizontal" />
`,

  "voir-blog-simple": `${blogNav}

<EntriesView form="blog" view="list" expandable={false} openOnClick />
`,

  "saisir-blog": `${blogNav}

<EntryForm id="blog" />
`,

  "annuaire-associations": `${associationsNav}

<EntriesView form="associations" view="grid" visualField="logo" subtitleField="categorie" columnCount={3} colorField="categorie" search filters={[{ field: "categorie", title: "Catégorie" }, { field: "publics", title: "Publics visés" }, { field: "secteurs", title: "Secteur" }]} />
`,

  "saisir-association": `${associationsNav}

<EntryForm id="associations" />
`,
};

// Overrides the placeholder topMenu content shipped in seed.ts's own
// defaultContent — only takes effect on a fresh install (same idempotent
// skip-if-exists rule), so it lands together with the pages above.
export const topMenuContent = `<Menu>
- [Bac à sable](bac-a-sable)
- [Exemples de formulaires](exemple-formulaire)
- Menu exemple
  - [Exemple annuaire](trombi-annuaire)
  - [Exemple agenda](vue-activite)
  - [Exemple ressourcerie](facette-ressource)
  - [Exemple blog](voir-blog)
  - [Exemple associations](annuaire-associations)
</Menu>

{/* Vous êtes dans la page qui sert à modifier le menu du haut. Pour faire évoluer le menu, inspirez-vous du menu exemple. */}
`;
