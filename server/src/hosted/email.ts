import type { Request } from 'express';
import { tr } from '../utils/i18n';

// Emails in hosted mode: confirming an address, resetting a password, changing the sign-in email, a trial
// about to be deleted. Until a real sender exists (NEW-15) they go to the server log, links and all, which
// is fine for staging only.
export interface Email {
  to: string;
  subject: string;
  text: string;
}

export type EmailTransport = (email: Email) => Promise<void> | void;

const logTransport: EmailTransport = ({ to, subject, text }) => {
  console.log(`[email] to ${to}: ${subject}\n${text}`);
};

let transport: EmailTransport = logTransport;
/** Tests: capture emails instead of logging them (call with no argument to restore). */
export function setEmailTransport(t?: EmailTransport) { transport = t ?? logTransport; }

/** Sends an email. A failed send is logged, never thrown: the page answers the same either way. */
export async function sendEmail(email: Email): Promise<void> {
  try {
    await transport(email);
  } catch (err) {
    console.error(`[email] sending to ${email.to} failed:`, err);
  }
}

/**
 * A link for an email. PUBLIC_URL (like https://app.tidyquest.org) is the address people use; without
 * it the link follows the request, which a forged Host header could point elsewhere, so set it.
 */
export function appLink(req: Request, pathAndQuery: string): string {
  const base = process.env.PUBLIC_URL?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
  return `${base}${pathAndQuery}`;
}

export type EmailKind = 'confirm' | 'reset' | 'change-email' | 'email-changing' | 'trial-ending';

/** One of the app's emails in the person's language: hostedEmail.<kind>Subject and <kind>Body. */
export function writeEmail(kind: EmailKind, lang: string | null | undefined, to: string, vars: Record<string, string>): Email {
  const key = kind.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()); // change-email: changeEmail
  return {
    to,
    subject: tr(lang, `hostedEmail.${key}Subject`, vars),
    text: `${tr(lang, `hostedEmail.${key}Body`, vars)}\n\n— TidyQuest`,
  };
}
