import { hiddenIfNoAccess } from "@/modules/pages/content";
import { ButtonView } from "../ui/button-view";

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
  /**
   * Advanced: vanish instead of navigating to a page this reader may not
   * read (docs/permissions.md § Liens et boutons vers l'inaccessible).
   */
  hideIfNoAccess?: boolean;
};

// Built-in component (CONTEXT.md), and the registry entry the MDX pipeline
// calls (ADR 0002, lib/mdx.tsx). A plain Server Component on purpose (ADR
// 0013 icon hybrid's other half): resolving hideIfNoAccess needs a
// server-side read of the current person's rights, which the interactive
// button (ui/button-view.tsx, "use client") has no door to. Rendered
// here as a child of <Menu> ("use client" itself), this component's own
// invocation still happens server-side (it carries no "use client"), so an
// inaccessible button never reaches the flight payload at all — the tree
// <Menu> parses already has the hole in it (menu.tsx).
//
// Defaults live here, not in ButtonView: lib/verify-descriptors.ts reads them
// straight off this exported function's destructuring to check them against
// button.yaml (ADR 0013), the file/component pairing it matches by name.
export async function Button({
  icon,
  text,
  link,
  title,
  color = "primary",
  float = "none",
  fullWidth = false,
  newWindow = false,
  popup = "none",
  hideIfNoAccess = false,
}: ButtonProps) {
  if (await hiddenIfNoAccess(link ?? "", hideIfNoAccess)) return null;
  return (
    <ButtonView
      icon={icon}
      text={text}
      link={link}
      title={title}
      color={color}
      float={float}
      fullWidth={fullWidth}
      newWindow={newWindow}
      popup={popup}
    />
  );
}
