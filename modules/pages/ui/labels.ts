// What the pages system pages say about a right and about an owner. Labels,
// not rules (issue #20): they say nothing about who may do what, and their
// only readers are the four views in this folder — the « Accès » modal, the
// bulk owner dialog, the refusal view and gerer-pages.

import { plural } from "@/lib/format";
import { ANONYMOUS } from "@/modules/accounts/username";
import {
  type AccessRule,
  type AclDirectory,
  type AclFloor,
  ADMINS_GROUP,
} from "@/modules/permissions/rules";
import { wikiConfig } from "@/wiki.config";

/**
 * A rule as a column of a list has room for it (docs/permissions.md §
 * gerer-pages): where the widget poses a right, this reads one back at a
 * glance, over hundreds of lines. The floor is what an empty « seulement »
 * list means — « eux seuls » — so the summary names it rather than showing
 * nothing, which would read as « personne ».
 */
export function ruleSummary(
  rule: AccessRule,
  floor: AclFloor,
  directory: AclDirectory
): string {
  switch (rule.scope) {
    case "everyone":
      return "Tous";
    case "authenticated":
      return "Connectés";
    case "restricted": {
      const nameOfPerson = new Map(
        directory.people.map((person) => [person.username, person.name])
      );
      const nameOfGroup = new Map(
        directory.groups.map((group) => [group.slug, group.name])
      );
      const named = [
        ...(rule.usernames ?? []).map(
          (username) => nameOfPerson.get(username) ?? username
        ),
        ...(rule.groupSlugs ?? []).map(
          (slug) => `@${nameOfGroup.get(slug) ?? slug}`
        ),
      ];
      if (named.length === 0) {
        return floor.owner === null ? `@${ADMINS_GROUP.name}` : "Le propriétaire";
      }
      const others = named.length - 1;
      return others === 0 ? named[0] : `${named[0]} +${others}`;
    }
  }
}

/**
 * What handing pages over means for whoever receives them, as the two views
 * that offer it say it — the « Accès » modal on one page, `gerer-pages` on a
 * lot. Written out both ways rather than built from a count: at one page the
 * pronoun agrees with it too, and assembling the pieces is what once produced
 * « 1 page passeront sous la responsabilité ».
 */
export function ownerTransferNote(total: number): string {
  return total === 1
    ? "La personne choisie deviendra responsable de cette page. Elle pourra la voir, la modifier et définir qui peut y accéder."
    : `La personne choisie deviendra responsable de ces ${plural(total, "page", "pages")}. Elle pourra les voir, les modifier et définir qui peut y accéder.`;
}

/**
 * And what it means for whoever gives them: transmettre la propriété est sans
 * retour (docs/permissions.md § Quel droit commande quelle action), so the
 * confirmation says so before the click rather than after it.
 */
export function ownerTransferWarning(total: number): string {
  const subject = total === 1 ? "cette page" : "ces pages";
  return `Une fois le transfert effectué, seul le nouveau propriétaire, ou un administrateur, pourra transférer à nouveau la propriété de ${subject}.`;
}

/**
 * Who looks after the page, as a view states it. A page with no owner says
 * « Anonyme » rather than saying nothing: the absence is itself the
 * information — it is what leaves the page to the administrators alone — and
 * a line that disappears reads as a screen that failed to load it.
 *
 * The widget's floor stays silent about them all the same: a locked
 * « Anonyme » chip beside the administrators would promise access to
 * somebody, where the whole point is that there is nobody.
 */
export function ownerLine(ownerName: string | null): string {
  return `Propriétaire : ${ownerName ?? ANONYMOUS}`;
}

/**
 * What one does on an account page, as the atoms a sentence is built from.
 * Three, because the three pages do not overlap the way their names suggest.
 */
type Entry = "connect" | "recover" | "activate";

/**
 * The account pages a wiki can shut itself out of, and what each one is for.
 * Three of the four : `inscription` is not one, free sign-up being closed by
 * default (wiki.config.ts) and opening no way back into an account that
 * already exists.
 *
 * Each is named for what it does, never for what it links to. `connexion`
 * offers a link to the recovery page and recovers nothing.
 * `mot-de-passe-oublie` only ever reaches an account that exists —
 * requestPasswordReset refuses an unknown or disabled address — so it recovers
 * and never activates. `invitation` does both: **every** link lands there, a
 * forgotten password as much as a first invitation (one mint site, one page,
 * modules/accounts/invitation/account-link.ts).
 */
const LOCKING_PAGES: Record<
  "signIn" | "forgotPassword" | "invitation",
  readonly Entry[]
> = {
  signIn: ["connect"],
  forgotPassword: ["recover"],
  invitation: ["recover", "activate"],
};

/** « se connecter, récupérer ou activer un compte », for whichever apply. */
function servesPhrase(entries: ReadonlySet<Entry>): string {
  const account = [
    entries.has("recover") ? "récupérer" : null,
    entries.has("activate") ? "activer" : null,
  ]
    .filter((verb) => verb !== null)
    .join(" ou ");
  return joinEntries(
    entries,
    entries.has("connect") ? "se connecter" : null,
    account === "" ? null : `${account} un compte`
  );
}

/** The same set, as what closing the pages would stop people doing. */
function preventsPhrase(entries: ReadonlySet<Entry>): string {
  const account = [
    entries.has("recover") ? "de récupérer" : null,
    entries.has("activate") ? "d'activer" : null,
  ]
    .filter((verb) => verb !== null)
    .join(" ou ");
  return joinEntries(
    entries,
    entries.has("connect") ? "de se connecter" : null,
    account === "" ? null : `${account} leur compte`
  );
}

/**
 * The two halves of the sentence, joined. A comma rather than « ou » when the
 * second half already holds one, so that « se connecter ou récupérer ou
 * activer un compte » never comes out.
 */
function joinEntries(
  entries: ReadonlySet<Entry>,
  connect: string | null,
  account: string | null
): string {
  const parts = [connect, account].filter((part) => part !== null);
  const separator = entries.has("recover") && entries.has("activate") ? ", " : " ou ";
  return parts.join(separator);
}

/** What a change to the rights would close, in the pieces a dialog shows. */
export interface SignInLockout {
  /** The account pages it would close — what a lot can offer to spare. */
  slugs: string[];
  /** « La page « connexion » sert à se connecter. » */
  purpose: string;
  /** What closing them stops, shown in bold. No final punctuation. */
  consequence: string;
  /**
   * Signing in is among them, so nobody gets in at all. Two things follow, and
   * they are true of `connexion` alone : administrators are no exception, and
   * once every session has gone the wiki is shut for good. Closing a recovery
   * page only bites whoever has *also* lost their password, so it says neither.
   */
  locksEveryoneOut: boolean;
}

/**
 * The one refusal a wiki cannot take back, raised **before** the write rather
 * than noted beside it: a note in small grey type is too easy to walk past,
 * and this one costs the wiki.
 *
 * No page is exempt from its rights, the account pages included (ADR 0025,
 * amendement du 2026-08-25) : that is what makes the setting mean something,
 * and it is also what makes this one dangerous.
 *
 * Only the **read** raises it : a page one may not write is still a page one
 * can sign in on. Null when the lot holds none of those pages, or when the
 * read stays open to everyone — the one scope that keeps them reachable.
 */
export function signInLockout(
  slugs: readonly string[],
  read: AccessRule | undefined
): SignInLockout | null {
  if (read === undefined || read.scope === "everyone") return null;
  const roles = Object.keys(LOCKING_PAGES) as (keyof typeof LOCKING_PAGES)[];
  const closed = roles.flatMap((role) => {
    const slug = wikiConfig.authPages[role];
    return slugs.includes(slug) ? [{ slug, entries: LOCKING_PAGES[role] }] : [];
  });
  if (closed.length === 0) return null;

  const entries = new Set(closed.flatMap((page) => page.entries));
  const named = closed.map(({ slug }) => `«\u00A0${slug}\u00A0»`);
  const subject =
    closed.length === 1
      ? `La page ${named[0]} sert`
      : `Les pages ${named.slice(0, -1).join(", ")} et ${named[named.length - 1]} servent`;
  const its = closed.length === 1 ? "sa" : "leur";

  return {
    slugs: closed.map(({ slug }) => slug),
    purpose: `${subject} à ${servesPhrase(entries)}.`,
    consequence: `Désactiver ${its} lecture empêchera les utilisateurs non connectés ${preventsPhrase(entries)}`,
    locksEveryoneOut: entries.has("connect"),
  };
}
