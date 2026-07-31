import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { wikiConfig } from "@/wiki.config";

// Free sign-up, closed by default (docs/permissions.md § Naissance d'un
// compte). Closed, the screen does not exist at all rather than refusing:
// there is nothing here to explain to someone who was never offered it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Créer un compte — WikiOui" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  if (!wikiConfig.openSignUp) notFound();

  const { suite } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <SignUpForm destination={suite} />
    </main>
  );
}
