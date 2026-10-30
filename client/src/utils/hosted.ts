import { useEffect, useState } from 'react';

// Hosted mode (tidyquest.org): the server says so in /api/version. Self-hosted installs never show the
// sign-up page, the family code or the email cards.
let hostedPromise: Promise<boolean> | null = null;

export function fetchHosted(): Promise<boolean> {
  hostedPromise ??= fetch('/api/version')
    .then((r) => r.json())
    .then((v: { hosted?: boolean }) => v.hosted === true)
    .catch(() => false);
  return hostedPromise;
}

/** Whether the server is hosted; null until it answers. */
export function useHosted(): boolean | null {
  const [hosted, setHosted] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void fetchHosted().then((h) => { if (live) setHosted(h); });
    return () => { live = false; };
  }, []);
  return hosted;
}

// The family this device logs in to, remembered from the family link (app.tidyquest.org/<code>) or the
// last kid login. Not a secret: kids still need their password.
const FAMILY_KEY = 'tidyquest_family_code';
const FAMILY_LINK = /^\/([a-z]+-[a-z]+-\d{2})\/?$/i;

export function rememberedFamily(): string {
  try { return localStorage.getItem(FAMILY_KEY) ?? ''; } catch { return ''; }
}

export function rememberFamily(code: string): void {
  try {
    if (code) localStorage.setItem(FAMILY_KEY, code);
    else localStorage.removeItem(FAMILY_KEY);
  } catch { /* private window: they type the code each time */ }
}

/** Opened through a family link: remember the family and go on to the login. True if it was one. */
export function takeFamilyLink(): boolean {
  const match = FAMILY_LINK.exec(window.location.pathname);
  if (!match) return false;
  rememberFamily(match[1].toLowerCase());
  window.history.replaceState(null, '', '/login');
  return true;
}

/** The language of pages shown before sign-in: the one picked on the login page, else the browser's. */
export function authLanguage(): string {
  const languages = ['en', 'fr', 'de', 'es', 'it', 'nl'];
  let saved: string | null = null;
  try { saved = localStorage.getItem('tidyquest_auth_lang'); } catch { /* none saved */ }
  if (saved && languages.includes(saved)) return saved;
  const browser = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en';
  return languages.includes(browser) ? browser : 'en';
}

export interface HostedAccount {
  familyName: string;
  familyCode: string;
  familyLink: string;
  trialEndsAt: string;
  isParent: boolean;
  /** This person's sign-in email (parents), or null */
  email: string | null;
  emailConfirmed: boolean;
  /** When the family gets locked if no parent confirms an email; null once one has */
  confirmBy: string | null;
  locked: boolean;
}

/** The server's error code (link-expired, email-taken…) as a message in the page's language. */
export function hostedError(err: unknown, t: (key: string) => string, fallback: string): string {
  const code = (err as { body?: { code?: string } })?.body?.code;
  const keys: Record<string, string> = {
    'link-expired': 'hosted.linkExpired',
    'email-taken': 'hosted.errEmailTaken',
    'bad-email': 'hosted.errBadEmail',
    'wrong-password': 'hosted.errWrongPassword',
    'short-password': 'hosted.errShortPassword',
    captcha: 'hosted.captchaNeeded',
  };
  return code && keys[code] ? t(keys[code]) : fallback;
}
