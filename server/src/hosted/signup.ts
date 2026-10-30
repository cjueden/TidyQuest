import bcrypt from 'bcryptjs';
import db from '../database';
import { canonicalZone } from '../utils/clock';
import { LANGUAGES } from '../utils/i18n';
import { addAccount } from './accounts';
import { currentFamily } from './context';

/** A username from the parent's name ("Zoë Smith" → "zoesmith"). Parents may also log in with it and the family code. */
export function usernameFrom(name: string): string {
  const base = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return base || 'parent';
}

/**
 * Adds a parent to the family whose context this runs in: the family's first person becomes its admin.
 * Sign-up makes the first parent this way (and tests their families). An email makes it a sign-in account.
 */
export function addParent(p: { username: string; displayName: string; password: string; email?: string; language?: string; timeZone?: string }): number {
  const familyId = currentFamily()!.familyId;
  const first = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n === 0;
  const language = p.language && LANGUAGES.includes(p.language) ? p.language : 'en';
  const id = Number(db.prepare('INSERT INTO users (username, displayName, passwordHash, role, language) VALUES (?, ?, ?, ?, ?)')
    .run(p.username, p.displayName, bcrypt.hashSync(p.password, 10), first ? 'admin' : 'member', language).lastInsertRowid);
  // The family's time zone comes from the first parent's browser (Settings → General changes it)
  const zone = canonicalZone(p.timeZone);
  if (first && zone) db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('timeZone', ?)").run(zone);
  if (p.email && first) addAccount(p.email, familyId, id);
  return id;
}

/** Checks a CAPTCHA answer; true when it passed. */
export type CaptchaCheck = (token: unknown, ip: string) => Promise<boolean>;

// Cloudflare Turnstile. With no TURNSTILE_SECRET_KEY there's no CAPTCHA (a private server, or tests).
const turnstile: CaptchaCheck = async (token, ip) => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(10_000),
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch (err) {
    console.error('[signup] CAPTCHA check failed:', err);
    return false;
  }
};

let captcha: CaptchaCheck = turnstile;
/** Tests: answer CAPTCHA checks themselves (call with no argument to restore). */
export function setCaptchaCheck(check?: CaptchaCheck) { captcha = check ?? turnstile; }
export const captchaPasses: CaptchaCheck = (token, ip) => captcha(token, ip);
