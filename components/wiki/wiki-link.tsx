// No "use client": the ComponentBuilder loader must read wikiLinkDefaults as
// a real object; the interactive modal lives in internal/modal-link.tsx.
import Link from "next/link";
import { isExternalHref, isWikiHref } from "@/lib/slug";
import { ModalLink } from "./internal/modal-link";

type WikiLinkProps = React.ComponentPropsWithoutRef<"a">;

// Builder-facing defaults (docs/component-builder.md): wiki-link emits a
// markdown link `[text](link){{ target: '…' }}` (ADR 0006), so its fields
// map to the markdown parts, not to the component props below.
export const wikiLinkDefaults = {
  text: undefined,
  link: undefined,
  target: "self",
};

// Renders every `a` coming out of the MDX pipeline (ADR 0006).
// target comes from the author via an annotation: "_blank" or "modal".
export function WikiLink({ href = "", target, children, ...rest }: WikiLinkProps) {
  const isExternal = isExternalHref(href);
  const isInternal = isWikiHref(href);
  // Author links are slug-relative; resolve from the site root so they work
  // from handler URLs like /ma-page/edit too.
  const resolvedHref = isInternal ? `/${href}` : href;

  if (target === "modal") {
    return (
      <ModalLink href={resolvedHref} {...rest}>
        {children}
      </ModalLink>
    );
  }

  if (target === "_blank") {
    return (
      <a href={resolvedHref} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }

  if (isInternal && !isExternal) {
    return (
      <Link href={resolvedHref} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
