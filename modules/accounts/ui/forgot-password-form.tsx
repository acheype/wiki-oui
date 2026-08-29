"use client";

// « Mot de passe oublié » (docs/permissions.md § Naissance d'un compte): the
// same single-use link as an invitation, asked for by the person themselves.
// The answer never varies — whether the address is known is not this system
// page's to say — and on a wiki with no SMTP the system page says so plainly instead of
// promising a mail nobody will send.
//
// A wiki whose SMTP is configured but broken says so too, rather than send
// the person waiting for a mail that never left. That answer says nothing
// about the address: the server is asked either way (modules/accounts/invitation/mailer.ts). No
// technical detail here — a stranger can do nothing with « 535 Auth failed »
// but learn about the host, so the sentence points at an administrator, who
// reads the reason on their own system pages and in the logs.

import { KeyRound, MailWarning } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { requestPasswordLink } from "@/modules/accounts/invitation/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAIL_FAILURE_NOTICE } from "@/modules/accounts/invitation/rules";
import { authPagePath } from "@/wiki.config";

export function ForgotPasswordForm({ canSendMail }: { canSendMail: boolean }) {
  const emailId = useId();
  const [asked, setAsked] = useState(false);
  const [undelivered, setUndelivered] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    startTransition(async () => {
      setUndelivered((await requestPasswordLink(email)) !== null);
      setAsked(true);
    });
  }

  if (!canSendMail) {
    return (
      <div className="flex flex-col gap-6 text-center">
        <KeyRound className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          Mot de passe oublié
        </h1>
        <p className="text-sm text-muted-foreground">
          Ce wiki n&apos;envoie pas de courriel. Demandez à un administrateur un
          lien de mot de passe : il pourra vous le transmettre directement.
        </p>
        <Button asChild variant="outline">
          <Link href={authPagePath("signIn")}>Retour à la connexion</Link>
        </Button>
      </div>
    );
  }

  if (asked && undelivered) {
    return (
      <div className="flex flex-col gap-6 text-center">
        <MailWarning className="mx-auto size-8 text-destructive" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          Le courriel n&apos;est pas parti
        </h1>
        <p className="text-sm text-muted-foreground">{MAIL_FAILURE_NOTICE}</p>
        <p className="text-sm text-muted-foreground">
          Un administrateur peut aussi vous transmettre un lien de mot de passe
          directement, sans courriel.
        </p>
        <Button asChild variant="outline">
          <Link href={authPagePath("signIn")}>Retour à la connexion</Link>
        </Button>
      </div>
    );
  }

  if (asked) {
    return (
      <div className="flex flex-col gap-6 text-center">
        <KeyRound className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          Vérifiez votre boîte mail
        </h1>
        <p className="text-sm text-muted-foreground">
          Si un compte utilise cette adresse, un lien vient de lui être envoyé.
          Il est valable 24 heures et ne fonctionne qu&apos;une seule fois.
        </p>
        <Button asChild variant="outline">
          <Link href={authPagePath("signIn")}>Retour à la connexion</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <KeyRound className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          Mot de passe oublié
        </h1>
        <p className="text-sm text-muted-foreground">
          Nous vous enverrons un lien pour en choisir un nouveau.
        </p>
      </div>

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
          autoFocus
          disabled={isPending}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Envoi…" : "Envoyer le lien"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href={authPagePath("signIn")}
          className="underline underline-offset-4"
        >
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
