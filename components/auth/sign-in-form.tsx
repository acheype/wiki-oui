"use client";

import { LogIn } from "lucide-react";
import { useId } from "react";
import { signIn } from "@/app/auth-actions";
import { AuthFormError, useAuthForm } from "@/components/auth/use-auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// One field for the email and the identifier: the wiki knows which one it
// received (lib/username.ts), so nobody has to.
export function SignInForm({ destination }: { destination?: string }) {
  const identifierId = useId();
  const passwordId = useId();
  const { submit, error, isPending } = useAuthForm((fields) =>
    signIn({
      identifier: String(fields.get("identifier") ?? ""),
      password: String(fields.get("password") ?? ""),
      destination,
    })
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <LogIn className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">Se connecter</h1>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={identifierId}>
          Adresse e-mail ou identifiant
        </Label>
        <Input
          id={identifierId}
          name="identifier"
          autoComplete="username"
          required
          autoFocus
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={passwordId}>Mot de passe</Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
        />
      </div>

      <AuthFormError error={error} />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
