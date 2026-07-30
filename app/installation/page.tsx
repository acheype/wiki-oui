import type { Metadata } from "next";
import { InstallationForm } from "@/components/auth/installation-form";

// The proxy sends every route here until the wiki is installed, and stops the
// day it is (ADR 0027). No site chrome around it: there is no wiki to browse
// yet, and its menu would lead nowhere.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Installation — WikiOui" };

export default function InstallationPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <InstallationForm />
    </main>
  );
}
