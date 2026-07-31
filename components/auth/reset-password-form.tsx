"use client";

// The other end of the same link (docs/permissions.md § Naissance d'un
// compte): the address already holds an account, so there is nothing to name
// — only a password to choose. The other sessions of the account go with it,
// and this one starts signed in.

import { KeyRound } from "lucide-react";
import { resetPasswordLink } from "@/app/auth-actions";
import {
  AuthFormError,
  NewPasswordField,
  useAuthForm,
} from "@/components/auth/auth-form";
import { Button } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH } from "@/lib/installation";

export function ResetPasswordForm({
  token,
  email,
  name,
}: {
  token: string;
  email: string;
  name: string;
}) {
  const { submit, error, isPending } = useAuthForm((fields) =>
    resetPasswordLink({
      token,
      password: String(fields.get("password") ?? ""),
    })
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <KeyRound className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          Choisir un nouveau mot de passe
        </h1>
        <p className="text-sm text-muted-foreground">
          {name} — {email}
        </p>
      </div>

      <NewPasswordField minLength={MIN_PASSWORD_LENGTH} disabled={isPending} />

      <AuthFormError error={error} />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Enregistrement…" : "Enregistrer et me connecter"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Vos autres sessions seront fermées.
      </p>
    </form>
  );
}
