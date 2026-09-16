# Deux moteurs de test d'interaction : jsdom par défaut, un vrai navigateur pour la fidélité

Le dépôt ne savait pas tester une **interaction**. Les tests de composants passaient par `renderToPipeableStream` : un rendu serveur vers une chaîne, sans DOM ni événement. Tout ce qui est vrai *après* l'hydratation — clic, clavier, focus, mise en page — échappait à la suite (issue #31).

L'issue #34 a ouvert une première porte : jsdom et Testing Library, avec 25 tests sur deux champs (`components/fields/tags-input.test.tsx`, `suggestion-input.test.tsx`). Mais jsdom simule le DOM sans moteur de rendu : il ne calcule ni CSS, ni géométrie, ni focus réel, ni timing. Il a déjà montré sa limite — un test de sortie de champ échouait parce que Tab n'avait aucun élément où aller, donc `relatedTarget` valait `null`.

Cet ADR fixe la stratégie de test navigateur, pour les deux chantiers qu'elle recouvre : les **tests de composant** (celui que cet ADR met en œuvre) et les **tests de bout en bout** (chantier séparé, voir plus bas).

## Contexte

Ce que jsdom ne peut pas vérifier, relevé au fil du chantier de la modale inline (#28, #29, #30) :

- la géométrie et le CSS calculé — position, largeur, débordement, confinement d'un gabarit en `position: fixed` (#29) ;
- le focus réel — `relatedTarget`, piège de focus, ordre de Tab ;
- le timing réel — débounce, préchargement au survol ;
- une bibliothèque qui exige un vrai moteur de rendu — carte Leaflet, éditeur CodeMirror, barre de progression d'upload.

Ce sont exactement les points les plus incertains du projet, et `architecture.md` pose que **l'ergonomie est prioritaire** : la fidélité du rendu est une valeur affichée, pas un détail.

Le dépôt était en Vitest 4.1.10. Le mode navigateur, stable depuis Vitest 4 (« removing the `experimental` tag from Browser Mode »), n'y est pourtant **pas câblable** : la 4.1.10 a retiré le `provider` en chaîne et réclame une factory du paquet `@vitest/browser-playwright`, qui n'existe qu'en 5.x et tire `@vitest/browser@5` — lequel importe de `vitest/node` un export absent de la 4.1.10. Le mode navigateur supporté vit donc en Vitest 5, et le dépôt y monte.

## Options considérées

**jsdom seul.** Le plus rapide, mais rate exactement les points qui ont justifié #31. Écarté : il vide le ticket de son but.

**Playwright autonome.** Vrai navigateur, mais un second outil, un second style de test, une seconde config à côté de Vitest. Réservé au chantier e2e, où il est le bon outil (il pilote un serveur, pas un composant monté).

**Mode navigateur de Vitest, pile unique.** On retire jsdom, tout test de composant tourne dans le navigateur. Une seule façon d'écrire un test, mais tout test de logique paie le coût du navigateur — plus lent que jsdom. Écarté : la vitesse de la boucle quotidienne est une contrainte.

**Hybride par le coût (retenu).** Chaque test tourne sur le moteur le moins cher qui le supporte : jsdom pour la logique, navigateur pour la fidélité.

## Décision

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
- **Chantier 2 — tests de bout en bout (ticket séparé).** Un parcours de fumée (se connecter, créer une page, l'éditer, l'enregistrer) a besoin du serveur Next et d'une base de test. Il tranchera ses propres questions : quelle base, où vivent ces tests, et la **CI** — qui n'existe pas encore et qu'aucun des deux chantiers n'avait avant lui. Playwright y sera probablement autonome.

## Conséquences

- **La boucle rapide reste disponible.** `pnpm test:unit` ne démarre aucun navigateur ; les 47 tests Node et les tests jsdom gardent leur vitesse. `pnpm test` paie en plus le démarrage de Chromium (quelques secondes, la suite navigateur étant petite), au bénéfice d'un défaut complet.
- **Un contributeur doit connaître deux jeux d'imports.** Côté navigateur, presque tout est asynchrone (`await userEvent.click(...)`, `await expect.element(...)`), là où jsdom ne l'est pas. C'est la taxe de l'hybride, assumée pour la vitesse. La règle de décision en une phrase la contient.
- **jsdom et Testing Library restent.** Ils portent la famille rapide ; #34 n'est pas défait.
- **La fidélité visuelle n'est pas figée par capture d'écran.** Elle se teste par géométrie tant qu'un hôte de rendu ne la stabilise pas — et cet ADR ne le prévoit pas.
- **La CI et l'e2e arrivent ensemble**, au chantier 2, plutôt que d'être montés deux fois.
