"use client";

// The link an administrator hands over (docs/permissions.md § Naissance d'un
// compte). It is shown whatever happened to the mail: sent, unsendable for
// want of SMTP, or refused by the server — in all three cases the invitation
// stands, and copying the link is the delivery that never fails.
//
// A refusal says what the server answered, behind a disclosure: the person
// reading is the one who configured the SMTP settings, and « Invalid login:
// 535 » is what tells them which of the five is wrong. Nobody else ever sees
// this — the system pages open to strangers say the neutral sentence instead.

import { AlertTriangle, Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MailFailure } from "@/modules/accounts/link/invitations";

export function LinkToCopy({
  url,
  failure,
  email,
}: {
  url: string;
  /** null once the mail left; otherwise why it did not. */
  failure: MailFailure | null;
  /** Named in the note, so a batch of links says which is whose. */
  email?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="grid gap-1.5">
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        {failure?.cause === "refused" && (
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0 text-destructive"
            aria-hidden
          />
        )}
        <span>{deliveryNote(failure, email)}</span>
      </p>
      {failure?.cause === "refused" && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer underline underline-offset-4">
            Détail de l&apos;erreur d&apos;envoi
          </summary>
          <p className="mt-1 font-mono break-all">{failure.detail}</p>
          <p className="mt-1">
            Vérifiez les réglages d&apos;envoi du wiki (SMTP_HOST, SMTP_PORT,
            SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM).
          </p>
        </details>
      )}
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={url}
          className="font-mono text-xs"
          onFocus={(event) => event.target.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Copier le lien"
          onClick={copy}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

function deliveryNote(failure: MailFailure | null, email?: string): string {
  const who = email ? ` à ${email}` : "";
  if (!failure) {
    return `Lien envoyé${who}. Vous pouvez aussi le transmettre vous-même :`;
  }
  if (failure.cause === "refused") {
    return `L'envoi${who} a échoué : le serveur d'envoi a refusé le message. Transmettez ce lien vous-même :`;
  }
  return `Aucun serveur d'envoi n'est configuré : transmettez ce lien${who} vous-même.`;
}
