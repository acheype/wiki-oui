"use client";

// Client component (ADR 0013 icon hybrid): the icon is fetched client-side by
// <Icon> (GET /api/icons/[id]) instead of inlined on the server, so Button
// bundles no Iconify data — at the cost of the icon appearing just after
// hydration rather than in the SSR HTML. Being client, Button also keeps its
// props across the RSC boundary, so <Menu> recognizes it by shape (menu.tsx).
import { Button as UIButton } from "@/components/ui/button";
import { isWikiHref } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { Icon } from "./internal/icon";
import { ModalLink } from "./internal/modal-link";
import { WikiLink } from "./wiki-link";

export type ButtonColor =
  | "default"
  | "primary"
  | "secondary-1"
  | "secondary-2"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "link";

export type ButtonProps = {
  /** Iconify id from the embedded sets, e.g. `lucide:settings`. */
  icon?: string;
  text?: string;
  link?: string;
  /** Hover text (HTML title). */
  title?: string;
  color?: ButtonColor;
  /** Tailwind float; replaces YesWiki's Bootstrap `pull-right`. */
  float?: "none" | "right";
  /** Replaces YesWiki's Bootstrap `btn-block`. */
  fullWidth?: boolean;
  newWindow?: boolean;
  /** Opens the linked content in a popup (works towards wiki pages). */
  popup?: "none" | "click" | "hover";
};

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

// Built-in component (CONTEXT.md). One semantic, two looks: a full shadcn
// button in page content, a discreet nav-bar button inside a `.layout-slot`
// (the difference is pure CSS, see globals.css).
export function Button({
  icon,
  text,
  link,
  title,
  color = "primary",
  float = "none",
  fullWidth = false,
  newWindow = false,
  popup = "none",
}: ButtonProps) {
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
    <WikiLink href={link} target={newWindow ? "_blank" : undefined} {...rest}>
      {children}
    </WikiLink>
  );
}
