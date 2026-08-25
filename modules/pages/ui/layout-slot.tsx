import type { LayoutSlot } from "@/modules/pages/content";
import { isBlankMdx, renderMdx } from "@/modules/authoring/mdx";

// What one slot of the site chrome puts on screen (issue #20). Three
// situations reach here and only one of them says anything:
//
//   the page exists and this person may read it  → its MDX
//   the page exists, or its rights refuse it, and it is empty  → nothing
//   the page does not exist at all  → a note, to administrators alone
//
// The middle case has to stay silent: a refusal is a right being applied, and
// naming it would be a second, contradictory story. The last one cannot be
// confused with it by the people who see it — every rule lets an administrator
// through, so a slot *they* find empty is either empty or missing.

/**
 * The note under a slot whose page `wiki.config.ts` names and the wiki does
 * not have. Layout pages are special pages, so this is a configuration
 * mistake rather than something an author did: the slug is named outright,
 * since that is what has to be created or corrected.
 */
function MissingSlot({ slug }: { slug: string }) {
  return (
    <span className="text-sm font-normal text-destructive">
      La page «&nbsp;{slug}&nbsp;» n&apos;existe pas.
    </span>
  );
}

/**
 * What to render in a slot, or null when it has nothing to say — the layout
 * then leaves the whole band out rather than drawing an empty one.
 */
export async function renderSlot(
  slot: LayoutSlot,
  isAdmin: boolean
): Promise<React.ReactNode | null> {
  if (slot.missingSlug !== undefined) {
    return isAdmin ? <MissingSlot slug={slot.missingSlug} /> : null;
  }
  return isBlankMdx(slot.content) ? null : renderMdx(slot.content);
}
