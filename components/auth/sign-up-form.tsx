"use client";

// Free sign-up, on the wikis that open it (docs/permissions.md § Naissance
// d'un compte). Same identity as an invitation gives, plus the address the
// invitation would have carried: nothing tells the two kinds of account apart
// afterwards, and nothing here grants anything — a new account is a signed-in
// visitor until a group says otherwise.

import { UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { signUp } from "@/app/auth-actions";
import {
  IdentityFields,
  useIdentityFields,
} from "@/components/auth/identity-fields";
import {
  AuthFormError,
  NewPasswordField,
  useAuthForm,
} from "@/components/auth/use-auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/installation";

export function SignUpForm({ destination }: { destination?: string }) {
  const emailId = useId();
  const identity = useIdentityFields();
  const { submit, error, isPending } = useAuthForm((fields) =>
    signUp({
      name: identity.name,
      username: identity.username,
      email: String(fields.get("email") ?? ""),
      password: String(fields.get("password") ?? ""),
      destination,
    })
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <UserRoundPlus className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">Créer un compte</h1>
      </div>

      <IdentityFields fields={identity} disabled={isPending} />

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
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          Elle reste privée : seuls les administrateurs la voient.
        </p>
      </div>

      <NewPasswordField minLength={MIN_PASSWORD_LENGTH} disabled={isPending} />

      <AuthFormError error={error} />

      <Button type="submit" disabled={isPending || identity.name.trim() === ""}>
        {isPending ? "Création…" : "Créer mon compte"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Vous avez déjà un compte ?{" "}
        <Link href="/connexion" className="underline underline-offset-4">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
