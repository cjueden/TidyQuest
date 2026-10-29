import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../database';
import { AuthRequest, authMiddleware, revokeTokens } from '../middleware/auth';
import { clientIp, sendLogin } from '../routes/auth';
import { checkRateLimit } from '../utils/throttle';
import {
  accountByEmail, accountOf, addAccount, cleanEmail, confirmBy, createEmailToken, isLocked, markConfirmed, useEmailToken,
} from './accounts';
import { runInFamily } from './context';
import { appLink, sendEmail, writeEmail } from './email';
import { createFamily, deleteFamily, familyStatus, openFamily } from './families';
import { newFamilyCode } from './familyCode';
import { mainDb } from './mainDb';
import { addParent, captchaPasses, usernameFrom } from './signup';

// Hosted mode's own pages (/api/hosted): sign-up, parents' emails and passwords, the family code.
const router = Router();

const MIN_PASSWORD = 8;
// Each error has a code, so the page can say it in the family's language
const LINK_EXPIRED = { error: 'This link has expired or was already used. Ask for a new one.', code: 'link-expired' };
const BAD_EMAIL = { error: "That email address doesn't look right", code: 'bad-email' };
const SHORT_PASSWORD = { error: `Passwords need at least ${MIN_PASSWORD} characters`, code: 'short-password' };
const EMAIL_TAKEN = { error: 'That email already has a family. Sign in, or reset your password.', code: 'email-taken' };
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** What the sign-up page needs before it's filled in. Terms and privacy links show once the lawyer's are ready (Phase 3). */
router.get('/config', (_req, res: Response) => {
  res.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
    termsUrl: process.env.TERMS_URL || null,
    privacyUrl: process.env.PRIVACY_URL || null,
  });
});

function sendConfirmation(req: AuthRequest, p: { familyId: string; userId: number; email: string; name: string; language: string }) {
  const token = createEmailToken({ kind: 'confirm', familyId: p.familyId, userId: p.userId, email: p.email, newEmail: null });
  void sendEmail(writeEmail('confirm', p.language, p.email, { name: p.name, link: appLink(req, `/confirm-email?token=${token}`) }));
}

// Sign-up: a new family (on a 30-day trial), its first parent and family code; then the confirmation email
router.post('/signup', async (req: AuthRequest, res: Response) => {
  const familyName = text(req.body.familyName, 60);
  const parentName = text(req.body.parentName, 40);
  const email = cleanEmail(req.body.email);
  const { password, language, timeZone } = req.body;
  if (!familyName || !parentName) return res.status(400).json({ error: 'Family name and your name are required' });
  if (!email) return res.status(400).json(BAD_EMAIL);
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return res.status(400).json(SHORT_PASSWORD);
  }
  if ((process.env.TERMS_URL || process.env.PRIVACY_URL) && req.body.acceptTerms !== true) {
    return res.status(400).json({ error: 'Please agree to the terms and the privacy policy' });
  }
  // Counted once the form is filled in properly, so fixing a typo doesn't use up a try
  if (!checkRateLimit(`signup:${clientIp(req)}`, 5)) {
    return res.status(429).json({ error: 'Too many sign-ups from here. Please try again later.' });
  }
  if (!(await captchaPasses(req.body.captchaToken, clientIp(req)))) {
    return res.status(400).json({ error: "The check that you're not a robot didn't pass. Please try again.", code: 'captcha' });
  }
  if (accountByEmail(email)) {
    return res.status(409).json(EMAIL_TAKEN);
  }

  let familyId: string | null = null;
  try {
    familyId = createFamily(familyName);
    const family = openFamily(familyId)!;
    runInFamily(family, () => {
      const userId = addParent({ username: usernameFrom(parentName), displayName: parentName, password, email, language, timeZone });
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
      sendConfirmation(req, { familyId: family.familyId, userId, email, name: parentName, language: user.language });
      console.log(`[signup] new family ${family.familyId}`);
      sendLogin(res.status(201), user);
    });
  } catch (err) {
    // Nothing half-made stays behind (two sign-ups with one email at once end here too)
    if (familyId) deleteFamily(familyId);
    if (accountByEmail(email)) return res.status(409).json(EMAIL_TAKEN);
    console.error('[signup] failed:', err);
    res.status(500).json({ error: 'Sign-up failed. Please try again.' });
  }
});

// Forgot password (parents): a link that works once, for an hour. The answer is the same whether or not
// the email has an account, so the page can't be used to find out who has signed up.
router.post('/forgot-password', (req: AuthRequest, res: Response) => {
  const email = cleanEmail(req.body.email);
  if (!email) return res.status(400).json(BAD_EMAIL);
  if (!checkRateLimit(`forgot:${clientIp(req)}`)) {
    return res.status(429).json({ error: 'Too many tries. Please try again later.' });
  }
  const account = checkRateLimit(`forgot:${email}`, 3) ? accountByEmail(email) : undefined;
  const family = account && openFamily(account.familyId);
  if (account && family) {
    runInFamily(family, () => {
      const user = db.prepare("SELECT displayName, language FROM users WHERE id = ? AND role = 'admin'").get(account.userId) as { displayName: string; language: string } | undefined;
      if (!user) return;
      const token = createEmailToken({ kind: 'reset', familyId: account.familyId, userId: account.userId, email, newEmail: null });
      void sendEmail(writeEmail('reset', user.language, email, { name: user.displayName, link: appLink(req, `/reset-password?token=${token}`) }));
    });
  }
  res.json({ ok: true });
});

// The reset link's page: a new password, which signs out every other device (NEW-8), and signs in here
router.post('/reset-password', (req: AuthRequest, res: Response) => {
  const { password } = req.body;
  // Checked before the link is used up, so a too-short password doesn't waste it
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return res.status(400).json(SHORT_PASSWORD);
  }
  const link = useEmailToken(req.body.token, ['reset']);
  const family = link && openFamily(link.familyId);
  if (!link || !family) return res.status(400).json(LINK_EXPIRED);
  runInFamily(family, () => {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(link.userId);
    if (!user) return res.status(400).json(LINK_EXPIRED);
    db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), link.userId);
    revokeTokens(link.userId);
    // The link reached them, so the email works
    markConfirmed(link.familyId, link.userId);
    req.familyId = family.familyId;
    sendLogin(res, db.prepare('SELECT * FROM users WHERE id = ?').get(link.userId));
  });
});

// The link in a confirmation or change-of-email message. Works signed in or not.
router.post('/confirm-email', (req: AuthRequest, res: Response) => {
  const link = useEmailToken(req.body.token, ['confirm', 'change-email']);
  if (!link) return res.status(400).json(LINK_EXPIRED);
  const main = mainDb();
  const now = new Date().toISOString();
  if (link.kind === 'confirm') {
    // Only while the account still has the address the link went to
    const done = main.prepare('UPDATE accounts SET emailConfirmedAt = COALESCE(emailConfirmedAt, ?) WHERE familyId = ? AND userId = ? AND email = ?')
      .run(now, link.familyId, link.userId, link.email);
    if (done.changes !== 1) return res.status(400).json(LINK_EXPIRED);
    return res.json({ ok: true, email: link.email });
  }
  const newEmail = link.newEmail!;
  const taken = accountByEmail(newEmail);
  if (taken && !(taken.familyId === link.familyId && taken.userId === link.userId)) {
    return res.status(409).json(EMAIL_TAKEN);
  }
  // Clears the account's old unused links too: they were for the old address
  main.transaction(() => {
    main.prepare("UPDATE email_tokens SET usedAt = ? WHERE familyId = ? AND userId = ? AND usedAt IS NULL AND kind <> 'change-email'")
      .run(now, link.familyId, link.userId);
    if (accountOf(link.familyId, link.userId)) {
      main.prepare('UPDATE accounts SET email = ?, emailConfirmedAt = ? WHERE familyId = ? AND userId = ?').run(newEmail, now, link.familyId, link.userId);
    } else {
      addAccount(newEmail, link.familyId, link.userId);
      markConfirmed(link.familyId, link.userId);
    }
  })();
  res.json({ ok: true, email: newEmail });
});

// Signed in from here on
router.use(authMiddleware);

const isParent = (userId?: number) =>
  (db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined)?.role === 'admin';

/** The family's code and link, this person's sign-in email, and whether the family must still confirm one. */
router.get('/account', (req: AuthRequest, res: Response) => {
  const familyId = req.familyId!;
  const family = mainDb().prepare('SELECT name, code, status, trialEndsAt, plan FROM families WHERE id = ?').get(familyId) as { name: string; code: string; status: string; trialEndsAt: string; plan: string | null };
  const account = accountOf(familyId, req.userId!);
  res.json({
    familyName: family.name,
    familyCode: family.code,
    familyLink: appLink(req, `/${family.code}`),
    trialEndsAt: family.trialEndsAt,
    isParent: isParent(req.userId),
    email: account?.email ?? null,
    emailConfirmed: !!account?.emailConfirmedAt,
    confirmBy: confirmBy(familyId)?.toISOString() ?? null,
    locked: isLocked(familyId),
    // trial or active; suspended and expired see a page about it instead of the app
    status: familyStatus(family),
  });
});

router.post('/resend-confirmation', (req: AuthRequest, res: Response) => {
  const account = accountOf(req.familyId!, req.userId!);
  if (!account || account.emailConfirmedAt) return res.status(400).json({ error: 'There is no email to confirm' });
  if (!checkRateLimit(`resend:${req.familyId}:${req.userId}`, 5)) {
    return res.status(429).json({ error: 'Too many emails. Please try again later.' });
  }
  const user = db.prepare('SELECT displayName, language FROM users WHERE id = ?').get(req.userId) as { displayName: string; language: string };
  sendConfirmation(req, { familyId: req.familyId!, userId: req.userId!, email: account.email, name: user.displayName, language: user.language });
  res.json({ ok: true, email: account.email });
});

// Parents change (or add) the email they sign in with. It changes once they open the link sent to the new address.
router.post('/change-email', (req: AuthRequest, res: Response) => {
  const user = db.prepare('SELECT displayName, language, role, passwordHash FROM users WHERE id = ?').get(req.userId) as
    { displayName: string; language: string; role: string; passwordHash: string };
  if (user.role !== 'admin') return res.status(403).json({ error: 'Only parents sign in with an email' });
  const newEmail = cleanEmail(req.body.email);
  if (!newEmail) return res.status(400).json(BAD_EMAIL);
  if (typeof req.body.password !== 'string' || !bcrypt.compareSync(req.body.password, user.passwordHash)) {
    return res.status(400).json({ error: "Your password isn't right", code: 'wrong-password' });
  }
  if (!checkRateLimit(`change-email:${req.familyId}:${req.userId}`, 5)) {
    return res.status(429).json({ error: 'Too many emails. Please try again later.' });
  }
  const current = accountOf(req.familyId!, req.userId!);
  if (current?.email === newEmail) return res.status(400).json({ error: "That's already your email" });
  if (accountByEmail(newEmail)) return res.status(409).json(EMAIL_TAKEN);
  const token = createEmailToken({ kind: 'change-email', familyId: req.familyId!, userId: req.userId!, email: current?.email ?? newEmail, newEmail });
  void sendEmail(writeEmail('change-email', user.language, newEmail, { name: user.displayName, link: appLink(req, `/confirm-email?token=${token}`) }));
  // The old address hears about it, in case it wasn't them
  if (current) void sendEmail(writeEmail('email-changing', user.language, current.email, { name: user.displayName, email: newEmail }));
  res.json({ ok: true, email: newEmail });
});

// "New code": the old code and link stop working at once
router.post('/family-code', (req: AuthRequest, res: Response) => {
  if (!isParent(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const code = newFamilyCode(req.familyId!);
  res.json({ familyCode: code, familyLink: appLink(req, `/${code}`) });
});

export default router;
