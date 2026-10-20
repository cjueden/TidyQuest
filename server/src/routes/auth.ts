import { Router, Response } from 'express';
import { parseHomeLayout } from '../utils/homeLayout';
import bcrypt from 'bcryptjs';
import db from '../database';
import { AuthRequest, authMiddleware, generateToken } from '../middleware/auth';

// In-memory limits for auth endpoints (they reset on restart). The address is req.ip: the connection's own,
// or the visitor's when TRUST_PROXY names the reverse proxy in front (utils/proxy.ts).
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const loginFailures = new Map<string, { count: number; resetAt: number }>();
const clientIp = (req: AuthRequest) => req.ip || req.socket?.remoteAddress || 'unknown';
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 20; // registrations, and failed logins, per address
const USER_FAIL_MAX = 10; // failed logins per username, from anywhere

const failuresOf = (key: string) => {
  const entry = loginFailures.get(key);
  return entry && entry.resetAt >= Date.now() ? entry.count : 0;
};
function addFailure(key: string) {
  const now = Date.now();
  const entry = loginFailures.get(key);
  if (!entry || entry.resetAt < now) loginFailures.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  else entry.count++;
}
/** Tests start each app with clean limits */
export function resetLoginLimits() {
  loginAttempts.clear();
  loginFailures.clear();
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Periodically purge expired entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const map of [loginAttempts, loginFailures]) {
    for (const [key, entry] of map.entries()) {
      if (entry.resetAt < now) map.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

const router = Router();

router.post('/register', (req: AuthRequest, res: Response) => {
  if (!checkRateLimit(clientIp(req))) {
    return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
  }

  const { username, password, displayName, avatarColor, language } = req.body;

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

  const token = generateToken(result.lastInsertRowid as number);
  const user = db.prepare('SELECT id, username, displayName, role, avatarColor, avatarType, avatarPreset, avatarPhotoUrl, coins, currentStreak, streakShields, goalCoins, goalStartAt, goalEndAt, language FROM users WHERE id = ?')
    .get(result.lastInsertRowid) as any;
  user.points = 0;

  res.status(201).json({ token, user });
});

router.get('/registration-status', (_req: AuthRequest, res: Response) => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'registrationEnabled'").get() as { value: string } | undefined;
  const registrationEnabled = row ? row.value !== '0' : true;
  res.json({ registrationEnabled });
});

router.get('/avatars', (_req: AuthRequest, res: Response) => {
  const users = db.prepare(
    'SELECT username, displayName, avatarColor, avatarType, avatarPreset, avatarPhotoUrl FROM users ORDER BY displayName'
  ).all();
  res.json(users);
});

router.post('/login', (req: AuthRequest, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  // Failed tries count per address and per username, so changing addresses doesn't help a guesser
  const ipKey = `ip:${clientIp(req)}`;
  const userKey = `user:${String(username).toLowerCase()}`;
  const who = JSON.stringify(String(username).slice(0, 64));
  if (failuresOf(ipKey) >= RATE_LIMIT_MAX || failuresOf(userKey) >= USER_FAIL_MAX) {
    console.warn(`[auth] login blocked for ${who} from ${clientIp(req)}: too many failed tries`);
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as any;
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    addFailure(ipKey);
    addFailure(userKey);
    console.warn(`[auth] failed login for ${who} from ${clientIp(req)}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  loginFailures.delete(userKey);

  const token = generateToken(user.id);
  const { passwordHash, ...safeUser } = user;
  
  const pointsRow = db.prepare(
    "SELECT COALESCE(SUM(coinsEarned), 0) as points FROM task_completions WHERE userId = ? AND status = 'approved'"
  ).get(user.id) as any;
  safeUser.points = pointsRow?.points ?? 0;
  res.json({ token, user: safeUser });

});


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

export default router;
