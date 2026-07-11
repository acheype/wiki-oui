// No "use client": the ComponentBuilder loader must read buttonDefaults as a
// real object (a client module would only expose client references to RSC).
import {
  Calendar,
  CircleQuestionMark,
  FileText,
  House,
  Pencil,
  Settings,
  Star,
  User,
} from "lucide-react";
import { Button as UIButton } from "@/components/ui/button";
import { isWikiHref } from "@/lib/slug";
import { ModalLink, WikiLink } from "./wiki-link";

// French icon whitelist: replaced by the Iconify picker later in v0.2.
const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  roue: Settings,
  maison: House,
  aide: CircleQuestionMark,
  crayon: Pencil,
  page: FileText,
  calendrier: Calendar,
  etoile: Star,
  utilisateur: User,
};

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

// Exhaustive defaults consumed by the ComponentBuilder (omission rule,
// inverse mapping — docs/component-builder.md).
export const buttonDefaults = {
  icon: undefined,
  text: undefined,
  link: undefined,
  title: undefined,
  color: "primary",
  float: "none",
  fullWidth: false,
  newWindow: false,
  popup: "none",
} satisfies { [K in keyof Required<ButtonProps>]: ButtonProps[K] };

// Palette colors ride on shadcn variants when one matches; the others get
// explicit classes on the theme colors added for v0.2 (globals.css).
const colorVariants: Partial<
  Record<ButtonColor, React.ComponentProps<typeof UIButton>["variant"]>
> = {
  default: "outline",
  primary: "default",
  "secondary-1": "secondary",
  danger: "destructive",
  link: "link",
};

const colorClasses: Partial<Record<ButtonColor, string>> = {
  "secondary-2":
    "bg-secondary-2 text-secondary-2-foreground shadow-xs hover:bg-secondary-2/90",
  success: "bg-success text-success-foreground shadow-xs hover:bg-success/90",
  info: "bg-info text-info-foreground shadow-xs hover:bg-info/90",
  warning: "bg-warning text-warning-foreground shadow-xs hover:bg-warning/90",
};

// Built-in component (CONTEXT.md). One semantic, two looks: a full shadcn
// button in page content, a discreet nav-bar button inside a `.layout-slot`
// (the difference is pure CSS, see globals.css).
export function Button({
  icon,
  text,
  link,
  title,
  color = buttonDefaults.color,
  float = buttonDefaults.float,
  fullWidth = buttonDefaults.fullWidth,
  newWindow = buttonDefaults.newWindow,
  popup = buttonDefaults.popup,
}: ButtonProps) {
  const Icon = icon ? icons[icon] : undefined;
  const iconOnly = !text && Icon !== undefined;

  const content = (
    <>
      {Icon && <Icon />}
      {!iconOnly && <span>{text ?? icon ?? "Bouton"}</span>}
    </>
  );

  const className = [
    "wiki-button",
    colorClasses[color],
    float === "right" && "float-right",
    fullWidth && "w-full",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <UIButton
      asChild={Boolean(link)}
      type={link ? undefined : "button"}
      size={iconOnly ? "icon" : "default"}
      variant={colorVariants[color]}
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
