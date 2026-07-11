import Link from "next/link";
import { isExternalHref, isWikiHref } from "@/lib/slug";
import { ModalLink } from "./internal/modal-link";

// The builder fields (text, link, target) map to the markdown link it emits
// (ADR 0006), not to these render props; its defaults live in wiki-link.yaml
// (ADR 0013). The interactive modal is in internal/modal-link.tsx.
type WikiLinkProps = React.ComponentPropsWithoutRef<"a">;

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
