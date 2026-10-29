import crypto from 'crypto';
import db from '../database';
import { mainDb } from './mainDb';
import { TRIAL_DAYS } from './families';

// Parents' sign-in emails (main.db accounts) and the one-time links sent to them (email_tokens).
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface Account {
  email: string;
  familyId: string;
  userId: number;
  emailConfirmedAt: string | null;
}

/** Trimmed and lowercased, or null when it doesn't look like an email address. */
export function cleanEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** The account with this email, in a family that isn't deleted. */
export function accountByEmail(email: string): Account | undefined {
  return mainDb().prepare(
    'SELECT a.email, a.familyId, a.userId, a.emailConfirmedAt FROM accounts a JOIN families f ON f.id = a.familyId WHERE a.email = ? AND f.deletedAt IS NULL'
  ).get(email) as Account | undefined;
}

export function accountOf(familyId: string, userId: number): Account | undefined {
  return mainDb().prepare('SELECT email, familyId, userId, emailConfirmedAt FROM accounts WHERE familyId = ? AND userId = ?')
    .get(familyId, userId) as Account | undefined;
}

export function addAccount(email: string, familyId: string, userId: number, now = new Date()): void {
  mainDb().prepare('INSERT INTO accounts (email, familyId, userId, createdAt) VALUES (?, ?, ?, ?)')
    .run(email, familyId, userId, now.toISOString());
}

/** A removed person can't sign in with their email any more, and the address is free again. */
export function removeAccount(familyId: string, userId: number): void {
  const main = mainDb();
  main.prepare('DELETE FROM email_tokens WHERE familyId = ? AND userId = ?').run(familyId, userId);
  main.prepare('DELETE FROM accounts WHERE familyId = ? AND userId = ?').run(familyId, userId);
}

/**
 * The day a family that hasn't confirmed any parent's email gets locked (30 days after sign-up, the
 * length of the trial), or null once one is confirmed. Decision 3.
 */
export function confirmBy(familyId: string): Date | null {
  const main = mainDb();
  if (main.prepare('SELECT 1 FROM accounts WHERE familyId = ? AND emailConfirmedAt IS NOT NULL').get(familyId)) return null;
  const family = main.prepare('SELECT createdAt FROM families WHERE id = ?').get(familyId) as { createdAt: string } | undefined;
  return family ? new Date(new Date(family.createdAt).getTime() + TRIAL_DAYS * DAY) : null;
}

/** Locked: only confirming the email and exporting work until a parent confirms. */
export function isLocked(familyId: string, now = new Date()): boolean {
  const by = confirmBy(familyId);
  return !!by && now >= by;
}

// One-time links. Only a hash of the token is stored, so a copy of main.db can't be used to sign in.
export type TokenKind = 'confirm' | 'reset' | 'change-email';
const LIFETIME: Record<TokenKind, number> = { confirm: TRIAL_DAYS * DAY, reset: HOUR, 'change-email': DAY };

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export interface EmailToken {
  kind: TokenKind;
  familyId: string;
  userId: number;
  email: string;
  newEmail: string | null;
}

/** A new link of this kind for this person. Their earlier unused ones of the same kind stop working. */
export function createEmailToken(t: EmailToken, now = new Date()): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const main = mainDb();
  main.transaction(() => {
    main.prepare('UPDATE email_tokens SET usedAt = ? WHERE kind = ? AND familyId = ? AND userId = ? AND usedAt IS NULL')
      .run(now.toISOString(), t.kind, t.familyId, t.userId);
    main.prepare('INSERT INTO email_tokens (tokenHash, kind, familyId, userId, email, newEmail, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(hash(token), t.kind, t.familyId, t.userId, t.email, t.newEmail, new Date(now.getTime() + LIFETIME[t.kind]).toISOString(), now.toISOString());
  })();
  return token;
}

/** Uses up a link: its details if it's one of these kinds, unused and not expired, else null. */
export function useEmailToken(token: unknown, kinds: TokenKind[], now = new Date()): EmailToken | null {
  if (typeof token !== 'string' || !token || token.length > 100) return null;
  const main = mainDb();
  const row = main.prepare('SELECT kind, familyId, userId, email, newEmail, expiresAt, usedAt FROM email_tokens WHERE tokenHash = ?')
    .get(hash(token)) as (EmailToken & { expiresAt: string; usedAt: string | null }) | undefined;
  if (!row || row.usedAt || !kinds.includes(row.kind) || new Date(row.expiresAt) <= now) return null;
  // Only one use, even if two arrive at once
  const used = main.prepare('UPDATE email_tokens SET usedAt = ? WHERE tokenHash = ? AND usedAt IS NULL').run(now.toISOString(), hash(token));
  if (used.changes !== 1) return null;
  const { kind, familyId, userId, email, newEmail } = row;
  return { kind, familyId, userId, email, newEmail };
}

export function markConfirmed(familyId: string, userId: number, now = new Date()): void {
  mainDb().prepare('UPDATE accounts SET emailConfirmedAt = COALESCE(emailConfirmedAt, ?) WHERE familyId = ? AND userId = ?')
    .run(now.toISOString(), familyId, userId);
}

/** Before an import replaces the family's people: each sign-in email with its parent's username. */
export function accountUsernames(familyId: string): { email: string; username: string }[] {
  const rows = mainDb().prepare('SELECT email, userId FROM accounts WHERE familyId = ?').all(familyId) as { email: string; userId: number }[];
  return rows.flatMap(({ email, userId }) => {
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    return user ? [{ email, username: user.username }] : [];
  });
}

/** After it: each email follows its parent to their id in the imported people, or goes if they're no longer a parent. */
export function relinkAccounts(familyId: string, before: { email: string; username: string }[], now = new Date()): void {
  const main = mainDb();
  main.transaction(() => {
    for (const { email, username } of before) {
      const user = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND role = 'admin'").get(username) as { id: number } | undefined;
      if (user) main.prepare('UPDATE accounts SET userId = ? WHERE email = ?').run(user.id, email);
      else main.prepare('DELETE FROM accounts WHERE email = ?').run(email);
    }
    // Links sent before the import point at the old ids
    main.prepare('UPDATE email_tokens SET usedAt = ? WHERE familyId = ? AND usedAt IS NULL').run(now.toISOString(), familyId);
  })();
}
