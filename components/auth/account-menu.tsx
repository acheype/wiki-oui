"use client";

import { LogIn, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { signOut } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Identity } from "@/lib/permissions";

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
  const [isPending, startTransition] = useTransition();

  if (!identity) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link href={`/connexion?suite=${encodeURIComponent(pathname)}`}>
          <LogIn />
          Se connecter
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isPending}>
          <UserRound />
          {identity.name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-mono text-xs font-normal text-muted-foreground">
          {identity.username}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => startTransition(async () => void (await signOut()))}
        >
          <LogOut />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
