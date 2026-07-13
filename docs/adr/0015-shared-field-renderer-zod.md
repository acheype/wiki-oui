# Renderer de champs partagé, Zod comme contrat runtime des descripteurs

Le rendu des champs typés (widgets + validation) est **un module unique** partagé entre le ComponentBuilder (descripteur YAML → MDX) et les formulaires (descripteur JSON → `data` d'une fiche). Le vocabulaire de champs des formulaires est un **sur-ensemble** de celui des composants. La bonne forme des deux sortes de descripteurs est garantie par **Zod** : méta-schéma au chargement/enregistrement, et schéma **dérivé** par formulaire pour valider les valeurs des fiches, côté client et côté serveur.

## Contexte

Le ComponentBuilder (ADR 0013) rend déjà des champs typés depuis un descripteur : widgets, valeurs, validation. La saisie d'une fiche est le même problème — seules diffèrent l'enveloppe (modale vs page de saisie) et la sérialisation (props MDX vs objet JSON). Par ailleurs, un composant est écrit par un développeur dans le repo : sa cohérence est vérifiable **au build** (signature ts-morph, ADR 0013). Un formulaire est écrit par un utilisateur **à l'exécution** : ni `.tsx`, ni build — le contrat doit vivre au runtime. Enfin, le bord du loader de descripteurs YAML (`lib/component-descriptors.ts`) *castait* le YAML parsé vers l'interface TS avec un simple spot-check : la forme brute n'était pas réellement vérifiée.

## Décision

**Un `FieldRenderer` partagé.** Widgets de champ + validation extraits en module commun, consommé par deux enveloppes : la modale du ComponentBuilder (sérialise en balise MDX, règle d'omission ADR 0013) et le formulaire de fiche (`react-hook-form` + résolveur Zod + `<Form>` shadcn, sérialise en JSON). Tout nouveau widget profite aux deux.

**Un vocabulaire, en sur-ensemble.** Les types de champs des formulaires étendent ceux des descripteurs de composants (`text`, `url`, `list`, `checkbox`…) avec les types de saisie de fiche (`textarea`, `email`, `date`, `radio`, `multiChoice`, `image`, `file`, `geolocation`, `tags`, `customContent`, `title`) — pas de fork. Le descripteur de composants gagne au passage le type `form-list` (sélecteur de formulaire, pour `<EntryForm>`).

**Zod à trois postes.** (1) **Méta-schéma** : valide qu'un descripteur est bien formé — au bord du loader YAML pour les composants (`type ComponentDescriptor = z.infer<…>` remplace l'interface maintenue à la main et le cast), à l'enregistrement du FormBuilder pour les formulaires. Les erreurs conservent les messages ligne-précis existants (`error.issues[].path` → `lineOf(path)`). (2) **Schéma dérivé par formulaire** : construit depuis la liste de champs (`required` → `.min(1)`, `email` → `.email()`, options → `z.enum`…), il valide les valeurs d'une fiche **côté client** (résolveur) **et côté serveur** avant l'écriture Prisma — une seule source de vérité. (3) **Inférence** : `z.infer` type le `data` d'une fiche.

**Ce que Zod ne remplace pas.** La vérification de signature ts-morph (ADR 0013) reste telle quelle — l'analyse de la source d'un `.tsx` est hors de portée d'un validateur de données. Les règles sémantiques croisées de `validateDescriptor` restent des checks impératifs à messages ciblés ; Zod ne couvre que la forme.

## Conséquences

- Le refacto du loader (cast → parse Zod) se fait **dans ce chantier**, porté par l'unification — pas comme nettoyage préalable isolé.
- Zod, `react-hook-form` et `@hookform/resolvers` entrent dans les dépendances.
- En une phrase : Zod est au formulaire ce que la signature ts-morph est au composant — le contrat migre du build vers le runtime parce que l'objet migre du code vers la donnée.
