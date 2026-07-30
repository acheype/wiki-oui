# Utilisateurs & droits (spec WikiOui v0.5)

L'équivalent de la gestion des droits de YesWiki, refondue pour tenir sans documentation : un seul mode de paramétrage, des comportements généralisés, et une interface qui se suffit à elle-même.

ADR [0023](adr/0023-betterauth-authentifie-wikioui-autorise.md) (frontière authentification/autorisation), [0024](adr/0024-droits-par-username-et-slug.md) (ce que stockent les droits), [0025](adr/0025-couche-acces-gardee-par-eslint.md) (où le contrôle s'applique), [0026](adr/0026-defauts-recopies-jamais-lies.md) (les défauts se recopient), [0027](adr/0027-installation-drapeau-irreversible.md) (l'amorçage). Glossaire : [`../CONTEXT.md`](../CONTEXT.md).

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
Créer l'invitation  →  /invitation/{jeton}   (14 jours, usage unique)
                        │
        ┌───────────────┴───────────────┐
   SMTP configuré                 pas de SMTP
   le serveur l'envoie      l'admin copie le lien
                            et le transmet comme il veut
```

La personne choisit son nom affiché, son identifiant et son mot de passe. **Une seule primitive pour trois besoins** : invitation, « mot de passe oublié », et réinitialisation déclenchée par un administrateur. Le SMTP n'est donc jamais une dépendance de fonctionnement, seulement un confort d'acheminement.

**Invitation en masse** : un champ qui digère ce qui sort d'un client mail — virgules, points-virgules, retours à la ligne et la forme `Nom <adresse>`. Doublons fusionnés, adresses déjà titulaires d'un compte ou d'une invitation signalées sans être recréées. Un sélecteur « Ajouter aussi au groupe » évite la corvée qui suit toujours.

### Fin d'un compte

Deux gestes distincts, pour deux intentions qui n'ont rien à voir :

- **Désactiver** — le cas courant, « cette personne n'est plus des nôtres ». Connexion refusée, sessions révoquées, attribution intacte, réversible d'un clic. Filtre « Désactivés » dans la liste.
- **Supprimer** — la demande d'effacement. La modale annonce les nombres et propose de **réattribuer** les pages du compte. Puis un simple `DELETE` : `onDelete: SetNull` vide `ownerUsername` et `authorUsername`, `onDelete: Cascade` emporte les lignes de `PageAcl` et de `GroupMember`.

Un contenu sans propriétaire ni auteur identifié s'affiche **« Anonyme »**, quelle qu'en soit la raison — antérieur aux comptes, écrit par un visiteur sur un wiki ouvert, ou compte effacé. Le wiki ne distingue pas ces cas : il n'en ferait rien, et se taire sert mieux un effacement demandé que de signaler qu'il a eu lieu.

Une page sans propriétaire n'est modifiable que par les administrateurs — conséquence mécanique de l'invariant, sans règle supplémentaire.

### Écran d'installation

Tant que le wiki n'a **jamais été installé**, toute route redirige vers `/installation` (ADR 0027). L'écran impose le nom affiché **Wiki Admin** et l'identifiant **`wiki-admin`** — convention identique sur toutes les installations WikiOui — et ne demande que l'email et le mot de passe. Il crée le compte, l'ajoute à `@Admins`, lui attribue les pages spéciales, et pose `Settings.installedAt`.

La condition est **irréversible** : vider `@Admins` ne rouvre pas l'écran. Reprendre la main sans administrateur exige un accès à la machine, pas une requête HTTP.

## Groupes

Un groupe contient des **utilisateurs et/ou d'autres groupes**, sans limite de profondeur. Les cycles sont refusés à l'enregistrement, avec le chemin nommé : « @Rédacteurs contient déjà @Bureau, via @Trésorerie. »

`@Admins` est protégé comme une page spéciale : ni supprimable, ni renommable, **jamais vide** (retirer le dernier administrateur est refusé), et il **n'accepte que des personnes** — son sélecteur ne propose pas de groupes, avec la note « ⓘ Ce groupe n'accepte que des personnes — on ne devient pas administrateur en étant membre d'un autre groupe. » Aucun message d'erreur : l'état est rendu impossible, pas rattrapé.

Créer et modifier un groupe est réservé aux administrateurs en v0.5.

Les **groupes effectifs** d'un acteur (imbrication résolue) sont calculés par une requête récursive, une fois par requête HTTP, mémoïsée par le `cache()` de React — le motif déjà employé par `lib/pages.ts`. Jamais mis en session : retirer quelqu'un d'un groupe doit prendre effet immédiatement, pas au renouvellement de sa session.

## Le droit

```
Qui peut voir cette page ?
  ( ) Tout le monde
  ( ) Les personnes connectées
  (•) Seulement :
      ┌────────────────────────────────┐
      │ ● Marie Durand           ×     │
      │ @ Rédacteurs             ×     │
      │ + Ajouter une personne…        │
      └────────────────────────────────┘
  ⓘ Le propriétaire et les administrateurs ont toujours accès.
```

- **Pas de portée « Administrateurs ».** La mettre au même rang laisserait croire que les autres les excluent. Leur accès est un invariant, énoncé par la note.
- **Le propriétaire est un plancher**, pas une case à cocher. Une portée *seulement* à liste vide dit donc « le propriétaire et les administrateurs seulement ».
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

Ces réglages vivent dans un **troisième onglet « Droits »** du FormBuilder, à côté de « Champs » et « Gabarit » — pas en bas du canvas, qui est la cible du drag & drop.

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
│ 🔎 Rechercher par nom…                                     │
│ Type  (•) Tout  ( ) Pages  ( ) Fiches                      │
│ Formulaire  [ Tous ▾ ]                                     │
└────────────────────────────────────────────────────────────┘
   Page                     Propriétaire    Voir         Modifier
☑  accueil                  Jean Martin     🌍 Tous      🔒 Lui seul
☑  compte-rendu-ag-2026     Marie Durand    👤 Connectés 🔒 +2
☐  assemblee-generale  ⌗AG  Jean Martin     🌍 Tous      🔒 @Bureau
☐  contact             ⌗Contact  —          🌍 Tous      🔒 Admins

2 sélectionnées   [ Modifier les droits… ]  [ Changer le propriétaire… ]
```

Le marqueur `⌗Formulaire` distingue une fiche d'une page sans colonne de plus.

**L'action par lot porte deux intentions**, dans une seule modale, chacune avec sa description visible même non sélectionnée :

- **Remplacer les droits** — les pages auront exactement ce qui est choisi ; leurs réglages actuels sont perdus. Chaque sens a « Ne pas changer » par défaut, pour ne toucher qu'à la lecture si c'est tout ce qu'on veut.
- **Donner accès** — ajoute des personnes et des groupes aux droits existants, **n'enlève l'accès à personne**. Présélectionné à l'ouverture : des deux, c'est celui qui ne détruit rien.

Le décompte porte l'explication, et c'est lui qui rend l'action compréhensible :

```
ⓘ @Bureau pourra voir les 40 pages.
    23 pages   ajouté à la liste
    17 pages   y donnent déjà accès — rien à changer
```

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
- **« Demander l'accès »** depuis l'écran de refus : suppose un canal de notification et une file de demandes.
- **Commentaires**, avec leurs mentions `@username` dans du texte — celles-là relèveront de l'ADR 0016 et de sa réécriture de références, le texte ne se traitant pas comme une relation.
- **SMTP et droits par défaut en base**, quand `Settings` s'étoffera ; l'écran d'installation les accueillera sans être réécrit.
- **Row-Level Security** : la garantie la plus forte, écartée pour son coût de déploiement (transactions interactives, second rôle Postgres, politiques hors de Prisma Migrate) — voir ADR 0025.
