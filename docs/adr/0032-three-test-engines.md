# Trois moteurs de test, du moins cher au plus fidèle : jsdom, mode navigateur, Playwright de bout en bout

Le dépôt ne savait tester ni une **interaction**, ni un **parcours**. Les tests de composants passaient par `renderToPipeableStream` : un rendu serveur vers une chaîne, sans DOM ni événement — tout ce qui est vrai *après* l'hydratation (clic, clavier, focus, mise en page) échappait à la suite. Et rien ne traversait l'application en marche — serveur Next, base, authentification — de bout en bout ; le dépôt n'avait même pas de CI (issue #31).

L'issue #34 a ouvert une première porte : jsdom et Testing Library, avec 25 tests sur deux champs (`components/fields/tags-input.test.tsx`, `suggestion-input.test.tsx`). Mais jsdom simule le DOM sans moteur de rendu : il ne calcule ni CSS, ni géométrie, ni focus réel, ni timing. Il a déjà montré sa limite — un test de sortie de champ échouait parce que Tab n'avait aucun élément où aller, donc `relatedTarget` valait `null`.

Cet ADR fixe la stratégie de test dans son ensemble, le long d'une **échelle du moins cher au plus fidèle** :

- **jsdom** pour la logique — DOM simulé, rapide, sans moteur de rendu ;
- **le mode navigateur de Vitest** pour la fidélité d'un composant monté — vrai Chromium, géométrie et focus réels ;
- **Playwright de bout en bout** pour un parcours à travers l'application en marche — vrai serveur, vraie base.

Les deux premiers testent un **composant**, le troisième teste l'**application**. Chaque test prend le moteur le moins cher qui atteint ce qu'il vérifie. Deux chantiers ont posé cette échelle (voir plus bas) : les tests de composant d'abord, le bout en bout et la CI ensuite.

## Contexte

Ce que jsdom ne peut pas vérifier, relevé au fil du chantier de la modale inline (#28, #29, #30) :

- la géométrie et le CSS calculé — position, largeur, débordement, confinement d'un gabarit en `position: fixed` (#29) ;
- le focus réel — `relatedTarget`, piège de focus, ordre de Tab ;
- le timing réel — débounce, préchargement au survol ;
- une bibliothèque qui exige un vrai moteur de rendu — carte Leaflet, éditeur CodeMirror, barre de progression d'upload.

Ce sont exactement les points les plus incertains du projet, et `architecture.md` pose que **l'ergonomie est prioritaire** : la fidélité du rendu est une valeur affichée, pas un détail.

Le dépôt était en Vitest 4.1.10. Le mode navigateur, stable depuis Vitest 4 (« removing the `experimental` tag from Browser Mode »), n'y est pourtant **pas câblable** : la 4.1.10 a retiré le `provider` en chaîne et réclame une factory du paquet `@vitest/browser-playwright`, qui n'existe qu'en 5.x et tire `@vitest/browser@5` — lequel importe de `vitest/node` un export absent de la 4.1.10. Le mode navigateur supporté vit donc en Vitest 5, et le dépôt y monte.

À l'échelle du parcours, le manque est d'un autre ordre : aucun test ne traversait l'application en marche (serveur, base, authentification), et le dépôt n'avait aucune CI. Le troisième moteur — Playwright de bout en bout — et la CI répondent à ce manque (volet e2e, tranché plus bas).

## Options considérées

**jsdom seul.** Le plus rapide, mais rate exactement les points qui ont justifié #31. Écarté : il vide le ticket de son but.

**Playwright autonome.** Vrai navigateur, mais un second outil, un second style de test, une seconde config à côté de Vitest. Réservé au chantier e2e, où il est le bon outil (il pilote un serveur, pas un composant monté).

**Mode navigateur de Vitest, pile unique.** On retire jsdom, tout test de composant tourne dans le navigateur. Une seule façon d'écrire un test, mais tout test de logique paie le coût du navigateur — plus lent que jsdom. Écarté : la vitesse de la boucle quotidienne est une contrainte.

**Hybride par le coût (retenu).** Chaque test tourne sur le moteur le moins cher qui le supporte : jsdom pour la logique, navigateur pour la fidélité.

## Décision — les tests de composant (jsdom + mode navigateur)

- **Hybride par le coût.** jsdom est le moteur par défaut, rapide. On monte sur le navigateur **seulement** si l'assertion porte sur l'une de ces quatre choses : (1) la géométrie ou le CSS calculé, (2) le focus réel, (3) le timing réel, (4) une bibliothèque qui exige un vrai moteur de rendu. Tout le reste — structure DOM, rôles et noms ARIA, logique clavier, rendu conditionnel, rappels — reste sur jsdom.
- **Le navigateur, c'est le mode navigateur de Vitest 5**, pas Playwright autonome : `vitest@5`, `@vitest/browser`, la factory `playwright()` de `@vitest/browser-playwright`, `playwright`, rendu React par `vitest-browser-react`, Chromium **headless**. Un seul navigateur : on teste un comportement, pas la compatibilité inter-navigateurs.
- **Deux pièges du mode navigateur, réglés dans la config.** `@vitejs/plugin-react` plus `resolve.dedupe: ["react", "react-dom"]` sur le projet `browser` : sans eux, les hooks de Base UI lèvent « Invalid hook call » à cause d'une copie dupliquée de React. Et dans un test navigateur, `render` de `vitest-browser-react` est **asynchrone** (`const screen = await render(...)`), les requêtes viennent du résultat ou de `page` (import `vitest/browser`), et interactions comme assertions s'attendent (`await …click()`, `await expect.element(...)`).
- **Deux projets Vitest**, déclarés dans `vitest.config.ts`. Le projet `unit` (non-navigateur) garde l'environnement Node par défaut et jsdom **par pragma** (`// @vitest-environment jsdom`), comme depuis #34 ; il inclut `**/*.test.{ts,tsx}` sauf `*.browser.test.tsx`. Le projet `browser` inclut `**/*.browser.test.tsx`. Le mode navigateur ne se déclare pas par pragma — c'est ce qui impose la config par projet.
- **Les tests restent co-localisés** à côté de leur sujet (ADR 0029). Le moteur se lit dans le nom du fichier (suffixe `.browser`) ou le pragma (jsdom).
- **`pnpm test` lance tout, un projet complet par défaut** (parité avec la CI, pas de vert trompeur qui aurait sauté le navigateur). `pnpm test:unit` est la boucle rapide non-navigateur, `pnpm test:watch` l'observe, `pnpm test:browser` ne lance que le navigateur. Le binaire Chromium s'installe par un `postinstall` gardé (`scripts/setup-test-browser.mjs`) : sauté quand `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` est posé — ce que fait le build Docker, dont l'image ne lance aucun test — et quand Playwright manque (installation `--prod`).
- **`toMatchScreenshot` est exclu.** La comparaison d'images dépend de l'OS, de la version du navigateur et du rendu des polices : elle casse sans que l'UI soit fausse. Le confinement CSS (#29) se vérifie par **assertions de géométrie** (`getBoundingClientRect`), qui disent aussi *quoi* a cassé.
- **Aucun réseau externe dans les tests.** Une carte Leaflet ne charge pas de vraies tuiles : les requêtes de tuiles sont **interceptées** (route interception de Playwright). Cohérent avec l'esprit intranet/RGPD du projet.

## Deux chantiers

- **Chantier 1 — tests de composant (cet ADR).** Poser les deux projets et les commandes. Migrer sur le navigateur le test `relatedTarget` de #34 (cas (2)) ; le reste de #34 reste sur jsdom. Écrire les tests de fidélité manquants **en tests de composant** (composant monté, sans serveur ni base) : confinement modale #29, carte Leaflet (tuiles interceptées), éditeur CodeMirror.
- **Chantier 2 — tests de bout en bout (ce ticket, #31).** Un **parcours de validation rapide** (se connecter, créer une page, l'éditer, l'enregistrer) a besoin du serveur Next et d'une base de test. Il a tranché ses propres questions — base, emplacement, auth, port, CI — consignées ci-dessous. Playwright y est **autonome** (`@playwright/test`), pas le mode navigateur de Vitest : celui-ci ne monte qu'un composant, sans serveur ni base.

## Décision — les tests de bout en bout (Playwright)

Playwright autonome pilote le vrai serveur Next sur une base jetable. Les fichiers vivent dans `e2e/` à la racine (`playwright.config.ts`, `compose.e2e.yaml`, `.env.test` à la racine aussi).

- **Base jetable, neuve par run.** Un Postgres éphémère : `compose.e2e.yaml` en local (port 5433, données en tmpfs, aucun volume), et le service natif de GitHub Actions en CI. `scripts/e2e.mjs` détruit puis recrée le conteneur autour de chaque run, pour que le drapeau d'installation (ADR 0027) parte toujours d'un wiki jamais installé. `globalSetup` amène le schéma (`prisma migrate deploy`) puis le seed comme **fixture** (`prisma db seed`). Pas de réinitialisation *par test* : les tests emploient des slugs uniques ; on la posera quand la suite grossira.
- **Fixtures e2e à droits restreints, sous drapeau.** Les parcours de permission ont besoin d'un formulaire, de fiches et de pages aux accès restreints (champ lisible des seuls administrateurs, fiche et page réservées, création de fiche fermée). Ces fixtures vivent dans `prisma/seed/e2e-fixtures.ts` et ne sont semées que lorsque `E2E_FIXTURES` est posé (par `globalSetup`) : un vrai déploiement ne les embarque jamais. Leurs slugs et libellés sont la source unique partagée par le seed et les specs (`e2e/support/fixtures.ts`). Contrainte tenue : un contenu à lecture restreinte porte aussi une **écriture restreinte**, sinon « écrire implique lire » le rouvrirait à toute personne connectée.
- **Auth par le vrai flux, plus des personas.** Le seed reste des données pures (ADR 0027, aucun import `better-auth`) : le compte `wiki-admin` ne naît que par le service d'installation, qui tourne dans Next ; un projet Playwright `setup` (`e2e/install.setup.ts`) le joue avant tout. Les comptes non administrateurs naissent de même par le seul chemin qui forge un compte utilisable — le **vrai flux d'invitation** — dans un second projet `setup` (`e2e/personas.setup.ts`), qui dépend de l'installation. Ce projet **sauve un `storageState` par rôle** (admin, contributeur, lecteur) : la suite ayant grossi au-delà du parcours unique, chaque spec de permission reprend son rôle sans se reconnecter, et seuls les parcours dont le **login est le sujet** (parcours canonique, déconnexion, mot de passe oublié) se connectent encore **explicitement, comme une personne** — l'intention initiale, tenue là où elle porte.
- **Port fixe, `BETTER_AUTH_URL` déterministe.** Le serveur sert sur `3100` ; `webServer`, `baseURL` et `BETTER_AUTH_URL` prennent tous cette valeur, injectée depuis `playwright.config.ts`. Le contrôle d'origine de BetterAuth voit toujours le vrai serveur — la difficulté du port dynamique est supprimée à la source, plutôt que contournée.
- **Serveur de production, pas `dev`.** Le harnais construit (`next build`) puis sert (`next start`) : l'e2e valide le vrai rendu, cohérent avec la fidélité que cet ADR poursuit. En local `pnpm test:e2e` construit lui-même ; en CI le build est une étape distincte (`E2E_SKIP_BUILD=1`), pour qu'un échec de build se lise comme tel.
- **CI enfin posée** (`.github/workflows/ci.yml`), déclenchée sur `on: push` — le dépôt fond ses branches en local sans PR, donc chaque poussée valide, la branche avant sa fusion comme `main` après ; un bloc `concurrency` annule le run précédent d'une même branche. Deux jobs parallèles : `test` (`pnpm test`, unit + navigateur) et `e2e` (service Postgres, `playwright install --with-deps`, build, `globalSetup`, parcours). **Aucun secret de dépôt** : l'e2e étant jetable, `BETTER_AUTH_SECRET` est forgé à la volée (`openssl` en CI, `crypto` dans `playwright.config.ts` en local).

## Conséquences

- **La boucle rapide reste disponible.** `pnpm test:unit` ne démarre aucun navigateur ; les tests Node et jsdom gardent leur vitesse. `pnpm test` paie en plus le démarrage de Chromium (quelques secondes, la suite navigateur étant petite), au bénéfice d'un défaut complet.
- **Un contributeur doit connaître deux jeux d'imports.** Côté navigateur, presque tout est asynchrone (`await userEvent.click(...)`, `await expect.element(...)`), là où jsdom ne l'est pas. C'est la taxe de l'hybride, assumée pour la vitesse. La règle de décision en une phrase la contient.
- **jsdom et Testing Library restent.** Ils portent la famille rapide ; #34 n'est pas défait.
- **La fidélité visuelle n'est pas figée par capture d'écran.** Elle se teste par géométrie tant qu'un hôte de rendu ne la stabilise pas — et cet ADR ne le prévoit pas.
- **La CI et l'e2e sont arrivés ensemble**, au chantier 2, plutôt que d'être montés deux fois.
