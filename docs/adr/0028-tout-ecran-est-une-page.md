# Tout écran est une page WikiOui ; `/api` est le seul segment réservé

Un écran de WikiOui — connexion, administration, saisie — est une **page spéciale** dont le contenu appelle un **composant intégré**. Il n'existe **aucune route dans `app/`** en dehors du rendu des pages et du segment réservé `/api` (ADR 0012), qui abrite les deux écrans qui ne peuvent pas être des pages : l'aperçu du ComponentBuilder et l'**écran d'installation**, ce dernier atteint par **réécriture** depuis n'importe quelle adresse — si bien que `installation` reste un slug ordinaire.

## Contexte

WikiOui n'a qu'un espace de noms d'URL : celui des slugs de pages (ADR 0001). `/{slug}` affiche une page, `/{slug}/{handler}` une de ses vues. Une route ajoutée dans `app/` prélève donc un slug sur cet espace **sans que rien ne le dise** : la page ainsi nommée s'écrit en base et ne s'ouvre jamais, la route répondant la première. Le seul segment que le projet ait jamais réservé est `api`, et l'ADR 0012 s'en félicitait explicitement (« aucun slug réservé supplémentaire ») — l'écran d'installation de la v0.5 avait pourtant pris `/installation` au passage, sans que la question soit posée.

La v0.5 a pourtant livré quatre écrans de comptes en routes natives (`app/connexion`, `app/inscription`, `app/mot-de-passe-oublie`, `app/invitation/[token]`), au motif que « se connecter n'est pas du contenu ». Le raisonnement passait à côté de trois choses : quatre slugs devenaient inutilisables en silence ; `/invitation/{jeton}` plaçait un jeton là où une page lit un **handler** ; et l'ADR 0014 avait déjà tranché la question en refusant des routes `/admin` pour les écrans de formulaires — « l'écran vit dans le wiki, son hébergement est éditable ».

Cette décision existait donc en creux, dispersée entre l'ADR 0012, l'ADR 0014 et le glossaire. Elle est écrite ici, seule, pour être trouvée avant d'être enfreinte.

## Décision

- **Un écran nouveau = une page spéciale + un composant intégré.** Le slug rejoint `wiki.config.ts` (seedé, non supprimable, non renommable, éditable), le composant `components/wiki/` — c'est le motif de `formulaires`, `fiches`, `gerer-utilisateurs`, et depuis la v0.5 de `connexion`, `inscription`, `mot-de-passe-oublie` et `invitation`.
- **Ce dont l'écran a besoin voyage dans la query string**, jamais dans un segment : `?suite=` pour la destination d'après-connexion, `?jeton=` pour le lien à usage unique, comme `?id=` et `?formulaire=` avant eux. Derrière le slug d'une page, un segment est un handler — il n'y a pas de place pour autre chose.
- **`api` est le seul segment réservé**, seul slug que `lib/slug.ts` refuse à une page. Un écran qui doit répondre **avant** qu'aucune page ne soit lisible ne peut pas être une page : l'installation s'y abrite donc, à côté de l'aperçu du ComponentBuilder — le précédent d'une `page.tsx` nue sous `/api` date de l'ADR 0012.
- **L'installation est présentée par réécriture, pas par redirection** : tant que le drapeau n'est pas posé, le proxy réécrit *n'importe quelle* adresse vers `/api/installation`. Le visiteur garde l'adresse qu'il a demandée, personne n'a à connaître celle de l'écran — et surtout `installation` n'est **pas** un slug réservé : la page que quelqu'un nommera ainsi s'ouvrira normalement dès le wiki installé, l'écran ayant alors cessé d'exister.
- **La liste est gardée par un test** (`app/routes.test.ts`) : un quatrième dossier sous `app/` fait rougir la suite, avec la marche à suivre dans le message, et le même test fixe que `api` est le seul slug refusé.

## Conséquences

- Un écran est **éditable, donc cassable** : vider `connexion` de son `<SignIn />` met le formulaire hors d'atteinte. Réparable en réécrivant la page — ou en la restaurant depuis son historique, qui reste celui d'une page. C'est le prix déjà consenti par l'ADR 0014, et il n'y a pas de demi-mesure : une page que le wiki protégerait de son propriétaire ne serait plus une page.
- Les pages de comptes doivent rester **lisibles par tout le monde** quand les droits de lecture arriveront : la connexion doit répondre là où le contenu refuse. C'est un invariant du même ordre que l'accès des administrateurs, pas un droit posé sur la page.
- Le chrome du site (titre, menu, pied de page) entoure désormais la connexion. C'est voulu : on se connecte **dans** le wiki, pas dans une application posée à côté.
- Les handlers de page valent sur ces pages comme sur les autres (`/connexion/edit`, `/connexion/revisions`) et portent sur leur MDX — assumé, comme pour `formulaires` (ADR 0014).
- Le contenu MDX ne reçoit pas les paramètres d'URL de la page hôte : un composant intégré les lit **côté client** (`useSearchParams`, d'où la limite `Suspense`) et résout en base par **Server Action** ce qu'il doit résoudre — la lecture du jeton d'invitation, dans le prolongement de l'ADR 0014.
- Ajouter un écran à une version déjà installée n'ajoute pas la page : le seed ne rejoue pas sur une base peuplée (ADR 0021). Une page spéciale nouvelle demande donc une migration de données, ou la main de l'opérateur.
- Une Server Action traverse la réécriture (vérifié) : le formulaire d'installation poste sur l'adresse que le visiteur a demandée, et l'action s'exécute. `/api/installation` répond donc à deux conditions cumulées — le drapeau absent, et le proxy pour l'imposer — et redirige vers l'accueil sitôt le wiki installé.
