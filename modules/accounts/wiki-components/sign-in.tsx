"use client";

import { LogIn } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useId } from "react";
import { signIn } from "@/modules/accounts/session/auth-actions";
import { AuthFormError, useAuthForm } from "@/components/ui/auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DESTINATION_PARAM } from "@/lib/destination";
import { authPagePath, wikiConfig } from "@/wiki.config";

// Built-in component rendered by the `connexion` special page (ADR 0028):
// signing in is a system page of the wiki, hosted by a page like everything else.
// The form reads ?suite= itself, hence the Suspense boundary at the seam.
// `not-prose` and the narrow column: an app system page inside an MDX page owns
// its width and its spacing.
export function SignIn() {
  return (
    <div className="not-prose mx-auto w-full max-w-sm py-6">
      <Suspense>
        <SignInForm openSignUp={wikiConfig.openSignUp} />
      </Suspense>
    </div>
  );
}

// One field for the email and the identifier: the wiki knows which one it
// received (modules/accounts/username.ts), so nobody has to.
//
// This system page is a wiki page (ADR 0028), which knows nothing of the query
// string it was called with — so where the visitor was heading is read here,
// client-side, like every other state the URL carries.
function SignInForm({
  openSignUp,
}: {
  /** Free sign-up: the « Créer un compte » below appears only where it is on. */
  openSignUp?: boolean;
}) {
  const destination = useSearchParams().get(DESTINATION_PARAM) ?? undefined;
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
        <Label htmlFor={identifierId} className="gap-1">
          Adresse e-mail ou identifiant
          <span aria-hidden className="text-destructive">
            *
          </span>
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
          autoComplete="current-password"
          required
          disabled={isPending}
        />
      </div>

      <AuthFormError error={error} />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Connexion…" : "Se connecter"}
      </Button>

      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={authPagePath("forgotPassword")}
          className="underline underline-offset-4"
        >
          Mot de passe oublié ?
        </Link>
        {openSignUp && (
          <span>
            Pas encore de compte ?{" "}
            <Link
              href={destinationLink(authPagePath("signUp"), destination)}
              className="underline underline-offset-4"
            >
              Créer un compte
            </Link>
          </span>
        )}
      </div>
    </form>
  );
}

/** Carries where the visitor was heading across to the other system page. */
function destinationLink(path: string, destination?: string): string {
  return destination
    ? `${path}?${DESTINATION_PARAM}=${encodeURIComponent(destination)}`
    : path;
}
