# WikiOui

WikiOui est un moteur de wiki : il permet de créer facilement des sites collaboratifs dont chaque page est écrite en MDX et éditable en ligne. Refonte de YesWiki sur une stack moderne (Next.js, Prisma, PostgreSQL, shadcn/ui).

## Language

**Page**:
L'unité de contenu du wiki, identifiée par un slug unique. Son contenu est écrit en MDX — sauf pour une **fiche** (v0.3), dont le contenu est un snapshot de valeurs de champs. Une page a un historique de révisions. Elle n'a **pas de champ titre distinct** : son titre visible est le premier titre `#` de son contenu (pour une fiche : son champ titre). La ligne `Page` n'est créée qu'à la **première sauvegarde** (visiter une page inexistante n'écrit rien).
_Avoid_: Article, document, nœud

**Slug**:
L'identifiant textuel d'une page, et sa seule identité : il est tapé directement dans l'URL (pas généré depuis un titre). Format `^[a-z0-9]+(?:-[a-z0-9]+)*$` (minuscules, chiffres, tirets ; pas de CamelCase à la YesWiki). C'est le niveau 1 de l'URL : `https://site/{slug}`. Les majuscules sont normalisées par redirection (`/Ma-Page` → `/ma-page`) ; un slug hors motif renvoie *not found*. En UI, il est présenté comme l'**adresse** de la page. **Renommable** a posteriori (« Changer l'adresse », action d'administrateur, confirmation chiffrée) : toutes les références internes sont réécrites, historique compris ; il n'y a **pas de redirection** — l'ancienne adresse cesse d'exister (favoris et liens externes cassent, accepté).
_Avoid_: Id, nom de page, permalink ; slug immuable (obsolète depuis « Changer l'adresse »)

**Handler de page**:
Une **vue** d'une page, rendue à une URL de niveau 2 : `https://site/{slug}/{handler}` (ex. `edit`, `revisions`). Un handler de page *affiche* quelque chose à un humain. Implémenté comme un segment de route Next natif dans le groupe de routes du chrome : `app/(site)/[slug]/{handler}/page.tsx`. Le handler par défaut est `show`, servi par `app/(site)/[slug]/page.tsx` ; `/{slug}` est un raccourci de `/{slug}/show`.
_Avoid_: Route, action, contrôleur ; « Route Handler » (jargon Next : désigne un Service d'API, pas un handler de page)

**Mutation**:
Une action qui modifie la base et ne rend **aucune vue** : sauvegarder, supprimer, restaurer, renommer (« Changer l'adresse »). Implémentée comme une **Server Action** (pas d'URL, POST implicite). Tout ce qui est dans la barre d'actions n'est donc pas un handler : `Éditer`/`Historique` sont des handlers de page (vues), `Supprimer`/`Restaurer` sont des mutations. Exceptionnellement, une mutation est **portée par un Service d'API** quand la Server Action ne sait pas transporter l'exigence UX (l'upload et sa progression, ADR 0012). Depuis la v0.3, une Server Action peut aussi porter une **lecture** pour un composant client (pages système d'administration des formulaires, ADR 0014) — c'est le même transport, mais ce n'est pas une Mutation.
_Avoid_: Handler (pour une mutation), endpoint

**Service d'API**:
Un endpoint HTTP **programmatique** : consommé par du code (la modale d'aperçu, la balise `<img>` qui charge un fichier), jamais visité comme une page par un humain. Regroupé sous le segment réservé `/api`, implémenté en Route Handler Next (`route.ts`) : `GET /api/files/{nom}` (servir un fichier), `POST /api/files` (upload — mutation portée par un service). Cas particulier : un service dont la réponse est une page HTML complète est porté par une `page.tsx` **nue** (hors du groupe `(site)`, donc sans chrome) — `GET /api/render?source=…` (l'aperçu du ComponentBuilder, rendu par le vrai pipeline de pages) et l'installation initiale (`/api/installation`, atteinte par réécriture du proxy tant que le wiki n'est pas installé, ADR 0027/0028). Le triptyque complet : handler de page = vue pour un humain · mutation = écriture · service d'API = service pour du code.
_Avoid_: handler (pour un service) ; réserver un segment d'URL de niveau 1 par service (un seul segment réservé : `api`)

**Module**:
Un dossier `modules/<concept>/` qui regroupe tout le code d'un concept du domaine, un par nom de `CONTEXT.md` — `app/` ne garde que les routes (ADR 0029). Son **interface** est ce que montre `ls modules/<concept>/` : un fichier à sa racine s'importe depuis n'importe quel autre module, un fichier de sous-dossier ne s'importe que depuis l'intérieur du sien — sauf `ui/`, que `app/` seul peut composer depuis l'extérieur. La profondeur porte donc la visibilité, gardée par une règle ESLint plutôt que par convention. Le gabarit accueille aussi `wiki-components/`, quand le module possède un composant wiki (voir Registre de composants) — privé comme tout sous-dossier, sauf pour la table du registre (`modules/authoring/registry/sources.ts`), seul lecteur qui le franchit depuis l'extérieur.
_Avoid_: Package, couche, dossier (trop générique — un module a une interface, un dossier quelconque n'en a pas)

**Porte**:
Le fichier `queries.ts` d'un module, seul point de contact avec Prisma pour les tables qu'il possède (ADR 0025, généralisé à chaque module par l'ADR 0029). Niché dans son propre sous-dossier (`queries/queries.ts`) pour que sa fermeture aux autres modules découle de la profondeur, comme tout le reste, sans cas particulier nommé. Un fichier du même module l'appelle pour lire ou écrire ; aucun fichier d'un autre module ne l'importe — c'est le sens de « une seule porte » vers `Page` et `Form`. Une porte reste exceptionnellement **publique**, à la racine du module, quand plusieurs autres modules ont besoin d'un accès direct plutôt que de passer par ses règles (ex. `groups-queries.ts` du module `permissions`) : un choix à part, pas le patron par défaut.
_Avoid_: Repository, DAO, couche d'accès (le nom de l'ADR 0025, pas celui du fichier), queries.ts (nom de code, à réserver au code)

**Révision**:
Un instantané complet du contenu d'une page à un instant donné, avec son auteur et sa date — le MDX (`content`) pour une page ordinaire, le snapshot JSON des valeurs de champs (`data`) pour une fiche. Chaque sauvegarde qui change le contenu crée une nouvelle révision — enregistrer un contenu identique n'écrit rien ; l'historique est la suite des révisions d'une page. (Les tags ne sont pas historisés : ils vivent sur la Page et se mettent à jour sans révision.)
_Avoid_: Version (comme table), historique (pour une entrée)

**Révision courante**:
La révision actuellement affichée d'une page, désignée explicitement par un pointeur `Page.current` (et non par la date la plus récente). Restaurer une ancienne révision crée une **nouvelle** révision (copie de son contenu, `createdAt` = maintenant) et fait pointer `current` dessus — à une exception près : le titre automatique d'une fiche y est recalculé, l'état courant suivant toujours la définition courante de son formulaire (ADR 0020). « Dernière édition » affichée = `current.createdAt`.
_Avoid_: Latest, dernière révision (trompeur : peut être une restauration)

**Composant**:
Un élément riche insérable dans le contenu d'une page (ex. Bouton, Image). Rendu via une syntaxe façon MDX, mais seuls les composants d'une liste blanche sont autorisés (voir Registre de composants). Les composants intégrés sont rendus dès le MVP ; l'*authoring* (menu « Composants », ComponentBuilder) est arrivé en v0.2.
_Avoid_: Widget, plugin, action

**Propriété**:
Un paramètre d'un composant, écrit dans sa balise (`<Button text="Salut" />`) et décrit par une clé du bloc `properties` de son descripteur — qui en fixe le type, le défaut et les valeurs possibles. Le descripteur est le **contrat** : ce qu'il promet fait référence, pas ce qu'un composant tolère (`width="200"` rend, mais `type: number` promet un nombre — c'est signalé). En code, une propriété est une **prop** React ; « attribut » ne désigne que la syntaxe JSX écrite dans la balise, et ne sort jamais dans un texte d'UI. Ce qu'un auteur écrit et que le descripteur ne décrit pas est ignoré au rendu et signalé à l'enregistrement (`modules/pages/lint.ts`).
_Avoid_: Attribut, paramètre, option, champ (le champ est le widget du builder, pas la propriété qu'il alimente)

**Registre de composants**:
La liste blanche des composants autorisés au rendu, construite automatiquement à partir des dossiers `modules/*/wiki-components/` — chaque module porte ceux de son concept, `modules/authoring/registry/scan.ts` les balaie tous. Une balise hors registre n'est pas rendue. La présence d'un descripteur co-localisé (`button.yaml`) est un fait indépendant : il pilote le menu « Composants » de l'éditeur et la génération du ComponentBuilder, pas l'autorisation de rendu. Un composant sans descripteur co-localisé n'a pas de ComponentBuilder et n'est pas proposé dans le menu « Composants » de l'éditeur. C'est le cas pour les composants qui rendent une page système ou des composants qui ne sont pas configurables via le ComponentBuilder.
_Avoid_: liste blanche déclarée en config (le dossier est la seule source), « composant enregistré » (rien ne s'enregistre : un fichier est là ou il n'y est pas)

**Balise HTML autorisée**:
Une balise HTML qu'un auteur peut **écrire ou coller** dans sa page (`<div>`, `<details>`, `<sup>`, `<iframe>`…). Comme les composants et les classes, c'est une **liste blanche** (ADR 0002, `modules/authoring/host-elements.ts`) : elle contient ce qui met en forme de la prose, plus `iframe` (embarquer un site se fait en collant un extrait tout fait) ; tout le reste est retiré au rendu avec ses enfants — `script`, `style`, `object`, `embed`, `form`, `link`, et toute balise à laquelle personne n'a pensé. Ne concerne **que** le JSX écrit par l'auteur : le HTML que markdown produit lui-même (tableau, liste, case à cocher) ne passe pas par ce chemin et n'est jamais filtré. Une balise refusée est signalée à l'enregistrement. Y ajouter une balise est une action d'opérateur (on édite le code), comme pour une famille de classes (ADR 0011). Deux **noms de props** sont refusés partout : `dangerouslySetInnerHTML` et `srcDoc`.
_Avoid_: « tout HTML », balise interdite (la liste dit ce qui est permis, pas ce qui est banni)

**Page spéciale**:
Une page à **slug réservé**, créée au seed de la base, **non supprimable, non renommable, mais éditable** (comme n'importe quelle page : flux d'édition normal, rendu MDX normal). C'est le seul trait commun à ses trois types : une **page système** (voir ce terme — se connecter, administrer), une **page de layout** — les 5 pages qui structurent le chrome du site (`page-titre`, `page-menu-haut`, `page-rapide-haut`, `page-header`, `page-footer` ; le menu n'a pas de rendu spécial, le contenu par défaut de `page-menu-haut` appelle le composant intégré `<Menu>`, celui de `page-rapide-haut` expose les 5 pages de layout derrière un bouton roue crantée) — ou une **page de contenu**, du contenu ordinaire simplement réservé par son slug (`page-principale`, l'accueil, cible de la redirection `/` → `/page-principale` ; `aide-memoire`, résumé des syntaxes MDX, ouvert en modale).
_Avoid_: Page seedée, template, fragment

**Page système (system page)**:
Une page spéciale dont le contenu rend un composant applicatif servi par le wiki, par opposition au contenu qu'un auteur écrit : administrer les formulaires (`formulaires`), les fiches (`fiches`), les utilisateurs et les groupes (`gerer-utilisateurs`), les droits des pages (`gerer-pages`), ou les quatre pages de comptes (`connexion`, `inscription`, `mot-de-passe-oublie`, `invitation`). Comme toute page spéciale, jamais une route ajoutée dans `app/` (ADR 0028), qui prélèverait un slug sur l'espace de noms des pages sans le dire — le composant vit dans le `wiki-components/` du module de son concept (ex. `gerer-pages` dans `modules/pages/wiki-components/`), absent du menu « Composants » : il n'a pas de descripteur, il ne s'insère pas dans une page ordinaire. Ce dont elle a besoin voyage dans la **query string** (`?suite=`, `?jeton=`, `?formulaire=`), jamais dans un segment : derrière le slug d'une page, un segment est un handler. Deux services (pas des pages système, voir Service d'API) répondent aussi à un besoin proche sous `/api` : l'aperçu du ComponentBuilder et l'installation initiale.
_Avoid_: Écran (ancien terme, trop générique — ne dit pas « servi par le wiki »), Route dédiée, page système sous `/admin`

**Lien wiki**:
Un lien interne vers une autre page, écrit en relatif par son slug (`[texte](ma-page)`), jamais avec le domaine. Distinct d'un lien externe (`http(s)://…`). Voir ADR 0006.
_Avoid_: Lien interne absolu, permalien

**Aide-mémoire**:
La page spéciale `aide-memoire` qui résume toutes les syntaxes MDX supportées dans WikiOui. Ouverte dans une modale depuis la barre d'outils de l'éditeur ; c'est une page, pas une route codée en dur.

**Commentaire**:
Un fragment de contenu non rendu par `show`, écrit avec la syntaxe de commentaire MDX `{/* … */}`. Visible dans l'éditeur et dans « Afficher le code Wiki », absent du rendu.

**Fichier uploadé**:
Un fichier de la bibliothèque du wiki : stocké dans le répertoire `files/` qui **fait foi** (pas de table — ADR 0012), servi à l'URL `/api/files/{nom}`, nom slugifié comme un slug de page. Sa **famille** (`image`, `pdf`, `other`), déterminée par son extension dans la config, décide du composant qui l'affiche et filtre les combobox `file-list`. Le pool est global au wiki : un fichier non référencé par une page (« orphelin ») reste légitime et réutilisable. **Ne porte aucun droit** (v0.5) : accessible à qui connaît son adresse, quels que soient les droits de la page qui l'affiche — les droits des fichiers attendent leur table, qui naîtra avec la galerie de gestion des fichiers (backlog).
_Avoid_: pièce jointe (un fichier n'appartient pas à une page)

**Classe utilitaire auteur**:
Une classe CSS Tailwind qu'un auteur peut poser sur son contenu — par annotation `{{ className: '…' }}` ou via la prop `className` d'un composant. Seules les classes de la **liste blanche safelistée** fonctionnent (ADR 0011) ; elles sont documentées dans l'aide-mémoire. Une classe hors liste ne fait rien.
_Avoid_: « tout Tailwind » (le contenu en base n'est pas scanné à la build)

**Iframe (`<Iframe>`)**:
Composant affichant une page **dans** la page, bâti sur `WikiFrame` (ADR 0022) : soit **une page du wiki** (champ `page`, qui s'auto-dimensionne et prend son propre titre), soit **la page d'un autre site** (champ `url`, `ratio`, `title`), selon la case « Page d'un autre site web ». Pour l'externe, c'est **l'une des deux portes** de cet usage, pas la seule : coller l'extrait `<iframe>` tout fait de YouTube ou d'OSM marche aussi (la balise est autorisée, seul `srcDoc` est refusé — c'est lui qui hérite de notre origine et y exécute ses scripts, là où un `src` cross-origin est muré par la politique de même origine). Les deux ne font pas doublon, ils servent deux **actions** : on colle un extrait quand on en a un, on ouvre le ComponentBuilder quand on n'a qu'une URL. `<Iframe>` ajoute alors ce qu'un extrait collé ne porte pas : `https` seul, `sandbox` sans `allow-top-navigation` (sinon le site embarqué redirige l'onglet du lecteur), et un `title` pour les lecteurs d'écran. (Ex-`<Embed>`, avant l'ajout des pages internes.)
_Avoid_: oEmbed / unfurl (aucune métadonnée n'est récupérée), « remplace iframe » (les deux coexistent)

**Composant intégré (built-in)**:
Un composant livré avec WikiOui (`<Menu>`, `<Button>`), présent dans le registre dès le MVP car le rendu (notamment du layout) en dépend. À distinguer de l'*authoring* de composants (menu « Composants » de la barre d'outils, ComponentBuilder, sélecteur d'icônes Iconify), arrivé en v0.2. Rendre un composant ≠ fournir l'UI pour l'insérer.

**ComponentBuilder**:
L'interface de paramétrage **autogénérée** d'un composant : une modale construite **depuis son descripteur YAML** co-localisé dans le `wiki-components/` du module du composant (ex. `modules/pages/wiki-components/button.yaml` — champs, types, défauts ; spécification : [`docs/component-builder.md`](docs/component-builder.md)). Le composant `.tsx`, lui, est un composant React ordinaire **sans contrat** (client ou serveur, ADR 0013) : il fournit l'aperçu (via le vrai pipeline de rendu) et sa cohérence avec le descripteur est **vérifiée par signature** au build et en dev. L'aperçu du rendu est affiché en haut, les champs générés en dessous (les champs `advanced` derrière « paramètres avancés »). Ouvert depuis le menu « Composants » de l'éditeur — sauf pour le lien wiki : son ComponentBuilder (descripteur `wiki-link.yaml`) émet un lien markdown plutôt qu'une balise de composant, et s'ouvre depuis le bouton « Ajouter un lien » de la barre d'outils et le bouton flottant d'édition de lien ancré au curseur. Tout builder **insère et réédite** (y compris une occurrence écrite à la main). Couvre `Button`, `Image`, `Pdf`, `FileLink`, `Iframe`, `EntryForm` et `EntriesView`.
_Avoid_: modale codée à la main (c'est celle du MVP pour le lien), formulaire spécifique par composant

**Menu**:
Composant intégré qui transforme la liste imbriquée écrite entre ses balises en menu de navigation multi-niveaux : niveau 1 en barre horizontale, sous-items en déroulant (l'imbrication au-delà du niveau 2 est aplatie, indentée dans le même déroulant). Un item est au choix un texte (simple déclencheur), un lien (navigue au clic, déroulant au survol/focus) ou un `<Button>`. Sans contenu il ne rend rien : un menu est toujours écrit par l'auteur, jamais déduit de la base (ADR 0010).
_Avoid_: auto-listing des pages, barre de navigation codée en dur

**Bouton (`<Button>`)**:
Composant intégré affichant un bouton défini par un libellé (`text`), un lien (`link`, page du wiki ou URL) et éventuellement une icône (`icon`, un identifiant Iconify complet — `lucide:settings` — choisi au sélecteur d'icônes depuis la v0.2 ; les noms français de la liste blanche du MVP n'existent plus). S'y ajoutent la couleur, le texte affiché au survol, l'ouverture du lien en popup, la position et l'ouverture dans une nouvelle fenêtre. Dans le contenu d'une page il prend l'apparence d'un bouton pleine forme ; dans un slot du bandeau, celle d'un bouton discret de barre de navigation — la différence est purement CSS. Utilisé comme item parent d'un `<Menu>`, il en devient le déclencheur (ex. la roue crantée de `page-rapide-haut`). Son interface graphique de configuration est son ComponentBuilder (`button.yaml`).
_Avoid_: bouton d'action serveur (il ne déclenche pas de mutation)

**Formulaire**:
Une définition de champs de saisie (une liste de champs typés et paramétrés), construite en ligne via le FormBuilder et stockée en base (entité `Form` — **pas** une page, ADR 0014). Identifié par un **id slug** unique dérivé de son `name`, personnalisable à la création puis modifiable seulement par « Changer l'identifiant » — le même retcon intégral que « Changer l'adresse » (ADR 0016), qui réécrit `<EntryForm id>`, les `sourceFormId` et les gabarits. Sa suppression emporte ses fiches (confirmation explicite). Jamais historisé : enregistrer écrase.
_Avoid_: Bazar, ID numérique de formulaire, page de formulaire

**Fiche**:
Une **Page** dont le contenu est structuré par un formulaire (`Page.formId`) : ses valeurs de champs vivent en snapshot JSON `data` sur chaque Révision (historisées comme du contenu). Saisie et éditée par le **formulaire généré** (jamais CodeMirror), rendue par la vue par défaut ou le gabarit du formulaire. Son slug est dérivé de son titre à la création (chip éditable en place, personnalisable) puis ne change plus que par « Changer l'adresse » — jamais recalculé depuis le titre. Toute fiche porte un **titre non vide** dans ses valeurs de champs, y compris en mode **titre automatique** où il est calculé depuis un template `{champ}` : calculé à l'écriture, jamais à la lecture (ADR 0020).
_Avoid_: Entrée (réservé aux noms de code : entry), fiche-page séparée de Page

**FormBuilder**:
L'interface de construction d'un formulaire (page spéciale `formulaires`) : palette de types de champs, drag & drop vers le canvas, panneau de paramétrage par champ, éditeur de gabarit. Produit le descripteur JSON `Form.schema`, validé à l'enregistrement (méta-schéma Zod + règles croisées). Spécification : [`docs/forms.md`](docs/forms.md).
_Avoid_: ComponentBuilder (son cousin pour les composants), éditeur de page

**Gabarit de fiche**:
Le template MDX optionnel d'un formulaire (`Form.template`) qui met en page ses fiches au rendu : les `{champ}` sont substitués par les valeurs de la fiche (échappées — texte brut), puis le résultat passe par le pipeline MDX sandboxé. Vide, c'est le **rendu par défaut** auto-généré qui s'applique. Un `{champ}` inconnu est refusé à l'enregistrement du formulaire ; une valeur absente rend vide.
_Avoid_: template (réserver au nom de colonne), thème

**EntriesView (`<EntriesView>`)**:
Composant intégré (v0.4) qui affiche les fiches d'un ou plusieurs formulaires selon une **vue de fiches** au choix, avec recherche, filtres, tri et sélection configurés dans sa balise. Toujours interactif (la distinction YesWiki statique/dynamique n'existe pas). Spécification : [`docs/entries-view.md`](docs/entries-view.md).
_Avoid_: bazarliste, une action par forme d'affichage

**Vue de fiches**:
L'une des neuf formes d'affichage d'EntriesView — Liste, Grille, Tableau, Carte, Calendrier, Agenda, Annuaire, Carrousel, Galerie photo — choisie par la prop `view` (sélecteur en tuiles du builder, aperçu en direct). Chaque vue a ses paramètres propres ; zones, filtres, tri et « Lors du clic, afficher la fiche » sont communs.
_Avoid_: template d'affichage, Blocs (ancien nom YesWiki de la Grille), Photobox (ancien nom de la Galerie photo)

**Zone**:
Un emplacement nommé d'une vue de fiches (Titre, Sous-titre, Texte, Pied, Visuel, Légende, Badge) auquel l'auteur associe un champ. Le **Badge** est la petite info mise en avant, posée en surimpression du visuel d'une carte de Grille.
_Avoid_: zone flottante (ancien nom du Badge), displayfields

**Filtre**:
Un champ à options qu'EntriesView expose au **visiteur** pour restreindre les fiches affichées (compteurs par option en direct, bouton « Effacer les filtres » automatique). Choisi, ordonné et titré par l'auteur (« Filtres disponibles »). À distinguer de la **Sélection des fiches**, les restrictions fixées par l'auteur (période, maximum).
_Avoid_: Facette (jargon YesWiki)

**Pseudo-champ**:
Un champ synthétique proposé par EntriesView aux côtés des champs du formulaire : `$form` (le formulaire de la fiche, en multi-formulaires), `$owner`, `$createdAt`, `$editedAt`. Le préfixe `$` interdit toute collision avec un `name` de champ.
_Avoid_: extraFields (jargon YesWiki), champ système

**Personne**:
Celle qui agit sur le wiki à un instant donné, **connectée ou non** — donc à l'un des trois niveaux d'accès, selon qui frappe. C'est le sujet de toute question de droit (« cette personne peut-elle modifier cette page ? ») et le premier paramètre de la couche d'accès. En code : `Person`, résolue par `currentPerson()`.
_Avoid_: Acteur (abandonné en v0.5), demandeur, visiteur (il n'en est qu'un cas), lecteur (boite dès qu'il s'agit d'écrire), utilisateur (celui-là a un compte, la personne pas forcément)

**Niveau d'accès**:
L'un des trois états possibles d'une personne, du plus étroit au plus large : **visiteur** (non identifié), **utilisateur** (a un compte), **administrateur** (membre du groupe Admins). Un niveau ne se paramètre pas, il se constate — il découle de la session et de l'appartenance aux groupes. À ne pas confondre avec la **portée** d'un droit, qui est le réglage posé sur une page.
_Avoid_: Rôle (il n'y a pas de champ rôle), profil, statut, permission

**Visiteur**:
Le niveau d'accès d'une personne non identifiée : sans compte, ou non connectée. N'obtient que ce qui est ouvert à « tout le monde ». Terme **étroit** : pour désigner qui que ce soit qui agit, le mot est *personne*.
_Avoid_: Anonyme (réservé au libellé d'un contenu sans auteur identifié), invité, utilisateur non connecté

**Utilisateur**:
Une personne dotée d'un compte. Ce que voit le lecteur, c'est son **nom affiché** (libre, un pseudonyme est accepté) et son avatar ; ce que désignent les droits, c'est son **username**. Un utilisateur est simple par défaut, et administrateur seulement s'il appartient au groupe Admins — il n'y a pas de champ rôle.
_Avoid_: Membre (réservé à l'appartenance à un groupe), compte (l'objet technique de l'authentification)

**Invitation**:
Un **lien à usage unique** posé sur une adresse e-mail, par lequel une personne se crée un compte en choisissant elle-même son nom affiché, son identifiant et son mot de passe — un administrateur n'en définit jamais un. La même primitive sert au «&nbsp;mot de passe oublié&nbsp;» et à la réinitialisation déclenchée par un administrateur : ce qu'elle vaut se lit sur la table des comptes, invitation tant que l'adresse n'en a pas, réinitialisation dès qu'elle en a un. L'envoyer par courriel n'est qu'un mode de livraison — sans SMTP, l'administrateur copie le lien.
_Avoid_: Token, inscription (réservée à la création libre d'un compte, fermée par défaut), création de compte par un administrateur

**Compte désactivé**:
Un compte dont l'accès est coupé : connexion refusée, sessions révoquées à l'instant, et **rien d'autre ne bouge** — ses pages, ses fiches et ses révisions restent à son nom. Réversible d'un clic, et jamais posé sur son propre compte : ce qu'on y cherche est « se déconnecter ». À distinguer de la **suppression**, qui est un effacement : les données personnelles disparaissent, les contributions restent sous « Anonyme », et elle appartient à la personne elle-même (RGPD) autant qu'à un administrateur. Un wiki garde toujours au moins un administrateur capable de se connecter : c'est la limite que les deux actions refusent de franchir.
_Avoid_: Banni, suspendu, compte fermé, archivé

**Username**:
L'identifiant public et unique d'un utilisateur (`marie-durand`), au même format qu'un slug de page. Dérivé du nom affiché à l'inscription, personnalisable, puis figé — et renommable ensuite par une action explicite, comme tout identifiant du projet. C'est lui que stockent les droits, la propriété, l'auteur d'une révision et l'appartenance aux groupes, et lui qui distingue deux homonymes là où le nom affiché ne suffit pas. Présenté comme l'**identifiant** en UI.
_Avoid_: login, pseudo, nom wiki (YesWiki), identifiant numérique

**Administrateur**:
Un utilisateur membre du groupe **Admins**. Peut lire et modifier toute page et toute fiche, sans exception — et sans jamais figurer dans les droits d'une page : son accès est un invariant, pas une autorisation accordée.
_Avoid_: Rôle, superutilisateur, modérateur

**Groupe**:
Un ensemble nommé d'utilisateurs et/ou d'autres groupes, créé pour accorder des droits à plusieurs personnes d'un coup. Identifié par un slug, présenté préfixé d'un `@` (`@redacteurs`) — ce `@` est une marque visuelle qui distingue un groupe d'une personne, jamais une syntaxe à taper. **Admins** est le groupe seedé qui confère l'administration.
_Avoid_: Rôle, équipe, liste

**Propriétaire**:
L'utilisateur à qui appartient une page ou une fiche : celui qui l'a créée, jusqu'à réattribution éventuelle. Il peut toujours la voir et la modifier, quels que soient les droits posés dessus — c'est un plancher, pas une case à cocher, et il ne figure donc jamais dans une liste de droits. Une page peut n'avoir **aucun** propriétaire (compte supprimé, contenu seedé) : son plancher est alors vide, et sa portée décide seule — ce qui, sous une portée *seulement*, ne laisse que les administrateurs.
_Avoid_: Auteur (l'auteur est celui d'une révision, et n'ouvre aucun droit), créateur

**Droit**:
L'autorisation de **lire** ou d'**écrire** une page, une fiche ou un champ. Chacun des deux s'exprime par une **portée** — *tout le monde* · *les personnes connectées* · *seulement* — la troisième ouvrant une liste d'utilisateurs et de groupes. Le propriétaire et les administrateurs sont toujours autorisés : ils ne sont jamais une **ligne** du droit — rien n'est stocké pour eux, rien n'est retirable — mais le widget les affiche verrouillés, pour qu'une liste vide ne se lise pas « personne » ; une portée *seulement* à liste vide dit donc « eux seuls ». Écrire implique lire.
_Avoid_: ACL (nom de code, à réserver au code), permission, rôle, « niveau » (réservé au niveau d'accès, qui décrit une personne et non un réglage)

**Action**:
Ce qu'une personne déclenche sur une page ou une fiche : éditer, poser des tags, restaurer une révision, supprimer, modifier les droits, transmettre la propriété, changer l'adresse. Chacune s'arrête à un **cran** — le droit d'écriture, le propriétaire ou administrateur (les **actions structurantes**), l'administrateur seul (l'adresse) — et le cran suit la **portée de l'effet**, pas une hiérarchie de personnes : qui peut écrire peut de toute façon vider une page, mais l'historique survit à un blanchiment, pas à une suppression. Une action indisponible est **absente** de la barre, jamais grisée : une offre impossible n'informe personne. En code, l'ensemble des crans ouverts à une personne sur une page est un `PagePermissions` — jamais un « type Action », que Next réserve aux Server Actions.
_Avoid_: Geste (abandonné en v0.5), opération, commande ; « action » pour désigner un handler de page, un composant ou une Server Action

**Création de fiche**:
Le droit de **créer** une fiche d'un formulaire, distinct du droit de la **modifier** une fois créée. Un formulaire porte donc trois réglages : qui peut créer une fiche, et les deux droits par défaut (voir, modifier) de la fiche née. C'est ce qui permet le cas courant « chacun crée la sienne, chacun ne modifie que la sienne ».
_Avoid_: saisie (ambigu : désigne aussi bien la création que l'édition), dépôt, soumission

**Droit par défaut**:
Un gabarit de droits **recopié** au moment d'une création — jamais un lien vivant. `wiki.config.ts` fournit ceux d'une page nouvelle et ceux d'un formulaire nouveau ; un formulaire fournit ceux de ses fiches. Modifier un défaut ne touche donc rien de ce qui existe : le seul chemin vers l'existant est une action explicite (« Appliquer aux fiches existantes »), à confirmation chiffrée.
_Avoid_: héritage, droit hérité, droit propagé (rien n'est lié)

**Anonyme**:
Le libellé d'un contenu sans auteur ni propriétaire identifié (`NULL` en base), **quelle qu'en soit la raison** : contenu antérieur aux comptes, écrit par un visiteur sur un wiki à création ouverte, ou dont le compte a été effacé. Le wiki ne distingue pas ces cas — il n'en ferait rien, et se taire sert mieux un effacement demandé que de signaler qu'il a eu lieu.
_Avoid_: « Compte supprimé » (distinction écartée), visiteur (la personne, pas le libellé), invité, utilisateur inconnu

## Périmètre

**v0.1 (MVP)** : CRUD de pages par slug, routing page/handler, handlers `show` et `edit`, rendu MDX, révisions (historique + restauration), pages spéciales de layout, les composants intégrés `<Menu>` et `<Button>`, et un éditeur riche (barre d'outils de formatage markdown, modale de lien, outils contextuels ancrés au curseur ; double-clic sur le contenu d'une page pour passer en édition).

**v0.2** : upload de fichiers (bouton, drag & drop, collage → `Image`, `Pdf` ou `FileLink` selon la famille ; répertoire `files/` faisant foi ; limites et extensions par famille dans la config) et authoring de composants (menu « Composants », ComponentBuilder généré depuis les YAML co-localisés avec les composants wiki, sélecteur d'icônes Iconify) pour `Button`, `Image`, `Pdf` et `FileLink` ; la modale de lien wiki devient un ComponentBuilder à sérialisation markdown (`wiki-link.yaml`).

**v0.3** : formulaires & fiches (ADR 0014/0015, spec [`docs/forms.md`](docs/forms.md)) — FormBuilder (pages spéciales `formulaires` et `fiches`), 14 types de champs, saisie via `<EntryForm>`, rendu par défaut + gabarit MDX optionnel, renderer de champs partagé avec le ComponentBuilder, Zod comme contrat runtime, API de redimensionnement d'images. `<EntriesView>` (vues riches des fiches) : v0.4. En cours de route (2026-07-17), colmatage du bac à sable (ADR 0002) : liste blanche de balises HTML, refus de `dangerouslySetInnerHTML` et de `srcDoc`, et composant `<Iframe>` (alors `<Embed>`) à côté du collage d'`<iframe>`. S'y ajoute (grillé le 2026-07-17) « Changer l'adresse » : renommage des slugs de pages et de fiches par réécriture intégrale des références, sans redirection (ADR 0016), avec lint des liens vers pages inexistantes ; les identifiants de formulaires suivent la même action (« Changer », dans l'en-tête du FormBuilder), et ceux des champs aussi — différé à l'enregistrement du formulaire (ADR 0017) ; l'extension aux fichiers attend leurs tables (backlog).

**v0.4** : `<EntriesView>` (spec grillée le 2026-07-19 : [`docs/entries-view.md`](docs/entries-view.md), ADR 0018/0019) — neuf vues de fiches, filtres/recherche/tri instantanés (chargement complet par Server Action, exécution client), couleur & icône par champ avec palette automatique, popup fiche commune (« Lors du clic »), six nouveaux types de descripteur (`view-picker`, `form-field` à options dépendantes, `field-rows`, mappings, `map-view`), props structurées en expressions littérales JSX. En cours de route (grillé le 2026-07-22), le **titre automatique passe d'un calcul à la lecture à un calcul à l'écriture** (ADR 0020) : il est stocké dans `data` comme toute valeur de champ, recalculé en masse à l'enregistrement du formulaire quand le gabarit change, et garanti non vide par une contrainte en base. S'y ajoutent le **rendu chrome-free** (handler `/{slug}/iframe` dans le groupe `(bare)`, brique `WikiFrame`, `<Embed>` renommé `<Iframe>` et élargi aux pages du wiki — ADR 0022) et le **déploiement** (image Docker `standalone`, `migrate` au démarrage et seed une seule fois — ADR 0021, guide [`docs/deployment-dokploy.md`](docs/deployment-dokploy.md)).

**v0.5** : utilisateurs & droits (spec grillée le 2026-07-30 : [`docs/permissions.md`](docs/permissions.md), ADR 0023 à 0028) — authentification par BetterAuth (plugin `username`, connexion par email *ou* identifiant), autorisation entièrement WikiOui : trois niveaux d'accès, groupes imbriqués, et un droit = une **portée** (*tout le monde* · *les personnes connectées* · *seulement*) complétée d'une liste, le propriétaire et les administrateurs étant toujours autorisés. Les droits se posent à quatre étages — page/fiche, formulaire (créer une fiche + deux défauts), champ (fusion à l'écriture, jamais de remplacement), configuration — et les défauts se **recopient** à la création, sans jamais se lier (ADR 0026). Deux pages spéciales de plus, `gerer-utilisateurs` (comptes, invitations par lot, groupes et leur imbrication expliquée) et `gerer-pages` (recherche, filtres, lot « Remplacer les accès » ou « Donner accès »). S'y ajoutent le handler **`/{slug}/raw`** (MDX ou JSON brut, champs restreints retirés), la propriété d'auteur `hideIfNoAccess` sur les liens, boutons et iframes, l'**installation** à drapeau irréversible (ADR 0027) et la première colonne de la table `Settings`. Les pages de comptes sont elles aussi des **pages système** — `connexion`, `inscription`, `mot-de-passe-oublie` et `invitation`, dont le jeton voyage en `?jeton=` (ADR 0028) — l'installation elle-même n'ajoutant aucune route de niveau 1, puisqu'elle vit sous `/api` et se présente par réécriture. Le contrôle passe par une **couche d'accès unique gardée par ESLint** (ADR 0025), jamais par RLS ni par une extension Prisma.

Backlog sans version prévue (mais le domaine doit pouvoir l'accueillir) : commentaires, galerie de gestion des fichiers (et, avec sa table, les droits sur les fichiers), limitation de débit et anti-abus, recherche/filtre par tags et vues. Détail dans [`docs/architecture.md`](docs/architecture.md).
