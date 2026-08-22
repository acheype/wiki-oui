import nodemailer, { type Transporter } from "nodemailer";
import {
  INVITATION_LIFETIME_DAYS,
  type LinkPurpose,
  type MailFailure,
  RESET_LIFETIME_DAYS,
} from "@/modules/accounts/invitations";

// Sending a link by mail (docs/permissions.md § Naissance d'un compte). SMTP
// is a delivery mode, never a dependency: with it the wiki sends the link,
// without it the administrator copies it and hands it over as they wish —
// and what the person then goes through is the same system page either way. So
// nothing here ever decides whether a action succeeded; it only says what
// became of the delivery.

// Configured by environment (see .env.example), one setting per line rather
// than a connection string: what an operator has in hand is a host, a port
// and an account — a URL asks them to assemble it, and to percent-encode a
// password whose @ or / would otherwise break it silently. These settings
// move to the configuration system page the day `Settings` grows (ADR 0027).
interface SmtpSettings {
  host: string;
  port: number;
  /** TLS from the first byte (port 465); elsewhere STARTTLS upgrades it. */
  secure: boolean;
  /** Both or neither: a relay that authenticates asks for the pair. */
  auth?: { user: string; pass: string };
}

const DEFAULT_SMTP_PORT = 587;
/** The port that speaks TLS from the first byte, and the only usual one. */
const IMPLICIT_TLS_PORT = 465;

function smtpSettings(): SmtpSettings | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT) || DEFAULT_SMTP_PORT;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  return {
    host,
    port,
    // Left unset, the port decides — the one setting nobody should have to
    // think about, and the one most often wrong when they do.
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE.trim().toLowerCase() === "true"
      : port === IMPLICIT_TLS_PORT,
    ...(user && pass ? { auth: { user, pass } } : {}),
  };
}

/** The address the wiki writes from: a server accepting none is the exception. */
function sender(): string | undefined {
  return process.env.SMTP_FROM?.trim() || undefined;
}

/** Whether the wiki can send at all — what the invitation system pages announce. */
export function isMailerConfigured(): boolean {
  return Boolean(smtpSettings() && sender());
}

// One transport for the process: nodemailer pools its connections, and
// rebuilding it per mail would reconnect for every invitation of a batch.
let transporter: Transporter | null = null;

function transport(settings: SmtpSettings): Transporter {
  transporter ??= nodemailer.createTransport(settings);
  return transporter;
}

/**
 * Delivers a link, or says why it did not. A failure is reported rather than
 * thrown: the link exists, the invitation stands, and the system page falls back
 * on what it can always do — show it to be copied.
 */
export async function sendAccountLink(mail: {
  to: string;
  url: string;
  purpose: LinkPurpose;
}): Promise<MailFailure | null> {
  const settings = smtpSettings();
  const from = sender();
  if (!settings || !from) return { cause: "not-configured" };

  const { subject, text } = message(mail.purpose, mail.url);
  try {
    await transport(settings).sendMail({ from, to: mail.to, subject, text });
    return null;
  } catch (error) {
    return refused(error, `envoi à ${mail.to}`);
  }
}

/**
 * Whether a mail could leave, without sending one. « Mot de passe oublié »
 * must answer the same thing for an address the wiki knows and one it does
 * not — so where there is nothing to send, it proves it could have. A broken
 * server is then announced for every address alike, and the announcement
 * teaches nobody which addresses hold an account.
 */
export async function probeMailer(): Promise<MailFailure | null> {
  const settings = smtpSettings();
  if (!settings || !sender()) return { cause: "not-configured" };

  try {
    await transport(settings).verify();
    return null;
  } catch (error) {
    return refused(error, "vérification du serveur d'envoi");
  }
}

/**
 * What the server said, kept for the administrator who configured it: the
 * message names the credential, the host or the certificate at fault, which
 * is what a misconfiguration needs to be found. It also goes to the logs —
 * an administrator who was not at the keyboard has no other way to learn of
 * it, the wiki having nowhere yet to record one (backlog: table `Settings`).
 */
function refused(error: unknown, context: string): MailFailure {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[wikioui] SMTP — ${context} : ${detail}`);
  return { cause: "refused", detail };
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
