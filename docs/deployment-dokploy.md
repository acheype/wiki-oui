# Déployer WikiOui sur un VPS avec Dokploy

Ce guide s'adresse à quiconque veut mettre en ligne un WikiOui sur son propre serveur, sans connaissances système poussées. Aucune ligne de code à écrire : tout se passe dans l'interface web de [Dokploy](https://dokploy.com), une plateforme d'hébergement auto-hébergée et open source (build depuis Git, certificats HTTPS automatiques, bases de données en un clic).

À la fin de ce guide, vous aurez un wiki accessible publiquement, en HTTPS, sur votre propre nom de domaine — pour l'installation destinée aux développeurs (contribuer au code), voir plutôt le [`README`](../README.md).

**Durée estimée** : 30 à 45 minutes. **Prérequis** : un VPS (voir ci-dessous) et, si possible, un nom de domaine déjà acheté chez un registrar (OVH, Gandi, Infomaniak…) — ce guide fonctionne aussi sans domaine, en accédant au wiki par l'adresse IP.

## 1. Choisir un VPS

Dokploy lui-même ne demande que 2 Go de RAM, mais la compilation de WikiOui (une application Next.js) est plus gourmande à la construction : nous recommandons **2 vCPU et 4 Go de RAM** au minimum. Sur une offre à 2 Go, ajoutez un [fichier d'échange (swap)](https://doc.ubuntu-fr.org/swap) de 2 Go avant l'installation pour éviter un plantage du build par manque de mémoire.

Quelques fournisseurs proposant une offre 2 vCPU / 4 Go adaptée :

| Fournisseur | Offre | Prix indicatif |
| --- | --- | --- |
| [Hetzner](https://www.hetzner.com/cloud/) | CX22 (2 vCPU, 4 Go, 40 Go NVMe) | ≈ 4,50 €/mois |
| [OVHcloud](https://www.ovhcloud.com/fr/vps/) | VPS-1 (2 vCPU, 4 Go) | ≈ 4,50 €/mois (engagement annuel) |
| [Infomaniak](https://www.infomaniak.com/fr/hebergement/vps-lite) | VPS Lite 2 vCPU / 4 Go | ≈ 7,50 €/mois (facturé en CHF) |
| [Scaleway](https://www.scaleway.com/fr/pricing/virtual-instances/) | BASIC2-A2C-4G (2 vCPU, 4 Go) | ≈ 17 €/mois |

*Tarifs indicatifs relevés en juillet 2026, hors taxes, à vérifier sur le site du fournisseur au moment de la commande — les grilles tarifaires évoluent régulièrement.*

Choisissez une image **Ubuntu** récente (22.04 ou 24.04 LTS) — c'est le système le plus largement testé avec Dokploy.

## 2. Préparer le serveur

Connectez-vous en SSH à votre VPS (l'hébergeur vous fournit l'adresse IP et un mot de passe ou une clé, généralement par e-mail) :

```bash
ssh root@votre-ip-de-vps
```

Mettez le système à jour :

```bash
apt update && apt upgrade -y
```

Si votre VPS n'a que 2 Go de RAM, ajoutez un fichier d'échange de 2 Go (à sauter si vous avez 4 Go ou plus) :

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Installer Dokploy

Une seule commande installe Dokploy et tout ce dont il a besoin (Docker, Docker Swarm, Traefik) :

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

L'installation prend 3 à 5 minutes. Assurez-vous au préalable que les ports **80**, **443** et **3000** ne sont utilisés par aucun autre service.

Une fois terminée, ouvrez dans votre navigateur :

```
http://votre-ip-de-vps:3000
```

La page d'accueil de Dokploy vous invite à créer le compte administrateur (e-mail + mot de passe) : c'est ce compte qui vous servira à vous reconnecter par la suite.

## 4. Créer un projet

Dans Dokploy, tout se range dans un **Projet**, qui contient un ou plusieurs **services** (une base de données, une application…).

1. Cliquez sur **Create Project**, donnez-lui un nom (ex. `wikioui`).
2. Ouvrez le projet : vous arrivez dans son environnement **production**, où vous allez ajouter les services des étapes suivantes.

## 5. Mettre en place PostgreSQL

WikiOui a besoin d'une base PostgreSQL. Deux façons de l'obtenir :

### Voie A — recommandée : PostgreSQL géré par Dokploy

1. Dans le projet, cliquez sur **Add Service** → **Database** → **PostgreSQL**.
2. Renseignez un nom (ex. `wikioui-db`), un nom de base de données, un utilisateur et un mot de passe (ou laissez Dokploy en générer).
3. Cliquez sur **Deploy** : Dokploy provisionne le conteneur Postgres.
4. Une fois le service démarré, récupérez la **chaîne de connexion interne** (visible dans l'onglet du service, sous une forme proche de `postgresql://utilisateur:motdepasse@wikioui-db:5432/nomdebase`) — c'est cette adresse qui joint la base *depuis les autres services Dokploy*, sans passer par Internet. Gardez-la de côté, elle servira à l'étape 6.

Dokploy gère pour vous le réseau interne et peut sauvegarder cette base automatiquement.

### Voie B — alternative : PostgreSQL installé nativement sur le VPS

Pour celles et ceux qui préfèrent garder PostgreSQL hors de Docker, installé directement sur le serveur :

```bash
apt install -y postgresql
sudo -u postgres psql -c "CREATE USER wikioui WITH PASSWORD 'un-mot-de-passe-solide';"
sudo -u postgres psql -c "CREATE DATABASE wikioui OWNER wikioui;"
```

Le conteneur de l'application, lui, tourne dans le réseau Docker de Dokploy — il ne peut donc pas joindre `localhost` du serveur directement. Il faut autoriser les connexions depuis le réseau Docker :

1. Dans `/etc/postgresql/*/main/postgresql.conf`, mettez `listen_addresses = '*'`.
2. Dans `/etc/postgresql/*/main/pg_hba.conf`, ajoutez une ligne autorisant le sous-réseau Docker (visible via `docker network inspect dokploy-network`, champ `Subnet`), par exemple :
   ```
   host    wikioui    wikioui    172.20.0.0/16    md5
   ```
3. Redémarrez PostgreSQL : `systemctl restart postgresql`.
4. Ouvrez le pare-feu **uniquement** pour ce sous-réseau, jamais pour Internet : `ufw allow from 172.20.0.0/16 to any port 5432`.

Cette voie demande un peu plus d'aisance réseau — c'est pourquoi la voie A est recommandée par défaut.

## 6. Déployer WikiOui

Toujours dans le projet, cliquez sur **Add Service** → **Application**.

1. **Source** : Git, dépôt `https://github.com/acheype/wiki-oui`, branche `main`.
2. **Build type** — deux options :

### Voie principale — avec Dockerfile (recommandée)

Le dépôt contient un `Dockerfile` prêt à l'emploi. Sélectionnez le type de build **Dockerfile** et laissez les valeurs par défaut (`Dockerfile Path` = `Dockerfile`, `Docker Context Path` = `.`).

### Voie alternative — sans Dockerfile (Nixpacks)

Si vous préférez laisser Dokploy détecter et construire l'application lui-même : sélectionnez le type de build **Nixpacks** (c'est d'ailleurs le type par défaut), puis, dans l'onglet **Environment Variables** de l'application, ajoutez :

```
NIXPACKS_INSTALL_CMD=corepack enable && corepack install && pnpm install --frozen-lockfile
NIXPACKS_BUILD_CMD=pnpm prisma generate && pnpm build
NIXPACKS_START_CMD=pnpm prisma migrate deploy && SEED_ONLY_IF_EMPTY=1 pnpm prisma db seed && pnpm start
```

Cette voie construit une image plus simple (elle réinstalle l'ensemble des dépendances à chaque build, y compris celles qui ne servent qu'au développement), mais évite d'avoir à comprendre le contenu du `Dockerfile`.

### Variables d'environnement

Dans l'onglet **Environment Variables** de l'application, ajoutez la chaîne de connexion à la base (celle de l'étape 5), le secret qui signe les sessions et l'adresse publique du wiki :

```
DATABASE_URL=postgresql://utilisateur:motdepasse@wikioui-db:5432/nomdebase
BETTER_AUTH_SECRET=collez-ici-le-resultat-de-openssl-rand-base64-32
BETTER_AUTH_URL=https://wiki.mondomaine.fr
```

Générez le secret sur votre machine avec `openssl rand -base64 32`, et **conservez-le** : le changer déconnecte tout le monde. Sans lui, le conteneur refuse de démarrer plutôt que de signer les sessions avec une valeur devinable. `BETTER_AUTH_URL` est l'adresse à laquelle vos utilisateurs ouvrent le wiki (étape 7) : les tentatives de connexion venues d'une autre origine sont refusées, et c'est aussi l'adresse que portent les liens d'invitation, puisqu'ils sortent du wiki.

### Envoi des courriels : facultatif

Les comptes naissent d'une **invitation**, c'est-à-dire d'un lien à usage unique. L'envoyer par courriel n'est qu'un mode de livraison : sans serveur d'envoi, l'administrateur voit le lien à l'écran, le copie et le transmet comme il veut — le wiki fonctionne entièrement sans. Pour que le wiki les envoie lui-même, reprenez les réglages que votre hébergeur de messagerie vous donne :

```
SMTP_HOST=smtp.mondomaine.fr
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=wiki@mondomaine.fr
SMTP_PASS=le-mot-de-passe
SMTP_FROM=WikiOui <wiki@mondomaine.fr>
```

`SMTP_HOST` suffit à activer l'envoi, le reste se déduit : le port vaut **587** par défaut, et `SMTP_SECURE` vaut **true** sur le port 465 (chiffré dès le premier octet) et **false** ailleurs (chiffrement négocié par STARTTLS). `SMTP_USER` et `SMTP_PASS` ne servent qu'aux serveurs qui demandent une authentification — c'est le cas général. Le mot de passe s'écrit tel quel, sans encodage.

Avec ces réglages, le «&nbsp;mot de passe oublié&nbsp;» devient autonome ; sans eux, cette page renvoie vers un administrateur. **Si un envoi échoue** — mot de passe refusé, port fermé, certificat invalide — l'interface le dit au lieu de laisser croire au départ du courriel : l'administrateur voit le message exact du serveur sous «&nbsp;Détail de l'erreur d'envoi&nbsp;», et la même ligne part dans les journaux du conteneur (`[wikioui] SMTP — …`), seule trace disponible quand personne n'était devant l'écran.

### Fichiers uploadés : le volume persistant

WikiOui stocke les fichiers déposés par les utilisatrices et utilisateurs (images, PDF…) dans un dossier `files/` sur disque, en dehors de la base — il faut donc qu'il **survive aux redéploiements**. Dans l'onglet **Advanced** de l'application, section **Mounts**, ajoutez un **Volume Mount** :

- **Mount Path** : `/app/files`
- **Volume Name** : `wikioui-files` (ou tout autre nom)

Sans ce volume, chaque nouveau déploiement repartirait d'un dossier `files/` vide, cassant les images des pages existantes.

### Déployer

Cliquez sur **Deploy**. Dokploy clone le dépôt, construit l'image, puis démarre le conteneur.

À chaque démarrage, le conteneur :

1. applique les migrations de base de données (`prisma migrate deploy`) — uniquement celles qui manquent, jamais destructif ;
2. au **tout premier** démarrage seulement, quand la base est encore vide, **seed** la base — crée les pages structurelles du wiki (page d'accueil, menu, aide-mémoire…) ainsi que quelques formulaires et fiches d'exemple pour découvrir WikiOui.

> **Le seed ne s'exécute qu'une seule fois, sur une base vide.** Dès que la base contient du contenu, il est ignoré à chaque démarrage suivant. Vous pouvez donc **supprimer sans crainte les pages, fiches et formulaires d'exemple** : ils ne réapparaîtront pas au prochain redéploiement. Un redéploiement ne réinitialise ni ne recrée jamais la base de données ([ADR 0021](adr/0021-docker-standalone-migrate-seed-on-start.md)).

Une fois le déploiement terminé, testez l'accès temporaire par IP :

```
http://votre-ip-de-vps:PORT_ATTRIBUÉ_PAR_DOKPLOY
```

(le port exact est indiqué dans l'onglet **Domains** de l'application, avant même de configurer un nom de domaine).

## 7. Nom de domaine et HTTPS

1. Chez votre registrar, créez un enregistrement DNS de type **A** pointant votre domaine (ou sous-domaine, ex. `wiki.mondomaine.fr`) vers l'**adresse IP du VPS**. Cette propagation peut prendre de quelques minutes à quelques heures.
2. Dans Dokploy, ouvrez l'application, onglet **Domains**, et ajoutez :
   - **Host** : votre nom de domaine (ex. `wiki.mondomaine.fr`)
   - **Container Port** : `3000` (le port sur lequel WikiOui écoute à l'intérieur du conteneur)
   - **HTTPS** : activé, **Certificate** : `letsencrypt`
3. Enregistrez. Dokploy provisionne automatiquement un certificat Let's Encrypt — **assurez-vous que le DNS pointe déjà vers le serveur avant cette étape**, sinon la génération du certificat échoue (il suffit alors de recréer le domaine une fois le DNS propagé).

Votre wiki est maintenant accessible sur `https://wiki.mondomaine.fr`.

## 8. Vérifier et maintenir l'installation

- **Installer le wiki** : à la toute première visite, quelle que soit l'adresse demandée, le service d'installation s'affiche. Il crée le compte administrateur : il ne vous demande qu'une adresse e-mail et un mot de passe, le nom affiché (« Wiki Admin ») et l'identifiant (`wiki-admin`) étant les mêmes sur toutes les installations WikiOui. Faites-le **dès la fin du déploiement** : tant que personne ne l'a fait, le premier visiteur venu le peut. Une fois installé, ce service n'existe plus définitivement ([ADR 0027](adr/0027-installation-drapeau-irreversible.md)).
- **Ouvrir le wiki** : la page d'accueil (« page-principale ») s'affiche avec un message de bienvenue et des liens vers l'aide-mémoire et un bac à sable pour s'exercer.
- **Mettre à jour** : un nouveau `git push` sur la branche suivie, ou un clic sur **Deploy** dans Dokploy, reconstruit l'image et relance le conteneur — migrations et seed rejoués sans danger (voir l'étape 6).
- **Sauvegarder** : deux éléments à sauvegarder régulièrement — un export de la base (`pg_dump`, automatisable depuis l'onglet **Backups** du service PostgreSQL en voie A) et le contenu du volume `/app/files`.

## 9. Dépannage

- **Le build échoue, le serveur semble à court de mémoire** — ajoutez un fichier d'échange (étape 2) ou passez à une offre avec plus de RAM.
- **Le conteneur redémarre en boucle juste après « Applying pending database migrations » ou « Seeding »** — vérifiez `DATABASE_URL` (onglet Environment Variables) : la base est-elle démarrée, le mot de passe est-il correct, le nom d'hôte correspond-il bien au nom du service PostgreSQL (voie A) ou au sous-réseau autorisé (voie B) ?
- **Le certificat HTTPS ne se génère pas** — vérifiez que l'enregistrement DNS pointe bien vers l'IP du VPS (`dig votre-domaine`), puis recréez le domaine dans Dokploy.
- **Les images des fiches d'exemple ne s'affichent plus après un redéploiement** — signe que le volume `/app/files` n'a pas été configuré (étape 6) ; ajoutez-le, puis redéployez.
