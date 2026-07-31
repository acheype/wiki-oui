import nodemailer, { type Transporter } from "nodemailer";
import {
  INVITATION_LIFETIME_DAYS,
  type LinkPurpose,
  type MailDelivery,
  RESET_LIFETIME_DAYS,
} from "@/lib/invitations";

// Sending a link by mail (docs/permissions.md § Naissance d'un compte). SMTP
// is a delivery mode, never a dependency: with it the wiki sends the link,
// without it the administrator copies it and hands it over as they wish —
// and what the person then goes through is the same screen either way. So
// nothing here ever decides whether a gesture succeeded; it only says what
// became of the delivery.

// Configured by environment (see .env.example): a connection string and the
// address the wiki writes from. Both are needed — an SMTP server that accepts
// a message with no sender is the exception, not the rule.
function smtpUrl(): string | undefined {
  return process.env.SMTP_URL;
}

function sender(): string | undefined {
  return process.env.SMTP_FROM;
}

/** Whether the wiki can send at all — what the invitation screens announce. */
export function isMailerConfigured(): boolean {
  return Boolean(smtpUrl() && sender());
}

// One transport for the process: nodemailer pools its connections, and
// rebuilding it per mail would reconnect for every invitation of a batch.
let transporter: Transporter | null = null;

function transport(url: string): Transporter {
  transporter ??= nodemailer.createTransport(url);
  return transporter;
}

/**
 * Delivers a link, or says why it did not. A failure is reported rather than
 * thrown: the link exists, the invitation stands, and the screen falls back
 * on what it can always do — show it to be copied.
 */
export async function sendAccountLink(mail: {
  to: string;
  url: string;
  purpose: LinkPurpose;
}): Promise<MailDelivery> {
  const url = smtpUrl();
  const from = sender();
  if (!url || !from) return "not-configured";

  const { subject, text } = message(mail.purpose, mail.url);
  try {
    await transport(url).sendMail({ from, to: mail.to, subject, text });
    return "sent";
  } catch {
    return "failed";
  }
}

// Deliberately plain text, and deliberately terse: the wiki has one thing to
// say, and a mail that looks like an application is a mail that looks like
// phishing. Neutral wording throughout — the wiki knows a display name at
// best, never how the person wants to be addressed.
function message(
  purpose: LinkPurpose,
  url: string
): { subject: string; text: string } {
  if (purpose === "invitation") {
    return {
      subject: "Votre invitation à rejoindre le wiki",
      text: [
        "Bonjour,",
        "",
        "Une invitation à rejoindre le wiki vous a été adressée. Ce lien vous permet de choisir votre identifiant et votre mot de passe :",
        "",
        url,
        "",
        `Il est valable ${INVITATION_LIFETIME_DAYS} jours et ne fonctionne qu'une seule fois.`,
      ].join("\n"),
    };
  }
  return {
    subject: "Réinitialisation de votre mot de passe",
    text: [
      "Bonjour,",
      "",
      "Ce lien vous permet de choisir un nouveau mot de passe :",
      "",
      url,
      "",
      `Il est valable ${RESET_LIFETIME_DAYS * 24} heures et ne fonctionne qu'une seule fois.`,
      "Si vous n'avez rien demandé, ce message ne demande aucune action : le lien expirera de lui-même.",
    ].join("\n"),
  };
}
