import { hiddenIfNoAccess } from "@/lib/pages";
import { WikiLinkView } from "./internal/wiki-link-view";

// The builder fields (text, link, target, hideIfNoAccess) map to the
// markdown link it emits (ADR 0006), not directly to these render props; its
// defaults live in wiki-link.yaml (ADR 0013). This is the `a` the MDX
// pipeline actually renders (lib/mdx.tsx): it resolves hideIfNoAccess
// (docs/permissions.md § Liens et boutons vers l'inaccessible, issue #13)
// before deciding whether to render at all, then delegates every other prop
// — target included — to internal/wiki-link-view.tsx. Same split as
// Button/ButtonView (button.tsx), for the same reason: the check needs a
// server-side read of the current person's rights, which the view has no
// door to once it's reused from a "use client" caller (button-view.tsx) or a
// plain server one (image.tsx) that never asks the question.
export type WikiLinkProps = React.ComponentPropsWithoutRef<"a"> & {
  hideIfNoAccess?: boolean;
};

export async function WikiLink({
  hideIfNoAccess = false,
  href = "",
  ...rest
}: WikiLinkProps) {
  if (await hiddenIfNoAccess(href, hideIfNoAccess)) return null;
  return <WikiLinkView href={href} {...rest} />;
}
