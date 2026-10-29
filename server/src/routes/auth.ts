import { Router, Response } from 'express';
import { parseHomeLayout } from '../utils/homeLayout';
import bcrypt from 'bcryptjs';
import db from '../database';
import { AuthRequest, authMiddleware, generateToken, revokeTokens } from '../middleware/auth';
import { canonicalZone } from '../utils/clock';
import { isHosted, runInFamily } from '../hosted/context';
import { openFamily } from '../hosted/families';
import { familyIdByCode, codeKey } from '../hosted/familyCode';
import { accountByEmail, cleanEmail } from '../hosted/accounts';
import { RATE_LIMIT_MAX, addFailure, checkRateLimit, clearFailures, failuresOf } from '../utils/throttle';

// Limits on registering and logging in, per address and per login name (utils/throttle.ts). The address is
// req.ip: the connection's own, or the visitor's when TRUST_PROXY names the reverse proxy in front (utils/proxy.ts).
export const clientIp = (req: AuthRequest) => req.ip || req.socket?.remoteAddress || 'unknown';
const USER_FAIL_MAX = 10; // failed logins per username, from anywhere

const router = Router();

router.post('/register', (req: AuthRequest, res: Response) => {
  // Hosted families start on the sign-up page (NEW-10), and parents add everyone else
  if (isHosted()) return res.status(404).json({ error: 'Registration is off on this server' });
  if (!checkRateLimit(clientIp(req))) {
    return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
  }

  const { username, password, displayName, avatarColor, language, timeZone } = req.body;

  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'username, password, and displayName are required' });
  }

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };

  // Block registration if disabled by admin — unless this is the very first user
  if (userCount.count > 0) {
    const regEnabled = (db.prepare("SELECT value FROM app_settings WHERE key = 'registrationEnabled'").get() as { value: string } | undefined)?.value;
    if (regEnabled === '0') {
      return res.status(403).json({ error: 'Registration is currently disabled by the administrator.' });
    }
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const role = userCount.count === 0 ? 'admin' : 'member';

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, displayName, passwordHash, role, avatarColor, language) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(username, displayName, passwordHash, role, avatarColor || '#F97316', language || 'en');
  // A new install takes the first parent's time zone from their browser (Settings → General changes it)
  const zone = canonicalZone(timeZone);
  if (role === 'admin' && zone) db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('timeZone', ?)").run(zone);

  const token = generateToken(result.lastInsertRowid as number);
  const user = db.prepare('SELECT id, username, displayName, role, avatarColor, avatarType, avatarPreset, avatarPhotoUrl, coins, currentStreak, streakShields, goalCoins, goalStartAt, goalEndAt, language FROM users WHERE id = ?')
    .get(result.lastInsertRowid) as any;
  user.points = 0;

  res.status(201).json({ token, user });
});

router.get('/registration-status', (_req: AuthRequest, res: Response) => {
  // Hosted families start on the sign-up page, never here
  if (isHosted()) return res.json({ registrationEnabled: false });
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'registrationEnabled'").get() as { value: string } | undefined;
  const registrationEnabled = row ? row.value !== '0' : true;
  res.json({ registrationEnabled });
});

router.get('/avatars', (_req: AuthRequest, res: Response) => {
  // Hosted mode shows nobody before sign-in: anyone with the family link would see the kids' names and faces
  if (isHosted()) return res.json([]);
  const users = db.prepare(
    'SELECT username, displayName, avatarColor, avatarType, avatarPreset, avatarPhotoUrl FROM users ORDER BY displayName'
  ).all();
  res.json(users);
});

// Compared against when there's nobody to check, so a wrong family or email takes as long as a wrong password
let dummyHash: string | null = null;
const passwordMatches = (user: { passwordHash: string } | undefined, password: string) =>
  bcrypt.compareSync(password, user?.passwordHash ?? (dummyHash ??= bcrypt.hashSync('no one has this password', 10))) && !!user;

router.post('/login', (req: AuthRequest, res: Response) => {
  const { username, password, email, familyCode } = req.body;
  // Hosted mode: parents sign in with their email; anyone can with the family code and their username
  const byEmail = isHosted() && typeof email === 'string' && email.trim() !== '';

  if (!(byEmail || username) || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  // Failed tries count per address and per login name, so changing addresses doesn't help a guesser
  const name = byEmail ? email.trim().toLowerCase()
    : `${isHosted() ? `${codeKey(familyCode)}/` : ''}${String(username).toLowerCase()}`;
  const ipKey = `ip:${clientIp(req)}`;
  const userKey = `user:${name}`;
  const who = JSON.stringify(name.slice(0, 64));
  if (failuresOf(ipKey) >= RATE_LIMIT_MAX || failuresOf(userKey) >= USER_FAIL_MAX) {
    console.warn(`[auth] login blocked for ${who} from ${clientIp(req)}: too many failed tries`);
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  const signIn = (user: any) => {
    if (!passwordMatches(user, password)) {
      addFailure(ipKey);
      addFailure(userKey);
      console.warn(`[auth] failed login for ${who} from ${clientIp(req)}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    clearFailures(userKey);
    sendLogin(res, user);
  };
  if (!isHosted()) return signIn(db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username));

  // Hosted: the email or the family code finds the family, then the person is looked up in its database.
  // A wrong code answers like a wrong password, so codes can't be tried out on their own.
  const account = byEmail ? accountByEmail(cleanEmail(email) ?? '') : undefined;
  const family = openFamily(byEmail ? account?.familyId : familyIdByCode(familyCode));
  if (!family) return signIn(undefined);
  req.familyId = family.familyId;
  runInFamily(family, () => signIn(account
    ? db.prepare("SELECT * FROM users WHERE id = ? AND role = 'admin'").get(account.userId)
    : db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username)));
});

/** The answer to a login (and a sign-up or password reset): a token and the person, with their points. */
export function sendLogin(res: Response, user: any) {
  const token = generateToken(user.id);
  const { passwordHash, ...safeUser } = user;
  
  const pointsRow = db.prepare(
    "SELECT COALESCE(SUM(coinsEarned), 0) as points FROM task_completions WHERE userId = ? AND status = 'approved'"
  ).get(user.id) as any;
  safeUser.points = pointsRow?.points ?? 0;
  res.json({ token, user: safeUser });
}


router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  const user = db.prepare(
    'SELECT id, username, displayName, role, avatarColor, avatarType, avatarPreset, avatarPhotoUrl, coins, currentStreak, streakShields, goalCoins, goalStartAt, goalEndAt, lastActiveDate, isVacationMode, language, createdAt, taskView, kidMode, birthday, theme, holidayColors, focusMode, homeLayout FROM users WHERE id = ?'
  ).get(req.userId) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const pointsRow = db.prepare(
    "SELECT COALESCE(SUM(coinsEarned), 0) as points FROM task_completions WHERE userId = ? AND status = 'approved'"
  ).get(req.userId) as any;
  user.points = pointsRow?.points ?? 0;
  user.homeLayout = parseHomeLayout(user.homeLayout);
  res.json(user);
});

// "Log out everywhere else" (NEW-8): every other device's login stops working; this one gets a fresh token
router.post('/logout-others', authMiddleware, (req: AuthRequest, res: Response) => {
  revokeTokens(req.userId!);
  res.json({ token: generateToken(req.userId!) });
});

export default router;
