import Link from "next/link";
import { Suspense } from "react";
import { SignUpForm } from "@/modules/accounts/sign-up-form";
import { Button } from "@/components/ui/button";
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
