import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { isMailerConfigured } from "@/lib/mailer";

// « Mot de passe oublié » (docs/permissions.md § Naissance d'un compte).
// Whether the wiki can send anything is decided here, on the server, so the
// screen promises a mail only where one will actually leave.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mot de passe oublié — WikiOui" };

export default async function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <ForgotPasswordForm canSendMail={isMailerConfigured()} />
    </main>
  );
}
