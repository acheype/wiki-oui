"use client";

// Client component (ADR 0013 icon hybrid): the icon is fetched client-side by
// <Icon> (GET /api/icons/[id]) instead of inlined on the server, so this
// component bundles no Iconify data — at the cost of the icon appearing just
// after hydration rather than in the SSR HTML. Being client, it also keeps
// its props across the RSC boundary, so <Menu> recognizes it by shape
// (menu.tsx).
//
// Split from the `Button` the registry serves (button.tsx, issue #13):
// hideIfNoAccess needs a server-side read of the current person's rights, and
// a client component has no door to that. button.tsx resolves it first and
// renders this view only once a link is known to be reachable — or renders
// it unconditionally when there is nothing to hide from.
import { Button as UIButton } from "@/components/ui/button";
import { isWikiHref } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { ModalLink } from "./modal-link";
import { WikiLinkView } from "./wiki-link-view";
import type { ButtonColor, ButtonProps } from "../button";

// One entry per palette color, enforced by the compiler: either a shadcn
// variant or explicit classes on the theme colors added for v0.2 (globals.css).
const colorStyles: Record<
  ButtonColor,
  {
    variant?: React.ComponentProps<typeof UIButton>["variant"];
    className?: string;
  }
> = {
  default: { variant: "outline" },
  primary: { variant: "default" },
  "secondary-1": { variant: "secondary" },
  "secondary-2": {
    className:
      "bg-secondary-2 text-secondary-2-foreground shadow-xs hover:bg-secondary-2/90",
  },
  success: {
    className: "bg-success text-success-foreground shadow-xs hover:bg-success/90",
  },
  info: { className: "bg-info text-info-foreground shadow-xs hover:bg-info/90" },
  warning: {
    className: "bg-warning text-warning-foreground shadow-xs hover:bg-warning/90",
  },
  danger: { variant: "destructive" },
  link: { variant: "link" },
};

// Two looks, one semantic (CONTEXT.md): a full shadcn button in page content,
// a discreet nav-bar button inside a `.layout-slot` (the difference is pure
// CSS, see globals.css). Defaults are resolved by the wrapper (button.tsx)
// before this ever mounts, not repeated here — verify-descriptors.ts checks
// button.yaml against that wrapper's own destructuring.
export function ButtonView({
  icon,
  text,
  link,
  title,
  color = "primary",
  float = "none",
  fullWidth = false,
  newWindow = false,
  popup = "none",
}: Omit<ButtonProps, "hideIfNoAccess">) {
  const iconOnly = Boolean(icon) && !text;

  const content = (
    <>
      {icon && <Icon id={icon} />}
      {!iconOnly && <span>{text ?? "Bouton"}</span>}
    </>
  );

  const className = cn(
    "wiki-button",
    colorStyles[color].className,
    float === "right" && "float-right",
    fullWidth && "w-full"
  );

  return (
    <UIButton
      asChild={Boolean(link)}
      type={link ? undefined : "button"}
      size={iconOnly ? "icon" : "default"}
      variant={colorStyles[color].variant}
      className={className}
      aria-label={iconOnly ? (title ?? text ?? icon) : undefined}
      title={title ?? (iconOnly ? (text ?? icon) : undefined)}
    >
      {link ? (
        <ButtonLink link={link} newWindow={newWindow} popup={popup}>
          {content}
        </ButtonLink>
      ) : (
        content
      )}
    </UIButton>
  );
}

// Forwards the props UIButton's asChild slot injects (className, title…).
function ButtonLink({
  link,
  newWindow,
  popup,
  children,
  ...rest
}: React.ComponentPropsWithoutRef<"a"> & {
  link: string;
  newWindow: boolean;
  popup: "none" | "click" | "hover";
}) {
  if (popup !== "none") {
    const href = isWikiHref(link) ? `/${link}` : link;
    return (
      <ModalLink href={href} trigger={popup} {...rest}>
        {children}
      </ModalLink>
    );
  }
  return (
    <WikiLinkView href={link} target={newWindow ? "_blank" : undefined} {...rest}>
      {children}
    </WikiLinkView>
  );
}
