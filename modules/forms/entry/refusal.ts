// Why a form refuses, in words (issue #20). A label, not a rule: the decision
// is taken elsewhere, and this only says it out loud. Its readers are the
// entry form — the block an author may not add to — and the motif under a
// field they may see but not fill.

import type { AccessRule } from "@/modules/permissions/rules";

/**
 * Why a rule refuses, in the words the scope was posed in. Two things read it,
 * and they are the two the general rule (docs/permissions.md § Ce que voit qui
 * n'a pas le droit) leaves on screen rather than hiding: the `<EntryForm>` an
 * person may not add to, and a field they may see but not fill. Both are shown
 * with their motif — a block that vanished would read as a page that failed to
 * load, and a field that vanished as a fiche someone forgot to fill in.
 *
 * The named groups arrive resolved to their display names — « @Bureau », not
 * `bureau`, since a slug says nothing to whoever reads the refusal. The people
 * a « seulement » names stay unsaid: naming them would publish who is on the
 * wiki to a visitor, where a group is already how the wiki talks about itself
 * in public.
 */
export function scopeRefusal(
  rule: AccessRule,
  groupNames: readonly string[]
): string | null {
  switch (rule.scope) {
    case "everyone":
      return null; // refuses nobody, so there is nothing to word
    case "authenticated":
      return "Réservé aux personnes connectées.";
    case "restricted":
      return groupNames.length === 0
        ? "Réservé aux personnes autorisées."
        : `Réservé à ${joinNames(groupNames.map((name) => `@${name}`))}.`;
  }
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}
