# Utilisateurs & droits (spec WikiOui v0.5)

L'équivalent de la gestion des droits de YesWiki, refondue pour tenir sans documentation : un seul mode de paramétrage, des comportements généralisés, et une interface qui se suffit à elle-même.

ADR [0023](adr/0023-betterauth-authentifie-wikioui-autorise.md) (frontière authentification/autorisation), [0024](adr/0024-droits-par-username-et-slug.md) (ce que stockent les droits), [0025](adr/0025-couche-acces-gardee-par-eslint.md) (où le contrôle s'applique), [0026](adr/0026-defauts-recopies-jamais-lies.md) (les défauts se recopient), [0027](adr/0027-installation-drapeau-irreversible.md) (l'amorçage), [0028](adr/0028-tout-ecran-est-une-page.md) (les écrans sont des pages). Glossaire : [`../CONTEXT.md`](../CONTEXT.md).

## Le modèle en deux phrases

*BetterAuth authentifie, WikiOui autorise* (ADR 0023) : la bibliothèque sait qui vous êtes, elle ne sait rien de ce que vous avez le droit de faire. Ni le plugin `admin` ni le plugin `organization` ne sont utilisés — seul `username` l'est, parce qu'il relève de l'authentification.

*Un droit est une portée, éventuellement complétée d'une liste* : trois portées exclusives — **tout le monde** · **les personnes connectées** · **seulement** — la troisième ouvrant une liste de personnes et de groupes. Le propriétaire et les administrateurs sont toujours autorisés et ne figurent jamais dans cette liste.

## Acteur et niveaux d'accès

L'**acteur** est la personne qui agit à un instant donné, connectée ou non. Elle se situe à l'un des trois **niveaux d'accès**, qui ne se paramètrent pas — ils se constatent :

| Niveau | Condition | Obtient |
| --- | --- | --- |
| Visiteur | pas de session | ce qui est ouvert à *tout le monde* |
| Utilisateur | session valide | en plus, ce qui est ouvert aux *personnes connectées* |
| Administrateur | membre du groupe `@Admins` | tout, en lecture comme en écriture |

L'administration est une **appartenance**, pas un champ `role` : il n'existe aucune colonne de rôle dans le modèle.

## Comptes

### Identité

| Champ | Rôle | Modifiable |
| --- | --- | --- |
| `name` | Nom affiché, libre — un pseudonyme est accepté | oui, depuis le profil |
| `username` | Identifiant public unique, au format d'un slug de page | par le geste de renommage |
| `email` | Privé. Visible seulement dans `gerer-utilisateurs` | oui |
| `image` | Avatar, uploadé dans `files/` et servi par `/api/files/{nom}?w=…` | oui |

Le `username` suit la règle d'identité commune du projet ([`forms.md`](forms.md) § Identités) : dérivé du nom affiché par `slugify()`, personnalisable avant enregistrement, puis figé. Il est fourni par le plugin `username` de BetterAuth, à qui l'on passe un `usernameValidator` imposant `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Une collision à l'inscription produit un message invitant à personnaliser — jamais de suffixe automatique.

`slugify()` ne coupe pas le CamelCase : « Wiki Admin » donne `wiki-admin`, « WikiAdmin » donnerait `wikiadmin`.

La connexion accepte **l'email ou l'identifiant** dans un seul champ, le plugin `username` sachant faire les deux.

### Naissance d'un compte

L'inscription libre est **fermée par défaut**, ouvrable par `wiki.config.ts`. Autrement, les comptes naissent d'une **invitation** créée depuis `gerer-utilisateurs`.

Un administrateur **ne définit jamais de mot de passe**. Une invitation est un **lien à usage unique** dont l'envoi par mail n'est qu'un mode de livraison :

```
Créer l'invitation  →  /invitation?jeton=…   (14 jours, usage unique)
                        │
        ┌───────────────┼───────────────────────┐
   SMTP configuré   envoi refusé           pas de SMTP
   le serveur       l'écran le dit,        l'admin copie le lien
   l'envoie         message du serveur     et le transmet comme il veut
                    en détail + journaux
```

Le jeton voyage en **paramètre**, jamais en segment : la page `invitation` est une page du wiki, et ce qui suit le slug d'une page est un de ses handlers (ADR 0028).

La personne choisit son nom affiché, son identifiant et son mot de passe. **Une seule primitive pour trois besoins** : invitation, « mot de passe oublié », et réinitialisation déclenchée par un administrateur. Le SMTP n'est donc jamais une dépendance de fonctionnement, seulement un confort d'acheminement.

**Un envoi qui échoue se dit.** Un SMTP mal réglé ne se remarquait pas : l'écran annonçait un courriel parti. Désormais l'échec est annoncé partout où il se produit, et le **détail** — ce que le serveur a répondu — va à qui peut le corriger :

| Qui regarde | Ce qu'il voit |
| --- | --- |
| Un administrateur (invitation, lien de mot de passe) | « L'envoi a échoué » **et** le message du serveur, replié sous « Détail de l'erreur d'envoi », avec les six réglages à vérifier |
| Une personne sur « mot de passe oublié » | « Le courriel n'est pas parti — prévenez un administrateur », sans détail : il ne nommerait que des hôtes et des comptes à qui ne peut rien en faire |
| Personne (envoi de nuit, lot) | La ligne `[wikioui] SMTP — …` dans les journaux du serveur, seule trace quand il n'y a pas d'écran |

Le « mot de passe oublié » garde son silence sur l'adresse : quand elle ne porte aucun compte, le wiki **vérifie tout de même** qu'il aurait pu envoyer, si bien que la réponse est la même pour toutes les adresses et n'apprend à personne lesquelles existent.

Les réglages d'envoi sont six variables d'environnement (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) plutôt qu'une chaîne de connexion : c'est ce que donne un hébergeur de messagerie, et un mot de passe ne s'y encode pas. Elles descendront dans `Settings` avec l'écran de configuration.

**Invitation en masse** : un champ qui digère ce qui sort d'un client mail — virgules, points-virgules, retours à la ligne et la forme `Nom <adresse>`. Doublons fusionnés, adresses déjà titulaires d'un compte ou d'une invitation signalées sans être recréées. Un sélecteur « Ajouter aussi au groupe » évite la corvée qui suit toujours.

### Fin d'un compte

Deux gestes distincts, pour deux intentions qui n'ont rien à voir :

- **Désactiver** — le cas courant, « cette personne n'est plus des nôtres ». Connexion refusée, sessions révoquées, attribution intacte, réversible d'un clic. Filtre « Désactivés » dans la liste.
- **Supprimer** — la demande d'effacement. La modale annonce les nombres et propose de **réattribuer** les pages du compte. Puis un simple `DELETE` : `onDelete: SetNull` vide `ownerUsername` et `authorUsername`, `onDelete: Cascade` emporte les lignes de `PageAcl` et de `GroupMember`.

**L'effacement appartient à la personne** (RGPD, droit à l'effacement) : « Supprimer mon compte » vit dans le menu du compte, atteignable sans administrateur, et la modale dit les deux moitiés de ce qui arrive — les données personnelles (nom affiché, identifiant, adresse, mot de passe) sont effacées, plus rien ne porte le nom, et les pages et fiches écrites restent sur le wiki sous « Anonyme ». Rien n'y est réattribué : proposer un successeur nommé supposerait de montrer à qui s'en va la liste de tout le monde. Le seul refus est l'invariant du wiki — le dernier administrateur passe la main avant de partir. **Désactiver son propre compte, en revanche, n'est jamais offert** : le geste enfermerait dehors celui qui le pose, et ce qu'il cherchait est « se déconnecter ».

Un contenu sans propriétaire ni auteur identifié s'affiche **« Anonyme »**, quelle qu'en soit la raison — antérieur aux comptes, écrit par un visiteur sur un wiki ouvert, ou compte effacé. Le wiki ne distingue pas ces cas : il n'en ferait rien, et se taire sert mieux un effacement demandé que de signaler qu'il a eu lieu.

Une page sans propriétaire n'est modifiable que par les administrateurs — conséquence mécanique de l'invariant, sans règle supplémentaire.

### Écran d'installation

Tant que le wiki n'a **jamais été installé**, toute adresse affiche l'écran d'installation (ADR 0027). C'est le seul écran qui ne soit pas une page — il doit répondre avant qu'aucune page ne soit lisible — et il n'a pas d'adresse à lui pour autant : il vit sous le segment réservé (`/api/installation`) et le proxy y **réécrit** ce qui a été demandé, si bien que le visiteur garde son adresse et que le slug `installation` reste libre pour une page (ADR 0028). Le jour où le drapeau est posé, l'écran cesse de répondre. L'écran impose le nom affiché **Wiki Admin** et l'identifiant **`wiki-admin`** — convention identique sur toutes les installations WikiOui — et ne demande que l'email et le mot de passe. Il crée le compte, l'ajoute à `@Admins`, lui attribue les pages spéciales, et pose `Settings.installedAt`.

La condition est **irréversible** : vider `@Admins` ne rouvre pas l'écran. Reprendre la main sans administrateur exige un accès à la machine, pas une requête HTTP.

## Groupes

Un groupe contient des **utilisateurs et/ou d'autres groupes**, sans limite de profondeur. Les cycles sont refusés à l'enregistrement, avec le chemin nommé : « @Rédacteurs contient déjà @Bureau, via @Trésorerie. »

`@Admins` est protégé comme une page spéciale : ni supprimable, ni renommable, **jamais vide** (retirer le dernier administrateur est refusé), et il **n'accepte que des personnes** — son sélecteur ne propose pas de groupes, avec la note « ⓘ Ce groupe n'accepte que des personnes — on ne devient pas administrateur en étant membre d'un autre groupe. » Aucun message d'erreur : l'état est rendu impossible, pas rattrapé.

Un groupe porte un **nom affiché** et un **slug** dérivé de lui à la création, personnalisable avant enregistrement puis figé — la règle d'identité commune du projet, et c'est le slug que retiennent les droits (ADR 0024). Renommer un groupe change son nom affiché ; déplacer son identifiant relèverait du geste de renommage de l'ADR 0016, hors périmètre v0.5.

Créer et modifier un groupe est réservé aux administrateurs en v0.5.

Les **groupes effectifs** d'un acteur (imbrication résolue) sont résolus **en mémoire**, une fois par requête HTTP, mémoïsés par le `cache()` de React — le motif déjà employé par `lib/pages.ts`. Deux requêtes suffisent : les appartenances directes de l'acteur, et les arêtes groupe→groupe, peu nombreuses par nature. La clôture est alors une fonction pure (`lib/groups.ts`), et ce sont les mêmes arêtes qui répondent au refus de cycle et au « via @Bureau › @Trésorerie » des écrans — là où une requête récursive n'aurait donné que la liste. Jamais mis en session : retirer quelqu'un d'un groupe doit prendre effet immédiatement, pas au renouvellement de sa session.

## Le droit

```
Qui peut voir cette page ?
  ( ) Tout le monde
  ( ) Les personnes connectées
  (•) Seulement :
      ┌──────────────────────────────────────────┐
      │ 🔒 Marie Durand (propriétaire)  🔒 @Admins│
      │ ● Paul Riva          ×                   │
      │ @ Rédacteurs         ×                   │
      │ + Ajouter…                               │
      └──────────────────────────────────────────┘
  ⓘ Le propriétaire et les administrateurs ont toujours accès,
    et ne peuvent pas être retirés.
```

- **Pas de portée « Administrateurs ».** La mettre au même rang laisserait croire que les autres les excluent. Leur accès est un invariant, énoncé par la note.
- **Le propriétaire est un plancher**, pas une case à cocher. Il n'est donc jamais une **ligne** du droit — rien n'est stocké pour lui, rien n'est retirable — mais le widget l'**affiche verrouillé**, aux côtés des administrateurs : une portée *seulement* à liste vide veut dire « eux seuls », et une boîte vide se lirait « personne ». Sur une page sans propriétaire, seuls les administrateurs s'affichent.
- **Écrire implique lire**, résolu à la vérification plutôt qu'interdit dans l'interface — ce qui évite les états bloqués.
- Les droits vivent sur la Page et **ne sont pas historisés**, comme les tags (ADR 0007) : les changer ne crée pas de révision.

## Où s'appliquent les droits

| Objet | Ce qui est réglé | Où c'est stocké |
| --- | --- | --- |
| Page, fiche | lecture, écriture | `Page.readScope`/`writeScope` + table `PageAcl` |
| Formulaire | création de fiche, défauts de lecture et d'écriture d'une fiche | `Form.schema.permissions` |
| Champ | lecture, écriture | `Form.schema.fields[].readAcl`/`writeAcl` |
| Wiki | création de page, défauts d'une page | `wiki.config.ts` (puis `Settings`) |

**La portée est une colonne, la liste est une table.** Un scalaire d'un côté, une collection de l'autre ; et dans un wiki ordinaire l'immense majorité des pages n'ont **aucune ligne** dans `PageAcl` — la vérification du cas courant se fait sans toucher la table.

### Formulaire : trois réglages, pas deux

**Créer** une fiche et **modifier** une fiche déjà là sont deux droits distincts. Les confondre casserait le cas le plus courant d'un wiki associatif : *chacun propose un événement, chacun ne modifie que le sien*.

```
Qui peut créer une fiche ?          → Les personnes connectées
Droits par défaut d'une fiche
  Qui peut la voir ?                → Tout le monde
  Qui peut la modifier ?            → Seulement  (= son propriétaire et les admins)
```

Ces réglages vivent dans un **troisième onglet « Droits »** du FormBuilder, à côté de « Champs » et « Gabarit » — pas en bas du canvas, qui est la cible du drag & drop. Ils sont stockés dans `Form.schema.permissions`, aux côtés des champs :

```ts
permissions: {
  createEntry:       { scope: "authenticated" },
  defaultEntryRead:  { scope: "everyone" },
  defaultEntryWrite: { scope: "restricted" },
}
```

Un formulaire écrit avant l'onglet n'en porte aucun : les défauts du wiki répondent pour lui — exactement ce qui aurait été recopié à sa création.

**Créer une fiche ne consulte pas `createPage`.** Le droit du wiki commande les pages, celui du formulaire commande ses fiches : c'est ce qui permet à un wiki qui ne distribue aucune page d'accueillir quand même « chacun propose un événement ».

**Éditer la définition d'un formulaire** — les champs, le gabarit, ces trois réglages, l'identifiant, la suppression — est réservé à **son propriétaire ou à un administrateur**. Même cran que les gestes structurants d'une page, et pour la même raison : ce qui change là atteint toutes les fiches jamais écrites avec ce formulaire. Ce que l'acteur n'a pas est **absent** de la liste des formulaires, jamais grisé.

**« Appliquer aux fiches existantes »** est le seul chemin des défauts vers l'existant. Le bouton enregistre le formulaire, puis remplace les droits de ses fiches — derrière une confirmation qui annonce les nombres, et dont l'*Appliquer* reste hors d'atteinte quand le geste n'écrirait rien :

```
ⓘ 23 fiches recevront ces droits. Les leurs seront perdus.
    7 fiches ont déjà ces droits — rien à changer.
    2 fiches que vous ne gérez pas : leurs droits ne changent pas.
```

La dernière ligne est le cran des gestes structurants, tenu fiche par fiche : le propriétaire d'un formulaire ne peut pas, en l'ouvrant, exclure un contributeur de sa propre fiche. Contrairement au lot de `gerer-pages`, personne n'a coché ces fiches une à une — le refus se compte et se dit, plutôt que de refuser le geste entier. Elle couvre aussi les fiches sans propriétaire, qui sont celles des administrateurs seuls : « que vous ne gérez pas » plutôt que « à quelqu'un d'autre », qui nommerait une personne inexistante.

Le décompte comme l'écriture **laissent tomber un nom disparu** (ADR 0026) : un défaut qui nomme un compte ou un groupe effacé depuis n'accorde rien en douce — et les deux le font au même endroit, sinon la fiche resterait « à changer » pour toujours et l'écriture casserait sur la clé étrangère.

### Champ : la fusion, et deux fuites colmatées

Une révision stocke un snapshot **complet** de `data`. Le serveur **fusionne, il ne remplace pas** : il repart de la révision courante et n'y superpose que les champs que l'acteur avait le droit d'écrire. Ce que le client envoie sur les autres est ignoré — pas refusé, sans quoi une simple différence de droits ferait échouer l'enregistrement.

Deux fuites sont **refusées à l'enregistrement du formulaire**, pas rattrapées au rendu :

- le **titre automatique** ne peut pas référencer un champ à lecture restreinte : `{prenom} {salaire}` publierait le salaire dans le titre, l'URL et toutes les listes. Même contrôle que le `{champ}` inconnu, déjà refusé ;
- le champ **`title`** ne peut pas être restreint en lecture : une fiche sans titre visible casse son invariant de titre non vide (ADR 0020), son slug et son affichage partout.

À la saisie, un champ non lisible est **absent** ; un champ lisible mais non modifiable est **affiché grisé avec son motif** (« 🔒 Réservé à @Bureau »).

### Défauts : ils se recopient, jamais ne se lient

```
wiki.config.ts  ──copie à la création du formulaire──▶  Form
Form            ──copie à la création de la fiche────▶  Page
```

Le même geste aux deux étages (ADR 0026). Modifier un défaut ne touche rien de ce qui existe ; le seul chemin vers l'existant est un bouton explicite « Appliquer aux fiches existantes », à confirmation chiffrée — motif des recalculs de masse des ADR 0017 et 0020.

```ts
permissions: {
  createPage:       { scope: "authenticated" },
  defaultPageRead:  { scope: "everyone" },
  defaultPageWrite: { scope: "restricted" },
}
```

Le fichier de configuration écrit des **usernames et des slugs de groupe** : c'est le seul endroit où un humain rédige des droits à la main, et le seul où aucune cascade ne peut jouer.

## Quel droit commande quel geste

| Cran | Gestes |
| --- | --- |
| Lecture | voir la page · voir le code wiki · historique et diffs · `/{slug}/raw` |
| Écriture (+ lecture) | éditer · restaurer une révision · tags · uploader |
| Propriétaire ou administrateur | supprimer · modifier les droits · transmettre la propriété |
| Administrateur | changer l'adresse (ADR 0016 : réécrit des références dans tout le wiki) |

La ligne se justifie par la **portée de l'effet**, pas par une hiérarchie. Qui peut écrire peut de toute façon vider une page — mais l'historique survit à un blanchiment, pas à une suppression. Et ouvrir l'écriture à quelqu'un ne doit pas lui permettre d'en exclure le propriétaire.

Transmettre la propriété est **sans retour** pour celui qui donne : la confirmation le dit.

**Uploader** ne consulte aucun réglage dédié : la garde répond à « cet acteur peut-il contribuer quelque part ? » — administrateur, ou `createPage` l'autorise, ou il existe une page qu'il peut écrire (`EXISTS` indexé, court-circuité par les deux tests gratuits, exécuté seulement à l'upload). Un wiki configuré ouvert accepte donc les dépôts anonymes : c'est voulu, et la limitation de débit est un autre chantier (backlog).

## Ce que voit qui n'a pas le droit

**Un seul message**, sans chercher à masquer l'existence de la page :

```
🔒 Vous n'avez pas accès à cette page.
   Gérée par Marie Durand.          ← omis si la page n'a plus de propriétaire
   [ Se connecter ]                 ← seulement si l'acteur ne l'est pas
```

Et une règle générale, qui suit la **nature** de l'élément plutôt qu'un principe unique :

| Élément | Sans le droit |
| --- | --- |
| Action (Éditer, Supprimer, Droits…) | **masquée** — une offre impossible n'informe personne |
| Bloc de contenu (`<EntryForm>`) | **affiché** avec son motif et une suite (« Réservé aux membres · Se connecter ») |
| Champ d'un formulaire | **grisé** avec son motif — le faire disparaître ferait croire la fiche incomplète |
| Double-clic pour éditer | ne fait **rien**, silencieusement |

Le motif d'un `<EntryForm>` suit la portée posée : « Réservé aux personnes connectées », « Réservé à @Bureau », ou « Réservé aux personnes autorisées » quand la liste ne nomme que des personnes — les nommer publierait à un visiteur qui est sur le wiki, là où un groupe est déjà la façon dont le wiki se désigne en public. La suite est « Se connecter », offerte au seul visiteur : à qui l'est déjà, elle ne promettrait rien.

### Liens et boutons vers l'inaccessible

Rien ne disparaît automatiquement : c'est **l'auteur** qui le décide, par un paramètre avancé.

```yaml
hideIfNoAccess:
  label: Masquer si la page n'est pas accessible
  hint: Sinon le lien reste visible, et au clic, la page informera que le
    contenu n'est pas accessible.
  type: checkbox
  default: false
  advanced: true
  showif:
    link: /^(?!https?:\/\/)/
```

Présent sur **`wiki-link.yaml`**, **`button.yaml`** (« le bouton » dans le `hint`) et **`iframe.yaml`** (là, `showif: { external: false }`, et le `hint` parle du cadre — il n'y a pas de clic). Le `showif` en lookahead réutilise le moteur d'expressions régulières déjà employé par `externalModalWarning` : aucune restructuration des descripteurs, et le paramètre s'efface dès qu'on tape `https://`.

`<Menu>` **ignore une puce devenue vide**, récursivement : un parent dont tous les enfants ont disparu disparaît aussi. En annotation markdown, la valeur est obligatoire (`{{ hideIfNoAccess: true }}`) : l'annotation est un objet littéral, et le bac à sable n'accepte que des littéraux statiques (ADR 0002).

Le paramètre ne concerne **pas** les liens vers une page inexistante — erreur d'écriture que `lib/page-lint.ts` signale déjà, et que masquer reviendrait à cacher.

Une `<Iframe>` sur une page inaccessible rend le même bloc, en version compacte : `WikiFrame` auto-dimensionne, le cadre se réduit tout seul (ADR 0022).

## Les écrans

Deux **pages spéciales** seedées de plus, dont le contenu appelle des composants intégrés — même philosophie que `formulaires` et `fiches`. Elles rejoignent la roue crantée de `page-rapide-haut`.

Les quatre écrans de comptes en sont aussi : `connexion` (`<SignIn />`), `inscription` (`<SignUp />`), `mot-de-passe-oublie` (`<ForgotPassword />`) et `invitation` (`<Invitation />`) — tout écran est une page (ADR 0028), l'installation exceptée — et elle-même n'occupe aucun slug. Elles portent le chrome du site comme n'importe quelle page : on se connecte **dans** le wiki. Deux conséquences à tenir quand les droits de lecture arriveront : ces quatre pages restent **lisibles par tout le monde** quel que soit le droit posé dessus (la connexion doit répondre là où le contenu refuse), et l'inscription libre étant fermée par défaut, `inscription` affiche alors où trouver un compte plutôt qu'un formulaire inutilisable.

### `gerer-utilisateurs`

`<UsersAdmin />` et `<GroupsAdmin />` empilés dans le MDX seedé. Seule la liste des utilisateurs prend la **frappe directe** (motif de la liste des formulaires) — deux listes ne peuvent pas se partager le clavier ; les groupes ont un champ de recherche ordinaire.

```
—— Utilisateurs ————————————————————————————————
 ⌨ tapez pour filtrer…
 ( ) Tous  ( ) Actifs  ( ) Désactivés  ( ) Invitations en attente

 ● Marie Durand   marie-durand   marie@asso.fr   @Bureau
 ● Jean Martin    jean-martin    jean@asso.fr    @Admins
 ✉ paul@asso.fr   invité le 28/07     [ Renvoyer ] [ Révoquer ]

—— Groupes —————————————————————————————————————
 🔎 [ Rechercher un groupe… ]
 @Admins ⛿ · @Bureau · @Rédacteurs · @Trésorerie
```

**Éditeur d'un groupe** — ce qu'on peut modifier et ce qu'on constate ne se mélangent pas :

```
@Rédacteurs
  Membres
  ┌──────────────────────────────────────┐
  │ ● Paul Riva  ×     @ Bureau  ×       │
  │ + Ajouter…                           │
  └──────────────────────────────────────┘

  Contient aussi, par imbrication
  ● Marie Durand   via @Bureau › @Trésorerie
  ● Sophie Vidal   via @Bureau
  ⓘ Pour les retirer, modifiez le groupe auquel ils appartiennent.

  → 7 personnes au total
```

Le chemin est **cliquable** (`?groupe=bureau`). Une personne à la fois membre directe et héritée n'apparaît qu'une fois, en chip direct ; retirer ce chip déclenche le toast « Marie Durand reste membre via @Bureau › @Trésorerie ». La réciproque existe sur la ligne d'un utilisateur : groupes directs en chips, hérités grisés avec leur chemin — c'est souvent là qu'on cherche *pourquoi* quelqu'un a accès.

Supprimer un groupe annonce ses conséquences : « @Bureau apparaît dans les droits de 23 pages. Le supprimer retirera ces droits. »

### `gerer-pages`

```
gerer-pages                                        247 pages
┌────────────────────────────────────────────────────────────┐
│ ⌨ Tapez pour rechercher par nom…                           │
│ Type  (•) Tout  ( ) Pages  ( ) Fiches                      │
│ Formulaire  [ Tous ▾ ]                                     │
└────────────────────────────────────────────────────────────┘
   Page                     Propriétaire    Voir         Modifier
☑  accueil                  Jean Martin     🌍 Tous      🔒 Lui seul
☑  compte-rendu-ag-2026     Marie Durand    👤 Connectés 🔒 +2
☐  assemblee-generale  ⌗AG  Jean Martin     🌍 Tous      🔒 @Bureau
☐  contact             ⌗Contact  —          🌍 Tous      🔒 Admins

2 sélectionnées   [ Modifier les accès… ]  [ Changer le propriétaire… ]
```

Le marqueur `⌗Formulaire` distingue une fiche d'une page sans colonne de plus. Nommer un formulaire dit **Fiches** tout seul, et revenir à *Tout* ou à *Pages* relâche le formulaire : les deux contrôles posent une seule question à deux niveaux de précision, et atteindre les fiches d'un formulaire reste à un clic. La sélection **se rétrécit avec les filtres** — agir sur une page qu'on a masquée est la surprise que cet écran existe pour éviter. Une seule liste ici, donc elle prend la **frappe directe** comme celle des formulaires ; la barre d'espace en est exclue, puisqu'elle appartient aux cases à cocher.

**L'action par lot porte deux intentions**, dans une seule modale, chacune avec sa description visible même non sélectionnée :

- **Remplacer les accès** — remplace les accès actuels par ceux définis ici ; les réglages actuels seront perdus. Chaque sens a « Ne pas changer » par défaut, pour ne toucher qu'à la lecture si c'est tout ce qu'on veut.
- **Donner accès** — ajoute des personnes et des groupes aux accès existants, **n'enlève l'accès à personne**. Présélectionné à l'ouverture : des deux, c'est celui qui ne détruit rien.

Le décompte porte l'explication, et c'est lui qui rend l'action compréhensible. Il annonce **ce qui change**, jamais la sélection entière — et quand il n'y a rien à changer, il le dit plutôt que de promettre un accès déjà détenu :

```
ⓘ @Bureau recevra l'accès en lecture à 23 pages.
    17 pages lui donnent déjà accès — rien à changer.

ⓘ Paul Riva a déjà accès en écriture à ces 3 pages : rien à changer.
```

Ce qui s'ajoute est un **accès à des pages**, jamais une page à une liste : les lignes de `PageAcl` sont l'affaire du wiki, et les nommer laisse le lecteur compter la mauvaise chose. Le bouton *Appliquer* lit le même décompte : il reste hors d'atteinte tant que le geste n'écrirait rien, plutôt que d'annoncer un succès sur des pages qu'il n'a pas touchées.

Sur une page ouverte à tout le monde ou aux personnes connectées, @Bureau **a déjà accès** : ne rien faire est le résultat correct, il suffit de le dire. Il n'y a pas d'action « Retirer l'accès » symétrique : sur une page publique, elle devrait restreindre l'accès de *tous* pour en priver un — un piège sous un nom rassurant. Révoquer largement se fait en supprimant le groupe, ou en remplaçant.

### La modale de droits d'une page

Ouverte depuis la **barre d'actions**, comme « Changer l'adresse » — poser des droits est une mutation, pas une vue, donc pas de handler `/{slug}/droits`. Identique pour une fiche, dont le `edit` est déjà occupé par le formulaire généré.

### Le type de descripteur `acl`

Le widget portée + liste devient un **type de champ du vocabulaire de descripteurs**, aux côtés de `page-list`, `icon` ou `view-picker`. Ce n'est pas un confort : les droits par champ vivent dans le panneau de paramétrage du FormBuilder, **généré par le renderer partagé** (ADR 0015). Une fois le type créé, la modale d'une page, l'onglet Droits d'un formulaire et le lot de `gerer-pages` le réutilisent.

## Application des droits

**Une seule porte** (ADR 0025). `lib/pages.ts` et `lib/forms.ts` deviennent le seul chemin vers `Page` et `Form`, et résolvent eux-mêmes l'acteur courant ; une règle ESLint interdit `prisma.page` et `prisma.form` ailleurs, avec des exceptions listées (seed, balayage). Même esprit que la vérification de descripteurs au `prebuild` (ADR 0013) : l'invariant est tenu par un outil, pas par la vigilance. Environ 33 appels directs, répartis dans six fichiers, sont à rapatrier — `app/form-actions.ts` en concentre les deux tiers.

Deux chemins **échappent** au contrôle, délibérément : `getLayoutContents()`, qui lit les cinq pages de layout à chaque rendu (c'est du chrome, pas du contenu — le soumettre aux droits ferait disparaître le menu pour les uns et pas pour les autres), et le seed, qui écrit sans acteur.

### Deux temps, jamais un chargement suivi d'un tri

```
SQL           → quelles pages, quelles fiches
Serveur, RAM  → quels champs à l'intérieur
Client        → ne reçoit que ce qu'il a le droit de voir
```

Le filtre est une clause `WHERE`, y compris pour `<EntriesView>` qui charge en masse :

```sql
WHERE p."readScope" = 'everyone'
   OR (p."readScope" = 'authenticated' AND $connecte)
   OR p."ownerUsername" = $username
   OR EXISTS (SELECT 1 FROM "PageAcl" a
              WHERE a."pageId" = p.id AND a.kind = 'READ'
                AND (a.username = $username OR a."groupSlug" = ANY($groupes)))
```

Sur une page publique, le premier prédicat suffit et le `EXISTS` n'est jamais exécuté. Compteurs, pagination et « effacer les filtres » d'`<EntriesView>` redeviennent justes mécaniquement, puisqu'ils travaillent sur ce qui est arrivé. Une zone liée à un champ non lisible rend vide, sans erreur — la règle « valeur absente → chaîne vide » de [`forms.md`](forms.md).

Le second temps est irréductiblement en mémoire : les droits par champ vivent dans `Form.schema`, du JSON qu'aucune clause SQL n'atteint.

### `/{slug}/raw`

Nouveau handler (l'équivalent du `/raw` de YesWiki) : le MDX en `text/plain` pour une page, le `data` en `application/json` pour une fiche. Miroir exact de `/api/render` — un service d'API dont la réponse est du HTML est porté par une `page.tsx` nue ; un handler de page dont la réponse est du texte brut est porté par un `route.ts`.

Il passe par la couche d'accès comme tout le reste, et **filtre les champs non lisibles avant de sérialiser** : sans ça, il court-circuiterait les droits par champ, qui n'existent qu'au rendu.

## Modèle de données

Toutes les tables restent dans le schéma `public` — pas de `multiSchema`.

```prisma
model User {              // généré par la CLI BetterAuth, étendu
  username String @unique // plugin username, motif slug
  name     String         // nom affiché
  image    String?        // avatar → files/
  // …
}

model Group {
  slug    String @id      // présenté @slug
  name    String
  members GroupMember[]
}

model GroupMember {
  groupSlug       String  // → Group.slug
  username        String? // → User.username   onUpdate: Cascade, onDelete: Cascade
  memberGroupSlug String? // → Group.slug      imbrication
}

model Page {
  ownerUsername String? // → User.username  onUpdate: Cascade, onDelete: SetNull
  readScope     Scope
  writeScope    Scope
  acls          PageAcl[]
}

model PageAcl {          // seulement pour la portée « seulement »
  pageId    String
  kind      PermKind     // READ | WRITE
  username  String?      // → User.username   onDelete: Cascade
  groupSlug String?      // → Group.slug      onDelete: Cascade
}

model Revision {
  authorUsername String? // → User.username  onUpdate: Cascade, onDelete: SetNull
}

model Settings {         // ligne unique ; premier occupant d'une table déjà prévue
  installedAt DateTime?
}
```

Les droits stockent des **usernames et des slugs de groupe**, jamais des id (ADR 0024). Le `onDelete` n'est pas le même partout, et c'est ce qui porte tout le poids : `Cascade` sur `PageAcl` et `GroupMember` (le droit disparaît avec la personne, c'est voulu), **`SetNull`** sur `Page.owner` et `Revision.author` (la même cascade détruirait des pages et des pans d'historique).

**Le balayage.** Un renommage de compte ou de groupe cascade en SQL sur toutes les colonnes portant une FK — mais aucune clé étrangère n'entre dans du JSON. Les droits par champ et les défauts d'un formulaire, qui vivent dans `Form.schema`, demandent donc un balayage applicatif, déclenché au renommage **et à la suppression**. Même facture que `lib/slug-rename-db.ts` et `lib/field-rename-db.ts` (ADR 0016/0017), à couvrir en test au même titre.

## Migration

| Objet | Devient |
| --- | --- |
| `Page.ownerName` / `Revision.authorName` = `"Anonyme"` | `ownerUsername` / `authorUsername` à `NULL` |
| Pages spéciales | attribuées au compte créé à l'installation |
| Pages d'exemple | sans propriétaire (« Anonyme ») |
| Droits de toutes les pages | les valeurs par défaut de `wiki.config.ts` |

Le wiki reste donc exactement aussi ouvert qu'avant la migration : ce sont les moyens de le fermer qui apparaissent, pas des restrictions.

## Hors périmètre v0.5 (backlog)

- **Limitation de débit et anti-abus** (pages, fiches et fichiers ensemble) — la v0.5 ne crée pas ce risque, elle donne le moyen de le fermer par les droits ; un wiki laissé ouvert reste exposé.
- **Droits sur les fichiers.** Le pool reste public : un fichier est accessible à qui connaît son adresse, quels que soient les droits de la page qui l'affiche. Les droits viendront avec la table des fichiers, qui naîtra pour la **galerie de gestion des fichiers** — le widget `acl` existera déjà.
- **Changer l'identifiant d'un groupe**, le geste de renommage de l'ADR 0016 appliqué à un slug de groupe : la cascade SQL suit les appartenances, mais pas le JSON des formulaires — c'est le même balayage applicatif que la suppression, à étendre une fois celui-ci en place. En v0.5, seul le nom affiché d'un groupe change.
- **« Demander l'accès »** depuis l'écran de refus : suppose un canal de notification et une file de demandes.
- **Commentaires**, avec leurs mentions `@username` dans du texte — celles-là relèveront de l'ADR 0016 et de sa réécriture de références, le texte ne se traitant pas comme une relation.
- **SMTP et droits par défaut en base**, quand `Settings` s'étoffera ; l'écran d'installation les accueillera sans être réécrit.
- **Row-Level Security** : la garantie la plus forte, écartée pour son coût de déploiement (transactions interactives, second rôle Postgres, politiques hors de Prisma Migrate) — voir ADR 0025.
