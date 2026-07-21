// Example entries for the four seeded forms (forms.ts): enough fiches per
// form (5-6) to exercise every <EntriesView> view meaningfully — a map needs
// scattered points, a calendar/agenda needs past *and* future dates, a
// gallery needs images. Towns and coordinates are real Nouvelle-Calédonie
// communes, consistent with the sample-entry generator's own town list
// (lib/sample-entries.ts).

// Pool filename (written under files/, ADR 0012) → source asset shipped in
// prisma/seed/assets/ (attribution: prisma/seed/assets/ATTRIBUTIONS.md).
export const IMAGE_ASSETS: Record<string, string> = {
  "photo-camille-nguyen.jpg": "portrait-camille.jpg",
  "photo-dominique-marchand.jpg": "portrait-dominique.jpg",
  "photo-sacha-bonnet.jpg": "portrait-sacha.jpg",
  "photo-andree-lefebvre.jpg": "portrait-andree.jpg",
  "photo-maxime-rousseau.jpg": "portrait-maxime.jpg",
  "photo-claude-petit.jpg": "portrait-claude.jpg",
  "atelier-velo.jpg": "bike-workshop.jpg",
  "fete-de-quartier.jpg": "fete-quartier.jpg",
  "marche-ressourcerie.jpg": "marche-ressourcerie.jpg",
  "sortie-nature.jpg": "sortie-nature.jpg",
  "assemblee-generale.jpg": "assemblee-generale.jpg",
  "grainotheque.jpg": "grainotheque.jpg",
  "jardin-partage.jpg": "jardin-partage.jpg",
  "ressourcerie-locale.jpg": "ressourcerie-locale.jpg",
  "petite-bibliotheque.jpg": "petite-bibliotheque.jpg",
};

interface Town {
  ville: string;
  codePostal: string;
  lat: number;
  lng: number;
}

const NOUMEA: Town = { ville: "Nouméa", codePostal: "98800", lat: -22.2758, lng: 166.458 };
const DUMBEA: Town = { ville: "Dumbéa", codePostal: "98835", lat: -22.1508, lng: 166.4581 };
const PAITA: Town = { ville: "Païta", codePostal: "98890", lat: -22.1667, lng: 166.3667 };
const MONT_DORE: Town = { ville: "Mont-Dore", codePostal: "98810", lat: -22.2939, lng: 166.5806 };
const KONE: Town = { ville: "Koné", codePostal: "98860", lat: -21.0574, lng: 164.8642 };
const BOURAIL: Town = { ville: "Bourail", codePostal: "98870", lat: -21.5717, lng: 165.4881 };

function addressFields(town: Town, adresse: string) {
  return {
    adresse,
    "code-postal": town.codePostal,
    ville: town.ville,
    position: { lat: town.lat, lng: town.lng },
  };
}

export interface EntrySeed {
  formSlug: string;
  /** Frozen at creation, like a real first save (docs/forms.md). */
  slug: string;
  data: Record<string, unknown>;
  /** Days relative to seed time (negative = past); drives Page/Revision createdAt. */
  daysOffset: number;
}

export const entrySeeds: EntrySeed[] = [
  // --- Annuaire (automatic title: "{prenom} {nom}") ---
  {
    formSlug: "annuaire",
    slug: "camille-nguyen",
    daysOffset: -120,
    data: {
      prenom: "Camille",
      nom: "Nguyen",
      photo: "photo-camille-nguyen.jpg",
      fonction: "Coordinatrice de l'association",
      presentation:
        "Anime le collectif au quotidien, entre logistique, médiation et suivi des projets.",
      email: "camille.nguyen@exemple.org",
      structure: "Les Jardins partagés",
      ...addressFields(NOUMEA, ""),
    },
  },
  {
    formSlug: "annuaire",
    slug: "dominique-marchand",
    daysOffset: -110,
    data: {
      prenom: "Dominique",
      nom: "Marchand",
      photo: "photo-dominique-marchand.jpg",
      fonction: "Trésorier",
      presentation:
        "Suit les comptes de l'association et accompagne les nouveaux projets sur leur budget.",
      structure: "Les Jardins partagés",
      ...addressFields(DUMBEA, ""),
    },
  },
  {
    formSlug: "annuaire",
    slug: "sacha-bonnet",
    daysOffset: -95,
    data: {
      prenom: "Sacha",
      nom: "Bonnet",
      photo: "photo-sacha-bonnet.jpg",
      fonction: "Bénévole à l'atelier vélo",
      presentation:
        "Répare les vélos du quartier le samedi matin, toujours partante pour transmettre.",
      ...addressFields(PAITA, ""),
    },
  },
  {
    formSlug: "annuaire",
    slug: "andree-lefebvre",
    daysOffset: -80,
    data: {
      prenom: "Andrée",
      nom: "Lefebvre",
      photo: "photo-andree-lefebvre.jpg",
      fonction: "Chargée de communication",
      presentation: "S'occupe du site, des réseaux et de la newsletter du collectif.",
      ...addressFields(MONT_DORE, ""),
    },
  },
  {
    formSlug: "annuaire",
    slug: "maxime-rousseau",
    daysOffset: -60,
    data: {
      prenom: "Maxime",
      nom: "Rousseau",
      photo: "photo-maxime-rousseau.jpg",
      fonction: "Animateur nature",
      presentation: "Encadre les sorties et les ateliers autour de la nature et du jardin.",
      ...addressFields(KONE, ""),
    },
  },
  {
    formSlug: "annuaire",
    slug: "claude-petit",
    daysOffset: -45,
    data: {
      prenom: "Claude",
      nom: "Petit",
      photo: "photo-claude-petit.jpg",
      fonction: "Référent ressourcerie",
      presentation: "Réceptionne, trie et remet en circuit les objets déposés à la ressourcerie.",
      ...addressFields(BOURAIL, ""),
    },
  },

  // --- Agenda (mix of past and future, for period="future"/"past" testing) ---
  {
    formSlug: "agenda",
    slug: "atelier-reparation-velo",
    daysOffset: -20,
    data: {
      title: "Atelier réparation vélo",
      description:
        "Venez avec votre vélo, on répare ensemble : freins, chaîne, crevaisons. Outils fournis, gratuit, ouvert à toustes.",
      "date-debut": isoDay(4),
      "date-fin": isoDay(4),
      photo: "atelier-velo.jpg",
      ...addressFields(NOUMEA, "12 rue de l'Alma"),
    },
  },
  {
    formSlug: "agenda",
    slug: "fete-de-quartier-2026",
    daysOffset: -15,
    data: {
      title: "Fête de quartier",
      description:
        "Deux jours de stands, de musique et de repas partagé pour clôturer la saison des ateliers.",
      "date-debut": isoDay(12),
      "date-fin": isoDay(13),
      photo: "fete-de-quartier.jpg",
      ...addressFields(DUMBEA, "Place du marché"),
    },
  },
  {
    formSlug: "agenda",
    slug: "marche-de-la-ressourcerie",
    daysOffset: -10,
    data: {
      title: "Marché de la ressourcerie",
      description:
        "Vide-grenier associatif : objets, vêtements et meubles à petit prix, dépôt possible sur place.",
      "date-debut": isoDay(26),
      photo: "marche-ressourcerie.jpg",
      ...addressFields(PAITA, "Rue du Marché"),
    },
  },
  {
    formSlug: "agenda",
    slug: "sortie-nature-en-foret",
    daysOffset: -5,
    data: {
      title: "Sortie nature en forêt",
      description:
        "Balade accompagnée à la découverte de la flore locale, niveau facile, prévoir de bonnes chaussures.",
      "date-debut": isoDay(45),
      "date-fin": isoDay(46),
      photo: "sortie-nature.jpg",
      ...addressFields(MONT_DORE, "Sentier de la forêt"),
    },
  },
  {
    formSlug: "agenda",
    slug: "assemblee-generale-2026",
    daysOffset: -42,
    data: {
      title: "Assemblée générale",
      description:
        "Bilan de l'année, budget, élection du bureau. Ouverte à toustes les adhérent·es.",
      "date-debut": isoDay(-40),
      photo: "assemblee-generale.jpg",
      ...addressFields(NOUMEA, "Salle communale"),
    },
  },
  {
    formSlug: "agenda",
    slug: "grainotheque-mobile-collecte",
    daysOffset: -12,
    data: {
      title: "Grainothèque mobile : collecte de graines",
      description: "Apportez vos graines reproductibles, repartez avec celles des autres.",
      "date-debut": isoDay(-11),
      photo: "grainotheque.jpg",
      ...addressFields(KONE, "Marché municipal"),
    },
  },

  // --- Ressources ---
  {
    formSlug: "ressources",
    slug: "yeswiki-le-site-officiel",
    daysOffset: -200,
    data: {
      title: "Yeswiki : le site officiel",
      "site-web": "https://yeswiki.net",
      type: ["site-ressource"],
      description:
        "Tout ce qu'il y a à savoir sur YesWiki, le logiciel de wiki collaboratif qui a inspiré WikiOui.",
    },
  },
  {
    formSlug: "ressources",
    slug: "framasoft",
    daysOffset: -190,
    data: {
      title: "Framasoft",
      "site-web": "https://framasoft.org/fr/",
      type: ["partenaire-ressource"],
      description:
        "Framasoft est une association d'éducation populaire qui promeut le logiciel libre et les biens communs numériques.",
    },
  },
  {
    formSlug: "ressources",
    slug: "guide-du-compost-partage",
    daysOffset: -70,
    data: {
      title: "Guide du compost partagé",
      type: ["methodologie-guide"],
      description:
        "Comment monter un composteur partagé au pied des immeubles : matériel, entretien, tours de service.",
      auteur: "Réseau Compost NC",
      photo: "jardin-partage.jpg",
    },
  },
  {
    formSlug: "ressources",
    slug: "la-reserve-ressourcerie-associative",
    daysOffset: -55,
    data: {
      title: "La Réserve — ressourcerie associative",
      type: ["partenaire-ressource"],
      description:
        "Une ressourcerie partenaire qui collecte, répare et revend des objets du quotidien à petit prix.",
      photo: "ressourcerie-locale.jpg",
    },
  },
  {
    formSlug: "ressources",
    slug: "petites-bibliotheques-de-rue-mode-demploi",
    daysOffset: -30,
    data: {
      title: "Petites bibliothèques de rue : mode d'emploi",
      type: ["methodologie-guide"],
      description:
        "Installer une boîte à livres en libre-service dans son quartier : emplacement, entretien, animation.",
      auteur: "Collectif Lire Dehors",
      photo: "petite-bibliotheque.jpg",
    },
  },
  {
    formSlug: "ressources",
    slug: "retour-dexperience-atelier-velo-associatif",
    daysOffset: -18,
    data: {
      title: "Retour d'expérience : notre atelier vélo associatif",
      type: ["experience-inspirante"],
      description:
        "Trois ans d'atelier d'autoréparation de vélos : ce qui a marché, ce qu'on referait autrement.",
      auteur: "Sacha Bonnet",
      photo: "atelier-velo.jpg",
    },
  },

  // --- Blog ---
  {
    formSlug: "blog",
    slug: "un-nouveau-local-pour-la-ressourcerie",
    daysOffset: -3,
    data: {
      photo: "ressourcerie-locale.jpg",
      title: "Un nouveau local pour la ressourcerie",
      chapeau: "La ressourcerie déménage dans un espace deux fois plus grand, dès le mois prochain.",
      contenu:
        "Après deux ans dans un local devenu trop petit, la ressourcerie associative s'installe dans de nouveaux locaux plus spacieux.\n\n**Au programme :**\n\n- un espace de tri agrandi\n- un coin réparation ouvert au public\n- des horaires d'ouverture élargis\n\nL'ancien local reste ouvert jusqu'au déménagement ; les bénévoles sont toujours les bienvenu·es pour aider au transport.",
    },
  },
  {
    formSlug: "blog",
    slug: "bilan-de-la-fete-de-quartier-2026",
    daysOffset: -8,
    data: {
      photo: "fete-de-quartier.jpg",
      title: "Bilan de la fête de quartier 2026",
      chapeau: "Retour en images et en chiffres sur l'édition de cette année.",
      contenu:
        "Belle affluence pour cette nouvelle édition : plus de 300 personnes sur les deux jours, une vingtaine de stands associatifs et un repas partagé qui a fait le plein.\n\nMerci à tous les bénévoles qui ont donné de leur temps pour monter, tenir et démonter les stands !",
    },
  },
  {
    formSlug: "blog",
    slug: "bienvenue-aux-nouveaux-benevoles",
    daysOffset: -15,
    data: {
      photo: "assemblee-generale.jpg",
      title: "Bienvenue aux nouveaux bénévoles",
      chapeau: "Cinq nouvelles personnes ont rejoint les équipes ce trimestre.",
      contenu:
        "Le collectif continue de grandir : cinq nouveaux bénévoles nous ont rejoints ces dernières semaines, sur l'atelier vélo, la ressourcerie et l'animation nature.\n\nUn grand merci à elles et eux, et à bientôt sur le terrain !",
    },
  },
  {
    formSlug: "blog",
    slug: "latelier-velo-fete-ses-3-ans",
    daysOffset: -22,
    data: {
      photo: "atelier-velo.jpg",
      title: "L'atelier vélo fête ses 3 ans",
      chapeau: "Trois ans déjà que l'atelier répare vélos et mauvaises habitudes.",
      contenu:
        "Lancé avec trois outils et une bâche, l'atelier vélo réunit aujourd'hui une dizaine de bénévoles réguliers et répare en moyenne une quinzaine de vélos par mois.\n\nPour fêter ça, un atelier spécial est prévu le mois prochain — toutes les infos sur la page [Agenda](vue-activite).",
    },
  },
  {
    formSlug: "blog",
    slug: "resultats-de-la-collecte-de-graines",
    daysOffset: -30,
    data: {
      photo: "grainotheque.jpg",
      title: "Résultats de la collecte de graines",
      chapeau: "La grainothèque mobile a fait le plein lors de sa dernière tournée.",
      contenu:
        "Plus de quarante variétés de graines reproductibles ont été échangées lors de la dernière collecte : tomates, courges, fleurs mellifères et quelques curiosités locales.\n\nProchain rendez-vous annoncé sur la page [Agenda](vue-activite).",
    },
  },
  {
    formSlug: "blog",
    slug: "portrait-rencontre-avec-lequipe-de-coordination",
    daysOffset: -45,
    data: {
      photo: "jardin-partage.jpg",
      title: "Portrait : rencontre avec l'équipe de coordination",
      chapeau: "Qui sont les personnes qui font tourner le collectif au quotidien ?",
      contenu:
        "Coup de projecteur sur l'équipe de coordination : retrouvez leurs portraits et leurs rôles dans l'[annuaire](trombi-annuaire) du collectif.",
    },
  },
];

// yyyy-mm-dd, `offset` days from the seed run (negative = past). Kept in
// entries.ts (not computed at import time) so re-running the seed later
// still produces plausible future/past events relative to *that* run.
function isoDay(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
