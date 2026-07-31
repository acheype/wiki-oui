"use client";

// The link an administrator hands over (docs/permissions.md § Naissance d'un
// compte). It is shown whatever happened to the mail: sent, unsendable for
// want of SMTP, or refused by the server — in all three cases the invitation
// stands, and copying the link is the delivery that never fails.

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MailDelivery } from "@/lib/invitations";

export function LinkToCopy({
  url,
  delivery,
  email,
}: {
  url: string;
  delivery: MailDelivery;
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
      <p className="text-xs text-muted-foreground">
        {deliveryNote(delivery, email)}
      </p>
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

function deliveryNote(delivery: MailDelivery, email?: string): string {
  const who = email ? ` à ${email}` : "";
  if (delivery === "sent") {
    return `Lien envoyé${who}. Vous pouvez aussi le transmettre vous-même :`;
  }
  if (delivery === "failed") {
    return `L'envoi${who} a échoué. Transmettez ce lien vous-même :`;
  }
  return `Aucun serveur d'envoi n'est configuré : transmettez ce lien${who} vous-même.`;
}
