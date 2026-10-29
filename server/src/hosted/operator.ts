import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import db from '../database';
import { signOperatorToken, verifyOperatorToken } from '../middleware/auth';
import { clientIp } from '../routes/auth';
import { RATE_LIMIT_MAX, addFailure, checkRateLimit, clearFailures, failuresOf } from '../utils/throttle';
import { accountByEmail, cleanEmail } from './accounts';
import { runInFamily } from './context';
import { codeKey } from './familyCode';
import { KEEP_DELETED_DAYS, deleteFamily, familyDir, familyStatus, openFamily, type FamilyStatus } from './families';
import { filesBytes } from './files';
import { limits } from './limits';
import { mainDb } from './mainDb';
import { sendConfirmation } from './routes';

// The operator page (/operator, NEW-13): the people running the server see each family's name, dates,
// size, status and plan, and can suspend, resume or delete a family, or resend a confirmation email. It
// never shows what's inside a family and can't sign in as one (decision 6). English only: families never
// see it.
const router = Router();

const MIN_PASSWORD = 12;
const FAIL_MAX = 10; // failed logins per operator email, from anywhere
const PAGE = 50;
const DAY = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;
const STATUSES: FamilyStatus[] = ['trial', 'active', 'suspended', 'expired', 'deleted'];
const NOT_FOUND = { error: 'No such family' };
const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

interface OperatorRequest extends Request {
  operatorId?: number;
  operatorEmail?: string;
}
interface OperatorRow { id: number; email: string; passwordHash: string; tokenVersion: number }
interface FamilyRow {
  id: string; name: string; code: string | null; codeKey: string | null; status: string; plan: string | null;
  trialEndsAt: string | null; createdAt: string; lastActiveAt: string | null; deletedAt: string | null;
}

const operatorByEmail = (email: string) =>
  mainDb().prepare('SELECT id, email, passwordHash, tokenVersion FROM operators WHERE email = ?').get(email) as OperatorRow | undefined;
const hashPassword = (password: string) => bcrypt.hashSync(password, 10);

/**
 * OPERATOR_EMAIL and OPERATOR_PASSWORD (in the compose file) make that operator account at startup, or
 * give it this password if it has another one, which also signs it out everywhere: the way back in after
 * a forgotten password. Take the password out of the file after signing in.
 */
export function operatorFromEnv(now = new Date()): void {
  const password = process.env.OPERATOR_PASSWORD ?? '';
  if (!process.env.OPERATOR_EMAIL && !password) return;
  const email = cleanEmail(process.env.OPERATOR_EMAIL);
  if (!email || password.length < MIN_PASSWORD) {
    console.error(`[operator] No operator account was made: OPERATOR_EMAIL needs an email address and OPERATOR_PASSWORD at least ${MIN_PASSWORD} characters.`);
    return;
  }
  const row = operatorByEmail(email);
  if (!row) {
    mainDb().prepare('INSERT INTO operators (email, passwordHash, createdAt) VALUES (?, ?, ?)').run(email, hashPassword(password), now.toISOString());
    console.log(`[operator] Made the operator account ${email}. Sign in at /operator, then take OPERATOR_PASSWORD out of the settings.`);
  } else if (!bcrypt.compareSync(password, row.passwordHash)) {
    mainDb().prepare('UPDATE operators SET passwordHash = ?, tokenVersion = tokenVersion + 1 WHERE id = ?').run(hashPassword(password), row.id);
    console.log(`[operator] OPERATOR_PASSWORD gave ${email} a new password. Take it out of the settings after signing in.`);
  } else {
    console.warn('[operator] OPERATOR_PASSWORD is still set: take it out of the settings.');
  }
}

let dummyHash: string | undefined;

// Failed tries count per address (shared with family logins) and per operator email
router.post('/login', (req: OperatorRequest, res: Response) => {
  const email = cleanEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const ipKey = `ip:${clientIp(req)}`;
  const userKey = `operator:${email}`;
  if (failuresOf(ipKey) >= RATE_LIMIT_MAX || failuresOf(userKey) >= FAIL_MAX) {
    console.warn(`[operator] login blocked for ${JSON.stringify(email)} from ${clientIp(req)}: too many failed tries`);
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }
  const row = operatorByEmail(email);
  // An unknown email takes as long to check as a wrong password
  if (!bcrypt.compareSync(password, row?.passwordHash ?? (dummyHash ??= hashPassword('no one has this password'))) || !row) {
    addFailure(ipKey);
    addFailure(userKey);
    console.warn(`[operator] failed login for ${JSON.stringify(email)} from ${clientIp(req)}`);
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  clearFailures(userKey);
  console.log(`[operator] ${row.email} signed in from ${clientIp(req)}`);
  res.json({ token: signOperatorToken({ op: row.id, v: row.tokenVersion }), email: row.email });
});

/** Only a current operator token gets past here: a family's token, an old one or none gets 401. */
function operatorAuth(req: OperatorRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const payload = header?.startsWith('Bearer ') ? verifyOperatorToken(header.slice(7)) : null;
  const row = payload
    ? mainDb().prepare('SELECT id, email, tokenVersion FROM operators WHERE id = ?').get(payload.op) as Omit<OperatorRow, 'passwordHash'> | undefined
    : undefined;
  if (!payload || !row || row.tokenVersion !== payload.v) return res.status(401).json({ error: 'Signed out' });
  req.operatorId = row.id;
  req.operatorEmail = row.email;
  next();
}
router.use(operatorAuth);

const signOutEverywhere = (id: number) => mainDb().prepare('UPDATE operators SET tokenVersion = tokenVersion + 1 WHERE id = ?').run(id);

router.get('/me', (req: OperatorRequest, res: Response) => {
  res.json({ email: req.operatorEmail });
});

/** Signs this operator out on every device. */
router.post('/logout', (req: OperatorRequest, res: Response) => {
  signOutEverywhere(req.operatorId!);
  res.json({ ok: true });
});

/** A new password signs out every other device and returns a token for this one. */
router.post('/password', (req: OperatorRequest, res: Response) => {
  const row = operatorByEmail(req.operatorEmail!)!;
  const current = typeof req.body.current === 'string' ? req.body.current : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!bcrypt.compareSync(current, row.passwordHash)) return res.status(400).json({ error: 'Your current password is wrong' });
  if (password.length < MIN_PASSWORD) return res.status(400).json({ error: `Passwords need at least ${MIN_PASSWORD} characters` });
  mainDb().prepare('UPDATE operators SET passwordHash = ?, tokenVersion = tokenVersion + 1 WHERE id = ?').run(hashPassword(password), row.id);
  console.log(`[operator] ${row.email} changed their password`);
  res.json({ token: signOperatorToken({ op: row.id, v: row.tokenVersion + 1 }) });
});

const fileSize = (file: string) => fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0;

/** People, photos and database size come from the family's own folder, so only the page on screen is counted. */
function familySize(id: string, now: number) {
  let people: number | null = null;
  try {
    const family = openFamily(id, now, { activity: false });
    if (family) people = runInFamily(family, () => (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n);
  } catch (err) {
    console.error(`[operator] Opening family ${id}'s database failed:`, err);
  }
  const file = path.join(familyDir(id), 'tidyquest.db');
  return { people, filesBytes: filesBytes(id), dataBytes: fileSize(file) + fileSize(`${file}-wal`) };
}

/**
 * The families, 50 at a time (or `limit`), most recently active first. `status` picks one kind (deleted
 * ones only show then); `q` finds a family by name, family code, id or a parent's email. Totals count every
 * family.
 */
router.get('/families', (req: OperatorRequest, res: Response) => {
  const now = Date.now();
  const main = mainDb();
  const rows = (main.prepare('SELECT id, name, code, codeKey, status, plan, trialEndsAt, createdAt, lastActiveAt, deletedAt FROM families').all() as FamilyRow[])
    .map((row) => ({ ...row, status: familyStatus(row, now) }));
  const parents = new Map<string, { email: string; confirmed: boolean }[]>();
  for (const a of main.prepare('SELECT familyId, email, emailConfirmedAt FROM accounts ORDER BY createdAt').all() as { familyId: string; email: string; emailConfirmedAt: string | null }[]) {
    parents.set(a.familyId, [...(parents.get(a.familyId) ?? []), { email: a.email, confirmed: !!a.emailConfirmedAt }]);
  }

  const totals: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of rows) totals[row.status]++;
  const weekAgo = new Date(now - 7 * DAY).toISOString();
  totals.newThisWeek = rows.filter((row) => row.createdAt >= weekAgo).length;

  const status = STATUSES.find((s) => s === req.query.status);
  const q = text(req.query.q).toLowerCase();
  const key = codeKey(q);
  const matches = (row: FamilyRow) => !q || row.id === q || row.name.toLowerCase().includes(q)
    || (!!key && !!row.codeKey?.includes(key)) || !!parents.get(row.id)?.some((p) => p.email.includes(q));
  const found = rows
    .filter((row) => (status ? row.status === status : row.status !== 'deleted') && matches(row))
    .sort((a, b) => (b.deletedAt ?? b.lastActiveAt ?? b.createdAt).localeCompare(a.deletedAt ?? a.lastActiveAt ?? a.createdAt));
  const offset = Math.max(0, Math.floor(Number(req.query.offset)) || 0);
  // After an action the page asks again for all it has shown, which can be more than one page
  const limit = Math.min(500, Math.max(1, Math.floor(Number(req.query.limit)) || PAGE));

  res.json({
    totals,
    found: found.length,
    offset,
    filesLimitBytes: limits().filesMb * MB,
    keepDeletedDays: KEEP_DELETED_DAYS,
    families: found.slice(offset, offset + limit).map(({ codeKey: _key, ...row }) => ({
      ...row,
      parents: parents.get(row.id) ?? [],
      ...(row.status === 'deleted' ? { people: null, filesBytes: null, dataBytes: null } : familySize(row.id, now)),
    })),
  });
});

const liveFamily = (id: unknown) =>
  mainDb().prepare('SELECT id, name, status, plan FROM families WHERE id = ? AND deletedAt IS NULL').get(String(id)) as Pick<FamilyRow, 'id' | 'name' | 'status' | 'plan'> | undefined;
const logAction = (req: OperatorRequest, what: string, family: { id: string; name: string }) =>
  console.log(`[operator] ${req.operatorEmail} ${what} family ${family.id} (${JSON.stringify(family.name)})`);

/** The family sees the paused page (it can still sign in and export), and its background jobs stop. */
router.post('/families/:id/suspend', (req: OperatorRequest, res: Response) => {
  const family = liveFamily(req.params.id);
  if (!family) return res.status(404).json(NOT_FOUND);
  if (family.status === 'suspended') return res.status(400).json({ error: 'This family is already paused' });
  mainDb().prepare("UPDATE families SET status = 'suspended' WHERE id = ?").run(family.id);
  logAction(req, 'suspended', family);
  res.json({ ok: true });
});

/** Back to its trial, or to active when it has a plan. A trial that ended meanwhile counts as expired again. */
router.post('/families/:id/resume', (req: OperatorRequest, res: Response) => {
  const family = liveFamily(req.params.id);
  if (!family) return res.status(404).json(NOT_FOUND);
  if (family.status !== 'suspended') return res.status(400).json({ error: "This family isn't paused" });
  mainDb().prepare('UPDATE families SET status = ? WHERE id = ?').run(family.plan ? 'active' : 'trial', family.id);
  logAction(req, 'resumed', family);
  res.json({ ok: true });
});

/** To deleted/ (removed for good after 30 days). The family's name, typed again, confirms it. */
router.post('/families/:id/delete', (req: OperatorRequest, res: Response) => {
  const family = liveFamily(req.params.id);
  if (!family) return res.status(404).json(NOT_FOUND);
  if (text(req.body.name).toLowerCase() !== family.name.trim().toLowerCase()) {
    return res.status(400).json({ error: "Type the family's name to delete it" });
  }
  deleteFamily(family.id);
  logAction(req, 'deleted', family);
  res.json({ ok: true });
});

/** The same email as the app's own Resend button, to one of the family's parents who hasn't confirmed. */
router.post('/families/:id/resend-confirmation', (req: OperatorRequest, res: Response) => {
  const family = liveFamily(req.params.id);
  if (!family) return res.status(404).json(NOT_FOUND);
  const account = accountByEmail(cleanEmail(req.body.email) ?? '');
  if (!account || account.familyId !== family.id) return res.status(404).json({ error: "That email isn't one of this family's parents" });
  if (account.emailConfirmedAt) return res.status(400).json({ error: 'That email is already confirmed' });
  if (!checkRateLimit(`resend:${family.id}:${account.userId}`, 5)) {
    return res.status(429).json({ error: 'Too many emails. Please try again later.' });
  }
  const open = openFamily(family.id, Date.now(), { activity: false });
  const user = open && runInFamily(open, () => db.prepare('SELECT displayName, language FROM users WHERE id = ?').get(account.userId) as { displayName: string; language: string } | undefined);
  if (!user) return res.status(404).json({ error: "That email isn't one of this family's parents" });
  sendConfirmation(req, { familyId: family.id, userId: account.userId, email: account.email, name: user.displayName, language: user.language });
  logAction(req, `resent the confirmation email to ${account.email} in`, family);
  res.json({ ok: true, email: account.email });
});

export default router;
