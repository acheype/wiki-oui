import { Suspense } from "react";
import { SignInForm } from "@/modules/accounts/sign-in-form";
import { wikiConfig } from "@/wiki.config";

// Built-in component rendered by the `connexion` special page (ADR 0028):
// signing in is a screen of the wiki, hosted by a page like everything else.
// The form reads ?suite= itself, hence the Suspense boundary at the seam.
// `not-prose` and the narrow column: an app screen inside an MDX page owns
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
