import Link from "next/link";
import { isExternalHref, isWikiHref } from "@/lib/slug";
import { ModalLink } from "./ui/modal-link";
import type { WikiLinkProps } from "./wiki-components/wiki-link";

// Split from the `WikiLink` the registry serves (wiki-components/wiki-link.tsx,
// issue #13), the same pattern as Button/ButtonView (ui/button-view.tsx) and
// for the same reason: hideIfNoAccess needs a server-side read of the current
// person's rights, and this view is also rendered directly by two callers
// that must stay free of that server-only import —
// files/wiki-components/image.tsx's clickable image, and
// ui/button-view.tsx's plain navigating link ("use client", ADR 0013's icon
// hybrid). Kept at the module's root, not ui/, so image.tsx can reach it too
// (ADR 0029: a root file is a module's public interface). wiki-link.tsx
// resolves the check first and renders this view only once a link is known
// to be reachable, or unconditionally when hideIfNoAccess was never asked.
//
// target comes from the author via an annotation: "_blank" or "modal"
// (ADR 0006); the interactive modal itself is in ui/modal-link.tsx.
export function WikiLinkView({
  href = "",
  target,
  children,
  ...rest
}: Omit<WikiLinkProps, "hideIfNoAccess">) {
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
