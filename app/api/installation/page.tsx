import type { Metadata } from "next";
import { InstallationForm } from "@/components/auth/installation-form";

// The proxy rewrites every address here until the wiki is installed, and
// stops the day it is (ADR 0027). No site chrome around it: there is no wiki
// to browse yet, and its menu would lead nowhere.
//
// Under /api like the ComponentBuilder preview, and for the same reason: a
// screen that must answer before any page exists cannot be a page, and the
// reserved segment is the only place that is not a slug (ADR 0028). Nobody
// reads this address — the rewrite keeps whatever the visitor asked for.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Installation — WikiOui" };

export default function InstallationPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <InstallationForm />
    </main>
  );
}
