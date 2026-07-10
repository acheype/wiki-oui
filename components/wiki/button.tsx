"use client";

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
import { WikiLink } from "./wiki-link";

// French icon whitelist: the Iconify picker of the authoring backlog will
// replace it (ADR 0010). Names are what page authors type.
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

export type ButtonProps = {
  icon?: string;
  text?: string;
  link?: string;
};

// Built-in component (CONTEXT.md). One semantic, two looks: a full shadcn
// button in page content, a discreet nav-bar button inside a `.layout-slot`
// (the difference is pure CSS, see globals.css).
export function Button({ icon, text, link }: ButtonProps) {
  const Icon = icon ? icons[icon] : undefined;
  const iconOnly = !text && Icon !== undefined;

  const content = (
    <>
      {Icon && <Icon />}
      {!iconOnly && <span>{text ?? icon ?? "Bouton"}</span>}
    </>
  );

  return (
    <UIButton
      asChild={Boolean(link)}
      type={link ? undefined : "button"}
      size={iconOnly ? "icon" : "default"}
      className="wiki-button"
      aria-label={iconOnly ? (text ?? icon) : undefined}
      title={iconOnly ? (text ?? icon) : undefined}
    >
      {link ? <WikiLink href={link}>{content}</WikiLink> : content}
    </UIButton>
  );
}
