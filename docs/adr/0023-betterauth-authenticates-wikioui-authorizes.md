# BetterAuth authentifie, WikiOui autorise

L'authentification (comptes, sessions, mots de passe, jetons) est déléguée à **BetterAuth** via l'adaptateur Prisma ; l'autorisation (groupes, propriété, droits de lecture et d'écriture) est **entièrement du code WikiOui**. Aucun plugin d'autorisation de BetterAuth n'est utilisé : la bibliothèque sait *qui vous êtes*, elle ne sait rien de *ce que vous avez le droit de faire*.

## Considered Options

**Plugin `admin`.** Il apporte un champ `role` et un mécanisme de bannissement. Mais WikiOui pose que l'administration est une **appartenance au groupe `@Admins`**, pas un rôle — l'adopter donnerait deux sources de vérité sur « qui est admin », et le premier désaccord entre elles serait un trou de sécurité silencieux.

**Plugin `organization`.** Il modélise des organisations avec membres, rôles et invitations : ressemblant de loin à nos groupes, mais il n'imbrique pas les groupes, ignore nos portées, et impose son vocabulaire (owner/admin/member) au milieu du nôtre. On paierait une abstraction pour la contourner.

**Plugin `username` : retenu.** C'est de l'authentification, pas de l'autorisation. Il apporte le champ unique et normalisé dont les droits ont besoin comme identité stable, et permet la connexion par identifiant en plus de l'email. On lui passe un `usernameValidator` imposant le motif de slug du projet.

Même raisonnement qu'en v0.3, où aucune bibliothèque de form-builder n'a été introduite (ADR 0014/0015) : une abstraction tierce n'est un gain que si elle épouse le modèle, pas si le modèle doit se plier à elle.

## Consequences

- Le schéma des tables `user`, `session`, `account`, `verification` est **généré par la CLI BetterAuth** et régénéré à chaque montée de version. Tout ce que WikiOui y ajoute (`username`) passe par `user.additionalFields`, déclaré dans la config d'auth — donc régénéré correctement, pas écrasé.
- Toutes les tables restent dans le schéma `public` : pas de `multiSchema`. Un dump sans secrets se fait en énumérant les tables de BetterAuth (`--exclude-table-data`), liste à tenir à jour si un plugin en ajoute.
- Le seed reste **exempt de BetterAuth** : le service d'installation (ADR 0027) crée le compte administrateur depuis Next, où la bibliothèque est complète. Le `node_modules` isolé de `docker/deploy-tools` (ADR 0021) n'a donc pas à l'embarquer, et `lib/auth.ts` n'a pas de contrainte d'importabilité hors Next.
