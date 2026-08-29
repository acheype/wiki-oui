"use client";

import { UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useId } from "react";
import { signUp } from "@/modules/accounts/auth-actions";
import {
  IdentityFields,
  useIdentityFields,
} from "@/modules/accounts/ui/identity-fields";
import {
  AuthFormError,
  NewPasswordField,
  useAuthForm,
} from "@/components/ui/auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DESTINATION_PARAM } from "@/lib/destination";
import { MIN_PASSWORD_LENGTH } from "@/modules/settings/installation";
import { authPagePath, wikiConfig } from "@/wiki.config";

// Built-in component rendered by the `inscription` special page (ADR 0028).
export function SignUp() {
  return (
    <div className="not-prose mx-auto w-full max-w-sm py-6">
      {wikiConfig.openSignUp ? (
        <Suspense>
          <SignUpForm />
        </Suspense>
      ) : (
        <ClosedSignUp />
      )}
    </div>
  );
}

/**
 * Free sign-up is closed by default (docs/permissions.md § Naissance d'un
 * compte). The page exists all the same — its slug is reserved on every wiki,
 * open or not — so it says where accounts come from here rather than showing
 * a form nobody may submit.
 */
function ClosedSignUp() {
  return (
    <div className="flex flex-col gap-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        L&apos;inscription n&apos;est pas ouverte
      </h1>
      <p className="text-sm text-muted-foreground">
        Sur ce wiki, les comptes naissent d&apos;une invitation. Demandez-en
        une à un administrateur : il vous enverra un lien pour créer le vôtre.
      </p>
      <Button asChild variant="outline">
        <Link href={authPagePath("signIn")}>Aller à la connexion</Link>
      </Button>
    </div>
  );
}

// Free sign-up, on the wikis that open it (docs/permissions.md § Naissance
// d'un compte). Same identity as an invitation gives, plus the address the
// invitation would have carried: nothing tells the two kinds of account apart
// afterwards, and nothing here grants anything — a new account is a signed-in
// visitor until a group says otherwise.
function SignUpForm() {
  const destination = useSearchParams().get(DESTINATION_PARAM) ?? undefined;
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
        <Link
          href={authPagePath("signIn")}
          className="underline underline-offset-4"
        >
          Se connecter
        </Link>
      </p>
    </form>
  );
}
