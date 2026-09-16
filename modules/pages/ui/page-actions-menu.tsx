"use client";

import { MoreHorizontal, Signpost, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PagePermissions } from "@/modules/permissions/rules";
import { DeletePageDialog } from "./delete-page-dialog";
import { PageRightsDialog } from "./page-rights-dialog";
import { RenamePageDialog } from "./rename-page-dialog";

// The rarely-taken page actions, folded behind one « ⋯ » so the bar
// foregrounds Modifier and Historique. Each item opens its own controlled
// dialog rendered beside the menu — the pattern of
// accounts/ui/account-actions.tsx, which returns focus cleanly where nesting a
// dialog trigger inside a menu item does not.
export function PageActionsMenu({
  slug,
  special,
  permissions,
}: {
  slug: string;
  /** A special page keeps its address and its existence (CONTEXT.md). */
  special: boolean;
  permissions: PagePermissions;
}) {
  const [dialog, setDialog] = useState<null | "rights" | "rename" | "delete">(
    null
  );

  const canRename = !special && permissions.address;
  const canDelete = !special && permissions.structuring;
  // Nothing rare to offer: no empty « ⋯ » (docs/permissions.md § Ce que voit
  // qui n'a pas le droit). structuring carries both Accès and Supprimer.
  if (!permissions.structuring && !canRename) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Plus d'actions" />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        {/* w-auto: size to the labels, not to the icon trigger's width, so
            « Changer l'adresse » stays on one line. font-medium: match the
            weight of the inline Modifier/Historique buttons (both text-sm). */}
        <DropdownMenuContent align="end" className="w-auto font-medium">
          {/* « Accès » names what the reader is after — who gets in — where
              « Droits » names the machinery (docs/permissions.md). Handing the
              page over is in the same modal: same rung, and it names the owner. */}
          {permissions.structuring && (
            <DropdownMenuItem onClick={() => setDialog("rights")}>
              <UsersRound />
              Modifier les accès…
            </DropdownMenuItem>
          )}
          {canRename && (
            <DropdownMenuItem onClick={() => setDialog("rename")}>
              <Signpost />
              Changer l&apos;adresse…
            </DropdownMenuItem>
          )}
          {/* Set apart and in red: the eye finds the destructive action
              without reading the labels, and it is never next to the rest. */}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDialog("delete")}
              >
                <Trash2 />
                Supprimer…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mounted only while open, so each dialog reads its data on open and
          resets on close for free (accounts/ui/account-actions.tsx). */}
      {dialog === "rights" && (
        <PageRightsDialog slug={slug} onClose={() => setDialog(null)} />
      )}
      {dialog === "rename" && (
        <RenamePageDialog slug={slug} onClose={() => setDialog(null)} />
      )}
      {dialog === "delete" && (
        <DeletePageDialog slug={slug} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
