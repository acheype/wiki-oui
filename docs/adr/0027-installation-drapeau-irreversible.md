# L'écran d'installation est gardé par un drapeau irréversible, pas par l'absence d'administrateur

Tant que le wiki n'a **jamais été installé**, toute route redirige vers `/installation`, qui crée le compte administrateur initial. La condition est un drapeau posé une fois pour toutes (`Settings.installedAt`), **pas** le test « existe-t-il un administrateur ? ».

## Contexte

Un test réversible ferait de l'écran un **chemin d'escalade** : quiconque parviendrait à vider `@Admins` — par un bug d'autorisation, non par le produit, où retirer le dernier administrateur est refusé — n'aurait plus qu'à recharger la page d'accueil pour se nommer administrateur. Le drapeau transforme cette porte en porte à sens unique.

Aucun fait irréversible n'était disponible ailleurs. « Un administrateur existe » et « un compte existe » se défont tous deux. Le compteur de pages est bien irréversible (l'ADR 0021 s'appuie dessus : les pages spéciales étant non supprimables, il ne retombe jamais à zéro) mais il est vrai **dès le seed**, donc avant l'installation. Un fichier témoin dans `files/` dépendrait d'un volume dont le montage est une étape manuelle chez Dokploy : l'oublier rouvrirait la faille sans que personne ne le sache.

## Considered Options

**`ADMIN_EMAIL` + `ADMIN_PASSWORD` en variables d'environnement.** Pratique établie et scriptable, mais elle oblige le seed à créer le compte, donc à appeler l'API de BetterAuth pour le hachage — ce qui ajoute `better-auth` au `node_modules` isolé de `docker/deploy-tools` (point de synchronisation manuel déjà signalé comme fragile par l'ADR 0021) et impose à `lib/auth.ts` de rester importable hors Next pour toujours, sous peine de casser le démarrage du conteneur.

**Un lien d'invitation imprimé dans les logs.** Aucun secret en environnement, mais il faut ouvrir les logs — ce que l'écran d'installation existe précisément pour éviter.

L'écran, lui, tourne **dans Next** avec BetterAuth au complet : le seed reste un script de données pur, et ni variable ni log ne sont nécessaires.

## Consequences

- **Une fenêtre de course** est acceptée : entre le déploiement et la première visite, quiconque connaît l'URL peut devenir l'administrateur. C'est le compromis de Gitea, Nextcloud et WordPress ; la fenêtre dure le temps du premier clic, sur un domaine pas encore publié.
- Le compte créé porte le nom **Wiki Admin** et l'identifiant **`wiki-admin`**, imposés — convention identique sur toutes les installations, qui permet à un support de dire « connectez-vous en `wiki-admin` » sans rien demander. Rien n'est figé pour autant : le nom se change depuis le profil, l'identifiant par le geste de renommage, et le compte se supprime une fois un autre administrateur en place.
- L'ordre du seed se résout de lui-même : les pages spéciales naissent **sans propriétaire**, et l'installation les attribue au compte qu'elle vient de créer.
- Si tous les administrateurs disparaissent réellement, la récupération passe par une commande **sur le serveur**, jamais par HTTP — reprendre la main exige un accès à la machine, ce qui est le bon niveau d'exigence.
- `Settings` naît ici, avec une seule colonne. Ce n'est pas une table jetable : c'est le premier occupant de la table déjà prévue au backlog pour le SMTP, le titre du site et les droits par défaut éditables à chaud — qui descendront dedans sans seconde migration ni renommage.
