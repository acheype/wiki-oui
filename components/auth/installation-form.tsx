"use client";

import { Info, Sprout } from "lucide-react";
import { useId } from "react";
import { installWiki } from "@/app/installation-actions";
import { AuthFormError, useAuthForm } from "@/components/auth/use-auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INSTALLER, MIN_PASSWORD_LENGTH } from "@/lib/installation";

// First visit of a wiki that has never been installed (ADR 0027). It asks for
// an email and a password, nothing else: the display name and the identifier
// are imposed, and are shown rather than requested so that nobody wonders
// what to type there.
export function InstallationForm() {
  const emailId = useId();
  const passwordId = useId();
  const { submit, error, isPending } = useAuthForm((fields) =>
    installWiki({
      email: String(fields.get("email") ?? ""),
      password: String(fields.get("password") ?? ""),
    })
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Sprout className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          Installer votre wiki
        </h1>
        <p className="text-sm text-muted-foreground">
          Créez le compte administrateur de ce wiki. Vous pourrez ensuite inviter d&apos;autres 
          personnes et gérer les droits.
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border bg-muted/40 px-4 py-3 text-sm">
        <dt className="text-muted-foreground">Nom affiché</dt>
        <dd className="font-medium">{INSTALLER.name}</dd>
        <dt className="text-muted-foreground">Identifiant</dt>
        <dd className="font-mono">{INSTALLER.username}</dd>
      </dl>
      <p className="-mt-4 flex gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Par convention, ces deux valeurs sont les mêmes sur toutes les installations WikiOui.
          Vous pourrez néanmoins les modifier une fois connecté si votre contexte l&apos;exige.
        </span>
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor={emailId} className="gap-1">
          Adresse e-mail
          <span aria-hidden className="text-destructive">
            *
          </span>
        </Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={passwordId} className="gap-1">
          Mot de passe
          <span aria-hidden className="text-destructive">
            *
          </span>
        </Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          {MIN_PASSWORD_LENGTH} caractères minimum.
        </p>
      </div>

      <AuthFormError error={error} />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Installation…" : "Créer le compte administrateur"}
      </Button>
    </form>
  );
}
