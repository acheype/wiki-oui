import type { Metadata } from "next";
import { SignInForm } from "@/components/auth/sign-in-form";
import { wikiConfig } from "@/wiki.config";

// A route rather than a wiki page: signing in is not content, and the screen
// must answer even where content would refuse to (the « Se connecter » button
// of a page one may not read).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connexion — WikiOui" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  const { suite } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <SignInForm destination={suite} openSignUp={wikiConfig.openSignUp} />
    </main>
  );
}
