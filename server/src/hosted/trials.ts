import db from '../database';
import { LANGUAGES, tr } from '../utils/i18n';
import { runInFamily } from './context';
import { sendEmail, writeEmail } from './email';
import { deleteFamily, openFamily } from './families';
import { mainDb } from './mainDb';

// Expired trials (HOSTED.md decision 9): a family whose trial ended and who never paid is deleted 60 days
// later, at least a week after its parents were warned by email. It goes to deleted/ like any other.
// Only with billing on: with no payment key, families never expire (decision 11).
const DAY = 24 * 60 * 60 * 1000;
export const DELETE_AFTER_TRIAL_DAYS = 60;
export const WARN_DAYS = 7;

/** Billing is on when a payment key is set. NEW-19 picks the company (and may rename the variable). */
export const billingOn = () => !!process.env.PAYMENT_KEY;

interface EndingTrial { id: string; name: string; trialEndsAt: string; trialWarnedAt: string | null }

/** The day it's deleted: 60 days after the trial, and never sooner than a week after the warning. */
const deleteOn = (family: EndingTrial, warnedAt: Date) =>
  new Date(Math.max(Date.parse(family.trialEndsAt) + DELETE_AFTER_TRIAL_DAYS * DAY, warnedAt.getTime() + WARN_DAYS * DAY));

/** The daily job: warns the parents of trials that ended 53+ days ago, then deletes them a week later. Returns how many it deleted. */
export async function endExpiredTrials(now = new Date()): Promise<number> {
  if (!billingOn()) return 0;
  const base = process.env.PUBLIC_URL?.replace(/\/+$/, '');
  if (!base) {
    console.warn('[hosted] Expired trials are kept until PUBLIC_URL is set: the warning email needs a link.');
    return 0;
  }
  // A family that ever paid has a plan; lapsed plans get their own rule with billing (NEW-19)
  const warnFrom = new Date(now.getTime() - (DELETE_AFTER_TRIAL_DAYS - WARN_DAYS) * DAY).toISOString();
  const families = mainDb().prepare(
    "SELECT id, name, trialEndsAt, trialWarnedAt FROM families WHERE status IN ('trial', 'expired') AND plan IS NULL AND deletedAt IS NULL AND trialEndsAt <= ?",
  ).all(warnFrom) as EndingTrial[];
  let deleted = 0;
  for (const family of families) {
    try {
      if (!family.trialWarnedAt) await warnParents(family, base, now);
      else if (deleteOn(family, new Date(family.trialWarnedAt)) <= now && deleteFamily(family.id, now)) deleted++;
    } catch (err) {
      console.error(`[hosted] Ending family ${family.id}'s trial failed:`, err);
    }
  }
  return deleted;
}

/** Emails each parent with a confirmed address, in their language, and notes when the family was warned. */
async function warnParents(family: EndingTrial, base: string, now: Date): Promise<void> {
  const context = openFamily(family.id, now.getTime(), { activity: false });
  if (!context) throw new Error('its database is missing');
  const parents = mainDb().prepare('SELECT email, userId FROM accounts WHERE familyId = ? AND emailConfirmedAt IS NOT NULL').all(family.id) as { email: string; userId: number }[];
  const deleting = deleteOn(family, now);
  const emails = runInFamily(context, () => parents.flatMap((parent) => {
    const user = db.prepare('SELECT displayName, language FROM users WHERE id = ?').get(parent.userId) as { displayName: string; language: string } | undefined;
    if (!user) return [];
    const lang = LANGUAGES.includes(user.language) ? user.language : 'en';
    const day = (d: Date) => new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(d);
    return [writeEmail('trial-ending', lang, parent.email, {
      name: user.displayName,
      family: family.name,
      ended: day(new Date(family.trialEndsAt)),
      date: day(deleting),
      link: `${base}/settings`,
      export: tr(lang, 'settings.exportData'),
      settings: tr(lang, 'nav.settings'),
    })];
  }));
  if (!emails.length) console.warn(`[hosted] Family ${family.id}'s trial is ending, but no parent has a confirmed email to warn.`);
  mainDb().prepare('UPDATE families SET trialWarnedAt = ? WHERE id = ?').run(now.toISOString(), family.id);
  for (const email of emails) await sendEmail(email);
}
