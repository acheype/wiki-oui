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
import { Button } from "@/components/ui/button";
import { WikiLink } from "./wiki-link";

// French icon whitelist: the Iconify picker of the authoring backlog will
// replace it (ADR 0010). Names are what page authors type.
const icones: Record<string, React.ComponentType<{ className?: string }>> = {
  roue: Settings,
  maison: House,
  aide: CircleQuestionMark,
  crayon: Pencil,
  page: FileText,
  calendrier: Calendar,
  etoile: Star,
  utilisateur: User,
};

export type BoutonProps = {
  icone?: string;
  texte?: string;
  lien?: string;
};

// Built-in component (CONTEXT.md). One semantic, two looks: a full shadcn
// button in page content, a discreet nav-bar button inside a `.layout-slot`
// (the difference is pure CSS, see globals.css).
export function Bouton({ icone, texte, lien }: BoutonProps) {
  const Icone = icone ? icones[icone] : undefined;
  const iconOnly = !texte && Icone !== undefined;

  const content = (
    <>
      {Icone && <Icone />}
      {!iconOnly && <span>{texte ?? icone ?? "Bouton"}</span>}
    </>
  );

  return (
    <Button
      asChild={Boolean(lien)}
      type={lien ? undefined : "button"}
      size={iconOnly ? "icon" : "default"}
      className="wiki-bouton"
      aria-label={iconOnly ? (texte ?? icone) : undefined}
      title={iconOnly ? (texte ?? icone) : undefined}
    >
      {lien ? <WikiLink href={lien}>{content}</WikiLink> : content}
    </Button>
  );
}
