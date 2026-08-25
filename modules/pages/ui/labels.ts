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
 * The one refusal a wiki cannot take back, said before the click rather than
 * after it — the same treatment « transmettre la propriété » gets above.
 *
 * No page is exempt from its rights, the sign-in pages included (ADR 0025,
 * amendement du 2026-08-25) : that is what makes the setting mean something,
 * and it is also what makes this one dangerous. Closing the read of a sign-in
 * page closes the sign-in. An administrator still signed in can undo it ; once
 * every session has expired, only the database reopens the wiki.
 *
 * Only the **read** is warned about : a page one may not write is still a page
 * one can sign in on. Null when the lot holds no account page, or when the read
 * stays open to everyone — the one scope that keeps signing in reachable.
 */
export function signInLockoutWarning(
  slugs: readonly string[],
  read: AccessRule | undefined
): string | null {
  if (read === undefined || read.scope === "everyone") return null;
  const accountPages: readonly string[] = Object.values(wikiConfig.authPages);
  const closed = slugs.filter((slug) => accountPages.includes(slug));
  if (closed.length === 0) return null;
  const named = closed.map((slug) => `«\u00A0${slug}\u00A0»`).join(", ");
  return `Attention : ${named} sert à se connecter. En fermer la lecture ferme la connexion pour qui n'est pas déjà connecté — et si toutes les sessions expirent, seule la base de données permettra de rouvrir le wiki.`;
}
