"use client";

import { LogIn, LogOut, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { signOut } from "@/modules/accounts/auth/actions";
import { DeleteOwnAccountDialog } from "@/modules/accounts/ui/delete-own-account-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DESTINATION_PARAM } from "@/lib/destination";
import type { Identity } from "@/modules/permissions/rules";
import { authPagePath } from "@/wiki.config";

// The account corner of the top bar. It lives in the chrome rather than in
// the seeded quick-access wheel, so that wikis installed before the accounts
// existed get it too — a seed never runs again on a populated database.
export function AccountMenu({
  identity,
}: {
  /** null for a visitor: nobody is signed in. */
  identity: Identity | null;
}) {
  const pathname = usePathname();
  const [erasing, setErasing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!identity) {
    return (
      <Link
        href={`${authPagePath("signIn")}?${DESTINATION_PARAM}=${encodeURIComponent(pathname)}`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <LogIn />
        Se connecter
      </Link>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" disabled={isPending} />}
        >
          <UserRound />
          {identity.name}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* The username labels the whole menu: every item acts on this
              account, and Base UI only accepts a label inside a group. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-mono text-xs font-normal text-muted-foreground">
              {identity.username}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => startTransition(async () => void (await signOut()))}
            >
              <LogOut />
              Se déconnecter
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* The erasure belongs to the person, not to an administrator's
                goodwill (RGPD), and this menu is the only place every account
                reaches — v0.5 has no profile system page yet. */}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setErasing(true)}
            >
              <Trash2 />
              Supprimer mon compte…
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {erasing && <DeleteOwnAccountDialog onClose={() => setErasing(false)} />}
    </>
  );
}
