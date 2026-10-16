import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { DEFAULT_COINS_BY_EFFORT, normalizeCoinsByEffortConfig } from '../utils/health';
import { notifyCoinsAdjusted } from '../utils/notifyMessages';
import { NOTIFICATION_KINDS, NotificationTypeSettings, sendTelegramMessageDetailed, sendNtfyMessageDetailed } from '../utils/notifications';
import { ensureAdmin, getCoinsByEffortConfig, getGlobalVacation, isHidePrivateRoomsEnabled, isStrictModeEnabled } from '../utils/adminHelpers';
import { syncPrimaryGoal } from '../utils/goals';
import { UNLOCKABLE_THEMES, canUse } from '../utils/unlocks';
import { currentLocalWeek } from '../utils/periods';

const router = Router();
router.use(authMiddleware);

// The 8 free themes, then the ones unlocked by levels (utils/unlocks.ts)
export const THEMES = ['orange', 'blue', 'rose', 'mint', 'grape', 'sunny', 'night', 'ocean', ...UNLOCKABLE_THEMES];

const USER_SELECT = 'id, username, displayName, role, avatarColor, avatarType, avatarPreset, avatarPhotoUrl, coins, currentStreak, goalCoins, goalStartAt, goalEndAt, isVacationMode, vacationStartDate, vacationEndDate, language, createdAt, isParticipant, taskView, kidMode, birthday, theme, holidayColors';

function normalizeNotificationTime(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = String(value).trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : null;
}

function normalizeNotificationTypes(value: unknown): NotificationTypeSettings | null {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const toBool = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;
  return Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, toBool(raw[k], true)])) as unknown as NotificationTypeSettings;
}

function readNotificationTypesSetting(): NotificationTypeSettings {
  const rawTypes = (db.prepare("SELECT value FROM app_settings WHERE key = 'notificationTypes'").get() as any)?.value
    || (db.prepare("SELECT value FROM app_settings WHERE key = 'telegramNotificationTypes'").get() as any)?.value || '';
  if (!rawTypes) return (Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])) as unknown as NotificationTypeSettings);
  try {
    return normalizeNotificationTypes(JSON.parse(rawTypes)) || (Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])) as unknown as NotificationTypeSettings);
  } catch {
    return (Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])) as unknown as NotificationTypeSettings);
  }
}

// Setup multer for avatar uploads
const avatarsDir = path.join(__dirname, '..', '..', '..', 'data', 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarsDir),
  filename: (req, _file, cb) => {
    const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
    const rawExt = path.extname(_file.originalname).toLowerCase();
    const ext = ALLOWED_EXTS.includes(rawExt) ? rawExt : '.jpg';
    const targetId = parseInt((req as any).params?.id as string, 10);
    const safeId = Number.isFinite(targetId) ? targetId : (req as AuthRequest).userId;
    cb(null, `user-${safeId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// List all users (family)
router.get('/', (req: AuthRequest, res: Response) => {
  const users = db.prepare(`SELECT ${USER_SELECT} FROM users`).all();
  res.json(users);
});

router.get('/coins-config', (_req: AuthRequest, res: Response) => {
  res.json({ coinsByEffort: getCoinsByEffortConfig() });
});

router.put('/coins-config', (req: AuthRequest, res: Response) => {
  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { coinsByEffort, useDefault } = req.body as { coinsByEffort?: Record<string, number>; useDefault?: boolean };
  const next = useDefault ? DEFAULT_COINS_BY_EFFORT : normalizeCoinsByEffortConfig(coinsByEffort || {});
  db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'coinsByEffort'")
    .run(JSON.stringify(next));
  res.json({ coinsByEffort: next });
});

// Create member (admin only)
router.post('/', (req: AuthRequest, res: Response) => {
  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { username, password, displayName, avatarColor, language, role } = req.body as any;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'username, password, and displayName are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const safeRole = role === 'admin' ? 'admin' : role === 'child' ? 'child' : 'member';
  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, displayName, passwordHash, role, avatarColor, language) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    username,
    displayName,
    passwordHash,
    safeRole,
    avatarColor || '#F97316',
    language || 'en',
  );

  const created = db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(created);
});

// Update user profile (display name, avatar, language)
router.put('/:id/profile', (req: AuthRequest, res: Response) => {
  const userId = parseInt(req.params.id as string);
  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId) as any;
  if (!target) return res.status(404).json({ error: 'User not found' });

  const isSelf = userId === req.userId;
  const canAdminEditOther = requester?.role === 'admin' && userId !== req.userId;
  if (!isSelf && !canAdminEditOther) {
    return res.status(403).json({ error: 'Cannot modify another user' });
  }

  const { displayName, avatarType, avatarColor, avatarPreset, language, birthday, theme, holidayColors } = req.body;

  const updates: string[] = [];
  const values: any[] = [];

  if (displayName !== undefined) { updates.push('displayName = ?'); values.push(displayName); }
  if (avatarType !== undefined) { updates.push('avatarType = ?'); values.push(avatarType); }
  if (avatarColor !== undefined) { updates.push('avatarColor = ?'); values.push(avatarColor); }
  if (avatarPreset !== undefined) { updates.push('avatarPreset = ?'); values.push(avatarPreset); }
  if (language !== undefined) { updates.push('language = ?'); values.push(language); }
  // Color theme (follows the person to every device; empty clears it)
  if (theme !== undefined) {
    if (theme !== null && theme !== '' && !THEMES.includes(theme)) return res.status(400).json({ error: 'invalid_theme' });
    if (theme && !canUse(userId, 'theme', theme)) return res.status(400).json({ error: 'locked' });
    updates.push('theme = ?'); values.push(theme || null);
  }
  // Holiday colors over the theme during seasonal styling (on by default)
  if (holidayColors !== undefined) { updates.push('holidayColors = ?'); values.push(holidayColors ? 1 : 0); }
  // Birthday as 'MM-DD' (empty clears it)
  if (birthday !== undefined) {
    const b = typeof birthday === 'string' ? birthday.trim() : '';
    if (b && !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(b)) return res.status(400).json({ error: 'invalid_birthday' });
    updates.push('birthday = ?'); values.push(b || null);
  }

  if (updates.length > 0) {
    values.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(userId);
  res.json(updated);
});

// Upload avatar photo
router.post('/:id/avatar-upload', upload.single('avatar'), (req: AuthRequest, res: Response) => {
  const userId = parseInt(req.params.id as string);
  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId) as any;
  if (!target) return res.status(404).json({ error: 'User not found' });
  const isSelf = userId === req.userId;
  const canAdminEditOther = requester?.role === 'admin' && userId !== req.userId;
  if (!isSelf && !canAdminEditOther) {
    return res.status(403).json({ error: 'Cannot modify another user' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Delete previous avatar file if it exists
  const prev = db.prepare('SELECT avatarPhotoUrl FROM users WHERE id = ?').get(userId) as any;
  if (prev?.avatarPhotoUrl) {
    const oldFilename = path.basename(prev.avatarPhotoUrl);
    const oldPath = path.join(avatarsDir, oldFilename);
    try { fs.unlinkSync(oldPath); } catch { /* file may already be gone */ }
  }

  const photoUrl = `/api/avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET avatarType = ?, avatarPhotoUrl = ? WHERE id = ?')
    .run('photo', photoUrl, userId);

  const updated = db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(userId);
  res.json(updated);
});

router.put('/:id/password', (req: AuthRequest, res: Response) => {
  const userId = parseInt(req.params.id as string);
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'newPassword must be at least 4 characters' });
  }

  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  const target = db.prepare('SELECT id, role, passwordHash FROM users WHERE id = ?').get(userId) as any;
  if (!target) return res.status(404).json({ error: 'User not found' });

  const isSelf = userId === req.userId;
  const canAdminEditOther = requester?.role === 'admin' && userId !== req.userId;
  if (!isSelf && !canAdminEditOther) {
    return res.status(403).json({ error: 'Cannot modify another user password' });
  }

  if (isSelf) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'currentPassword is required' });
    }
    if (!bcrypt.compareSync(currentPassword, target.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hash, userId);
  res.json({ success: true });
});

// Update user settings
router.put('/:id/settings', (req: AuthRequest, res: Response) => {
  const { language, isVacationMode } = req.body;
  const userId = parseInt(req.params.id as string);

  if (userId !== req.userId) {
    return res.status(403).json({ error: 'Cannot modify another user' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  // Handle vacation mode toggle
  if (isVacationMode !== undefined) {
    if (isVacationMode && !user.isVacationMode) {
      db.prepare('UPDATE users SET isVacationMode = 1, vacationStartDate = ? WHERE id = ?')
        .run(new Date().toISOString(), userId);
    } else if (!isVacationMode && user.isVacationMode) {
      db.prepare('UPDATE users SET isVacationMode = 0, vacationStartDate = NULL WHERE id = ?')
        .run(userId);
    }
  }

  if (language) {
    db.prepare('UPDATE users SET language = ? WHERE id = ?').run(language, userId);
  }

  const updated = db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(userId);
  res.json(updated);
});

router.put('/:id/role', (req: AuthRequest, res: Response) => {
  const targetId = parseInt(req.params.id as string);
  const { role } = req.body as { role?: 'admin' | 'member' | 'child' };

  if (!role || !['admin', 'member', 'child'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin, member or child' });
  }

  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId) as any;
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (target.role === 'admin' && role !== 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
    if (adminCount.count <= 1) {
      return res.status(400).json({ error: 'At least one admin is required' });
    }
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
  const updated = db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(targetId);
  res.json(updated);
});

router.put('/:id/goal', (req: AuthRequest, res: Response) => {
  const targetId = parseInt(req.params.id as string);
  const { goalCoins, goalStartAt, goalEndAt } = req.body as { goalCoins?: number | null; goalStartAt?: string | null; goalEndAt?: string | null };

  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId) as any;
  if (!target) return res.status(404).json({ error: 'User not found' });

  let normalizedGoalCoins: number | null = null;
  if (goalCoins !== null && goalCoins !== undefined) {
    const n = Math.round(Number(goalCoins));
    if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'goalCoins must be > 0' });
    normalizedGoalCoins = n;
  }

  if (goalStartAt && Number.isNaN(new Date(goalStartAt).getTime())) {
    return res.status(400).json({ error: 'goalStartAt must be a valid date' });
  }
  if (goalEndAt && Number.isNaN(new Date(goalEndAt).getTime())) {
    return res.status(400).json({ error: 'goalEndAt must be a valid date' });
  }
  const normalizedGoalStartAt = goalStartAt ? new Date(goalStartAt).toISOString() : null;
  const normalizedGoalEndAt = goalEndAt ? new Date(goalEndAt).toISOString() : null;
  if (normalizedGoalStartAt && normalizedGoalEndAt && new Date(normalizedGoalEndAt).getTime() < new Date(normalizedGoalStartAt).getTime()) {
    return res.status(400).json({ error: 'goalEndAt must be after goalStartAt' });
  }

  if (normalizedGoalCoins === null) {
    db.prepare('UPDATE users SET goalCoins = NULL, goalStartAt = NULL, goalEndAt = NULL WHERE id = ?').run(targetId);
  } else {
    db.prepare('UPDATE users SET goalCoins = ?, goalStartAt = ?, goalEndAt = ? WHERE id = ?')
      .run(normalizedGoalCoins, normalizedGoalStartAt, normalizedGoalEndAt, targetId);
  }
  const updated = db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(targetId);
  res.json(updated);
});

// What a person sees: All/Mine default or lock, and Kid mode. Parents only, so kids can't unlock themselves.
router.put('/:id/view', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const targetId = parseInt(req.params.id as string);
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(targetId)) return res.status(404).json({ error: 'User not found' });
  const { taskView, kidMode } = req.body as { taskView?: string; kidMode?: boolean };
  if (taskView !== undefined) {
    if (!['all', 'mine', 'mineOnly'].includes(taskView)) return res.status(400).json({ error: 'taskView must be all, mine or mineOnly' });
    db.prepare('UPDATE users SET taskView = ? WHERE id = ?').run(taskView, targetId);
  }
  if (kidMode !== undefined) {
    db.prepare('UPDATE users SET kidMode = ? WHERE id = ?').run(kidMode ? 1 : 0, targetId);
  }
  res.json(db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(targetId));
});

router.put('/:id/participant', (req: AuthRequest, res: Response) => {
  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  if (!requester || requester.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const targetId = parseInt(req.params.id as string);
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId) as any;
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { isParticipant } = req.body as { isParticipant?: boolean };
  if (typeof isParticipant !== 'boolean') return res.status(400).json({ error: 'isParticipant must be a boolean' });

  db.prepare('UPDATE users SET isParticipant = ? WHERE id = ?').run(isParticipant ? 1 : 0, targetId);
  const updated = db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(targetId);
  res.json(updated);
});

router.put('/:id/vacation', (req: AuthRequest, res: Response) => {
  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const targetId = parseInt(req.params.id as string);
  const target = db.prepare('SELECT id, isVacationMode FROM users WHERE id = ?').get(targetId) as any;
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { isVacationMode, vacationEndDate } = req.body as { isVacationMode?: boolean; vacationEndDate?: string | null };

  // Handle vacation toggle
  if (isVacationMode !== undefined) {
    if (isVacationMode && !target.isVacationMode) {
      db.prepare('UPDATE users SET isVacationMode = 1, vacationStartDate = ? WHERE id = ?')
        .run(new Date().toISOString(), targetId);
    } else if (!isVacationMode && target.isVacationMode) {
      db.prepare('UPDATE users SET isVacationMode = 0, vacationStartDate = NULL, vacationEndDate = NULL WHERE id = ?')
        .run(targetId);
    }
  }

  // Handle vacation end date (independent update)
  if (vacationEndDate !== undefined) {
    db.prepare('UPDATE users SET vacationEndDate = ? WHERE id = ?')
      .run(vacationEndDate || null, targetId);
  }

  const updated = db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(targetId);
  res.json(updated);
});

router.get('/:id/goals', (req: AuthRequest, res: Response) => {
  const targetId = parseInt(req.params.id as string);
  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  const isSelf = targetId === req.userId;
  if (!isSelf && requester?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId) as any;
  if (!target) return res.status(404).json({ error: 'User not found' });

  const goals = db.prepare(
    'SELECT id, userId, title, goalCoins, startAt, endAt, rewardCoins, repeatWeekly, status, completedAt, createdBy, createdAt FROM user_goals WHERE userId = ? ORDER BY createdAt DESC, id DESC'
  ).all(targetId);
  res.json(goals);
});

router.post('/:id/goals', (req: AuthRequest, res: Response) => {
  const targetId = parseInt(req.params.id as string);
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });

  const target = db.prepare('SELECT id, role, isParticipant FROM users WHERE id = ?').get(targetId) as any;
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin' && !target.isParticipant) return res.status(400).json({ error: 'Cannot assign goals to a non-participating admin' });

  const { title, goalCoins, startAt, endAt, rewardCoins, repeatWeekly } = req.body as { title?: string; goalCoins?: number; startAt?: string | null; endAt?: string | null; rewardCoins?: number; repeatWeekly?: boolean };
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return res.status(400).json({ error: 'title is required' });
  const n = Math.round(Number(goalCoins));
  if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'goalCoins must be > 0' });
  if (startAt && Number.isNaN(new Date(startAt).getTime())) return res.status(400).json({ error: 'startAt must be a valid date' });
  if (endAt && Number.isNaN(new Date(endAt).getTime())) return res.status(400).json({ error: 'endAt must be a valid date' });
  let normStart = startAt ? new Date(startAt).toISOString() : null;
  let normEnd = endAt ? new Date(endAt).toISOString() : null;
  if (normStart && normEnd && new Date(normEnd).getTime() < new Date(normStart).getTime()) {
    return res.status(400).json({ error: 'endAt must be after startAt' });
  }
  // A weekly goal needs a window to roll over from: without dates it covers this week (Mon–Sun)
  if (repeatWeekly && !normEnd) ({ startAt: normStart, endAt: normEnd } = currentLocalWeek());
  const normRewardCoins = (rewardCoins !== undefined && rewardCoins !== null)
    ? Math.max(0, Math.round(Number(rewardCoins)) || 0) : 0;

  const result = db.prepare(
    'INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt, rewardCoins, repeatWeekly, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(targetId, cleanTitle, n, normStart, normEnd, normRewardCoins, repeatWeekly ? 1 : 0, req.userId);

  syncPrimaryGoal(targetId);
  const created = db.prepare(
    'SELECT id, userId, title, goalCoins, startAt, endAt, rewardCoins, repeatWeekly, status, completedAt, createdBy, createdAt FROM user_goals WHERE id = ?'
  ).get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.put('/goals/:goalId', (req: AuthRequest, res: Response) => {
  const goalId = parseInt(req.params.goalId as string);
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const goal = db.prepare('SELECT id, userId FROM user_goals WHERE id = ?').get(goalId) as any;
  if (!goal) return res.status(404).json({ error: 'Goal not found' });

  const { title, goalCoins, startAt, endAt, rewardCoins, repeatWeekly } = req.body as { title?: string; goalCoins?: number; startAt?: string | null; endAt?: string | null; rewardCoins?: number | null; repeatWeekly?: boolean };
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return res.status(400).json({ error: 'title is required' });
  const n = Math.round(Number(goalCoins));
  if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'goalCoins must be > 0' });
  if (startAt && Number.isNaN(new Date(startAt).getTime())) return res.status(400).json({ error: 'startAt must be a valid date' });
  if (endAt && Number.isNaN(new Date(endAt).getTime())) return res.status(400).json({ error: 'endAt must be a valid date' });
  let normStart = startAt ? new Date(startAt).toISOString() : null;
  let normEnd = endAt ? new Date(endAt).toISOString() : null;
  if (normStart && normEnd && new Date(normEnd).getTime() < new Date(normStart).getTime()) {
    return res.status(400).json({ error: 'endAt must be after startAt' });
  }
  if (repeatWeekly && !normEnd) ({ startAt: normStart, endAt: normEnd } = currentLocalWeek());

  db.prepare('UPDATE user_goals SET title = ?, goalCoins = ?, startAt = ?, endAt = ? WHERE id = ?')
    .run(cleanTitle, n, normStart, normEnd, goalId);
  // Optional: bonus coins and "repeat weekly" (left unchanged when not sent)
  if (rewardCoins !== undefined) {
    db.prepare('UPDATE user_goals SET rewardCoins = ? WHERE id = ?').run(Math.max(0, Math.round(Number(rewardCoins)) || 0), goalId);
  }
  if (repeatWeekly !== undefined) {
    db.prepare('UPDATE user_goals SET repeatWeekly = ? WHERE id = ?').run(repeatWeekly ? 1 : 0, goalId);
  }
  syncPrimaryGoal(goal.userId);
  const updated = db.prepare('SELECT id, userId, title, goalCoins, startAt, endAt, rewardCoins, repeatWeekly, status, completedAt, createdBy, createdAt FROM user_goals WHERE id = ?').get(goalId);
  res.json(updated);
});

router.delete('/goals/:goalId', (req: AuthRequest, res: Response) => {
  const goalId = parseInt(req.params.goalId as string);
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const goal = db.prepare('SELECT id, userId FROM user_goals WHERE id = ?').get(goalId) as any;
  if (!goal) return res.status(404).json({ error: 'Goal not found' });

  db.prepare('DELETE FROM user_goals WHERE id = ?').run(goalId);
  syncPrimaryGoal(goal.userId);
  res.json({ success: true });
});

router.get('/notifications-config', (req: AuthRequest, res: Response) => {
  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const notificationsEnabled = (db.prepare("SELECT value FROM app_settings WHERE key = 'notificationsEnabled'").get() as any)?.value === '1';
  const telegramEnabled = (db.prepare("SELECT value FROM app_settings WHERE key = 'telegramEnabled'").get() as any)?.value === '1';
  const botToken = (db.prepare("SELECT value FROM app_settings WHERE key = 'telegramBotToken'").get() as any)?.value || '';
  const chatId = (db.prepare("SELECT value FROM app_settings WHERE key = 'telegramChatId'").get() as any)?.value || '';
  const notificationTime = (db.prepare("SELECT value FROM app_settings WHERE key = 'notificationTime'").get() as any)?.value
    || (db.prepare("SELECT value FROM app_settings WHERE key = 'telegramNotificationTime'").get() as any)?.value || '09:00';
  const notificationTypes = readNotificationTypesSetting();
  const ntfyEnabled = (db.prepare("SELECT value FROM app_settings WHERE key = 'ntfyEnabled'").get() as any)?.value === '1';
  const ntfyServerUrl = (db.prepare("SELECT value FROM app_settings WHERE key = 'ntfyServerUrl'").get() as any)?.value || 'https://ntfy.sh';
  const ntfyTopic = (db.prepare("SELECT value FROM app_settings WHERE key = 'ntfyTopic'").get() as any)?.value || '';
  const ntfyToken = (db.prepare("SELECT value FROM app_settings WHERE key = 'ntfyToken'").get() as any)?.value || '';
  res.json({ notificationsEnabled, telegramEnabled, chatId, hasToken: !!botToken, notificationTime, notificationTypes, ntfyEnabled, ntfyServerUrl, ntfyTopic, hasNtfyToken: !!ntfyToken });
});

router.put('/notifications-config', (req: AuthRequest, res: Response) => {
  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { notificationsEnabled, telegramEnabled, botToken, chatId, notificationTime, notificationTypes, ntfyEnabled, ntfyServerUrl, ntfyTopic, ntfyToken } = req.body as {
    notificationsEnabled?: boolean;
    telegramEnabled?: boolean;
    botToken?: string;
    chatId?: string;
    notificationTime?: string;
    notificationTypes?: NotificationTypeSettings;
    ntfyEnabled?: boolean;
    ntfyServerUrl?: string;
    ntfyTopic?: string;
    ntfyToken?: string;
  };
  const normalizedTime = normalizeNotificationTime(notificationTime);
  if (notificationTime !== undefined && !normalizedTime) {
    return res.status(400).json({ error: 'notificationTime must be in HH:MM format' });
  }
  const normalizedTypes = normalizeNotificationTypes(notificationTypes);
  if (notificationTypes !== undefined && !normalizedTypes) {
    return res.status(400).json({ error: 'notificationTypes is invalid' });
  }
  if (notificationsEnabled !== undefined) {
    db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'notificationsEnabled'")
      .run(notificationsEnabled ? '1' : '0');
  }
  if (telegramEnabled !== undefined) {
    db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'telegramEnabled'")
      .run(telegramEnabled ? '1' : '0');
  }
  if (botToken !== undefined) {
    db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'telegramBotToken'")
      .run(botToken.trim());
  }
  if (chatId !== undefined) {
    db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'telegramChatId'")
      .run(chatId.trim());
  }
  if (normalizedTime) {
    db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'notificationTime'")
      .run(normalizedTime);
  }
  if (normalizedTypes) {
    db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'notificationTypes'")
      .run(JSON.stringify(normalizedTypes));
  }
  if (ntfyEnabled !== undefined) {
    db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'ntfyEnabled'")
      .run(ntfyEnabled ? '1' : '0');
  }
  if (ntfyServerUrl !== undefined) {
    db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'ntfyServerUrl'")
      .run(ntfyServerUrl.trim() || 'https://ntfy.sh');
  }
  if (ntfyTopic !== undefined) {
    db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'ntfyTopic'")
      .run(ntfyTopic.trim());
  }
  if (ntfyToken !== undefined) {
    db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'ntfyToken'")
      .run(ntfyToken.trim());
  }

  // Validate: if master is enabled, at least one provider must be enabled
  const masterNow = (db.prepare("SELECT value FROM app_settings WHERE key = 'notificationsEnabled'").get() as any)?.value === '1';
  const tgEnabledNow = (db.prepare("SELECT value FROM app_settings WHERE key = 'telegramEnabled'").get() as any)?.value === '1';
  const ntfyEnabledNow = (db.prepare("SELECT value FROM app_settings WHERE key = 'ntfyEnabled'").get() as any)?.value === '1';

  // Personal channels (an ntfy topic, Telegram chat or Home Assistant phone per person) count too
  const haNow = !!(db.prepare("SELECT value FROM app_settings WHERE key = 'haUrl'").get() as any)?.value
    && !!(db.prepare("SELECT value FROM app_settings WHERE key = 'haToken'").get() as any)?.value;
  const personalNow = !!db.prepare('SELECT 1 FROM users WHERE ntfyTopic IS NOT NULL OR telegramChatId IS NOT NULL OR haNotifyService IS NOT NULL LIMIT 1').get();
  if (masterNow && !tgEnabledNow && !ntfyEnabledNow && !haNow && !personalNow) {
    return res.status(400).json({ error: 'At least one notification provider (Telegram or ntfy) must be enabled.' });
  }

  // Validate telegram: if enabled, token + chatId required
  const tokenNow = (db.prepare("SELECT value FROM app_settings WHERE key = 'telegramBotToken'").get() as any)?.value || '';
  const chatNow = (db.prepare("SELECT value FROM app_settings WHERE key = 'telegramChatId'").get() as any)?.value || '';
  if (tgEnabledNow && (!tokenNow || !chatNow)) {
    return res.status(400).json({ error: 'To enable Telegram, both bot token and chat ID are required.' });
  }

  // Validate ntfy: if enabled, topic required
  const ntfyTopicNow = (db.prepare("SELECT value FROM app_settings WHERE key = 'ntfyTopic'").get() as any)?.value || '';
  if (ntfyEnabledNow && !ntfyTopicNow) {
    return res.status(400).json({ error: 'To enable ntfy, a topic is required.' });
  }

  const notificationTimeNow = (db.prepare("SELECT value FROM app_settings WHERE key = 'notificationTime'").get() as any)?.value || '09:00';
  const notificationTypesNow = readNotificationTypesSetting();
  const ntfyServerUrlNow = (db.prepare("SELECT value FROM app_settings WHERE key = 'ntfyServerUrl'").get() as any)?.value || 'https://ntfy.sh';
  const ntfyTokenNow = (db.prepare("SELECT value FROM app_settings WHERE key = 'ntfyToken'").get() as any)?.value || '';
  res.json({ notificationsEnabled: masterNow, telegramEnabled: tgEnabledNow, chatId: chatNow, hasToken: !!tokenNow, notificationTime: notificationTimeNow, notificationTypes: notificationTypesNow, ntfyEnabled: ntfyEnabledNow, ntfyServerUrl: ntfyServerUrlNow, ntfyTopic: ntfyTopicNow, hasNtfyToken: !!ntfyTokenNow });
});

router.post('/notifications-test', async (req: AuthRequest, res: Response) => {
  const requester = db.prepare('SELECT id, role, displayName FROM users WHERE id = ?').get(req.userId) as any;
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  const { botToken, chatId, provider, ntfyServerUrl, ntfyTopic, ntfyToken } = req.body as {
    botToken?: string; chatId?: string; provider?: 'telegram' | 'ntfy';
    ntfyServerUrl?: string; ntfyTopic?: string; ntfyToken?: string;
  };
  const testMessage = `TidyQuest test notification from ${requester.displayName} (${new Date().toISOString()})`;

  if (provider === 'ntfy') {
    const result = await sendNtfyMessageDetailed(testMessage, { ignoreEnabled: true, serverUrl: ntfyServerUrl, topic: ntfyTopic, token: ntfyToken });
    if (!result.ok) return res.status(400).json({ error: result.error || 'ntfy notification failed.' });
    return res.json({ success: true });
  }

  // Default: Telegram
  const result = await sendTelegramMessageDetailed(testMessage, { ignoreEnabled: true, botToken, chatId });
  if (!result.ok) return res.status(400).json({ error: result.error || 'Telegram notification failed.' });
  res.json({ success: true });
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const targetId = parseInt(req.params.id as string);

  const requester = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.userId) as any;
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  if (targetId === req.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId) as any;
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (target.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
    if (adminCount.count <= 1) {
      return res.status(400).json({ error: 'At least one admin is required' });
    }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  res.json({ success: true });
});

// Admin: adjust coins for a user (positive = add, negative = remove)
router.post('/:id/adjust-coins', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const targetUser = db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(req.params.id) as any;
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const amount = Math.round(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ error: 'amount must be a non-zero number' });
  }
  const rawReason = req.body.reason;
  if (rawReason != null && typeof rawReason !== 'string') return res.status(400).json({ error: 'reason must be text' });
  const reason = (rawReason || '').trim();
  if (reason.length > 200) return res.status(400).json({ error: 'reason must be 200 characters or fewer' });

  // The balance can't go below 0, so the ledger records the change actually applied
  const applied = db.transaction(() => {
    db.prepare('UPDATE users SET coins = MAX(0, coins + ?) WHERE id = ?').run(amount, targetUser.id);
    const after = (db.prepare('SELECT coins FROM users WHERE id = ?').get(targetUser.id) as { coins: number }).coins;
    const delta = after - targetUser.coins;
    if (delta !== 0) {
      db.prepare('INSERT INTO coin_adjustments (userId, amount, reason, createdBy, createdAt) VALUES (?, ?, ?, ?, ?)')
        .run(targetUser.id, delta, reason || null, req.userId, new Date().toISOString());
    }
    return delta;
  })();
  const updated = db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(req.params.id) as any;
  if (applied !== 0) void notifyCoinsAdjusted(targetUser.id, req.userId!, applied, reason || null);
  res.json({ ...updated, applied });
});

// A person's coin adjustments, newest first (parents, or that person)
router.get('/:id/coin-adjustments', (req: AuthRequest, res: Response) => {
  const targetId = parseInt(req.params.id as string, 10);
  if (targetId !== req.userId && !ensureAdmin(req.userId)) return res.status(403).json({ error: 'Forbidden' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(targetId)) return res.status(404).json({ error: 'User not found' });
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  const adjustments = db.prepare(`
    SELECT a.id, a.userId, a.amount, a.reason, a.createdBy, a.createdAt, c.displayName AS createdByName
    FROM coin_adjustments a
    LEFT JOIN users c ON c.id = a.createdBy
    WHERE a.userId = ?
    ORDER BY a.createdAt DESC, a.id DESC
    LIMIT ? OFFSET ?
  `).all(targetId, limit, offset);
  const total = (db.prepare('SELECT COUNT(*) AS n FROM coin_adjustments WHERE userId = ?').get(targetId) as { n: number }).n;
  res.json({ adjustments, total });
});

router.get('/vacation-config', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const v = getGlobalVacation();
  res.json({ vacationMode: v.isVacation, vacationStartDate: v.startDate, vacationEndDate: v.endDate });
});

router.put('/vacation-config', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });

  const { vacationMode, vacationEndDate } = req.body as { vacationMode?: boolean; vacationEndDate?: string | null };

  if (vacationMode !== undefined) {
    const currentMode = (db.prepare("SELECT value FROM app_settings WHERE key = 'vacationMode'").get() as any)?.value;
    if (vacationMode && currentMode !== '1') {
      db.prepare("UPDATE app_settings SET value = '1', updatedAt = datetime('now') WHERE key = 'vacationMode'").run();
      db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'vacationStartDate'").run(new Date().toISOString());
    } else if (!vacationMode) {
      db.prepare("UPDATE app_settings SET value = '0', updatedAt = datetime('now') WHERE key = 'vacationMode'").run();
      db.prepare("UPDATE app_settings SET value = '', updatedAt = datetime('now') WHERE key = 'vacationStartDate'").run();
      db.prepare("UPDATE app_settings SET value = '', updatedAt = datetime('now') WHERE key = 'vacationEndDate'").run();
    }
  }

  if (vacationEndDate !== undefined) {
    db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'vacationEndDate'")
      .run(vacationEndDate ? new Date(vacationEndDate).toISOString() : '');
  }

  const v = getGlobalVacation();
  res.json({ vacationMode: v.isVacation, vacationStartDate: v.startDate, vacationEndDate: v.endDate });
});

router.get('/kids-config', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  res.json({ hidePrivateRooms: isHidePrivateRoomsEnabled() });
});

router.put('/kids-config', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const { hidePrivateRooms } = req.body as { hidePrivateRooms?: boolean };
  if (typeof hidePrivateRooms !== 'boolean') return res.status(400).json({ error: 'hidePrivateRooms must be a boolean' });
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('hidePrivateRooms', ?)").run(hidePrivateRooms ? '1' : '0');
  res.json({ hidePrivateRooms });
});

router.get('/strict-mode-config', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  res.json({ strictMode: isStrictModeEnabled() });
});

router.put('/strict-mode-config', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const { strictMode } = req.body as { strictMode?: boolean };
  if (typeof strictMode !== 'boolean') {
    return res.status(400).json({ error: 'strictMode must be a boolean' });
  }
  db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'strictMode'")
    .run(strictMode ? '1' : '0');
  res.json({ strictMode });
});

router.get('/gamification-config', authMiddleware, (_req: AuthRequest, res: Response) => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  const gamificationEnabled = row ? row.value !== '0' : true;
  res.json({ gamificationEnabled });
});

router.put('/gamification-config', authMiddleware, (req: AuthRequest, res: Response) => {
  const requestingUser = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId) as { role: string } | undefined;
  if (!requestingUser || requestingUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { gamificationEnabled } = req.body;
  if (typeof gamificationEnabled !== 'boolean') {
    return res.status(400).json({ error: 'gamificationEnabled must be a boolean' });
  }

  db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'gamificationEnabled'")
    .run(gamificationEnabled ? '1' : '0');

  res.json({ gamificationEnabled });
});

router.get('/registration-config', authMiddleware, (req: AuthRequest, res: Response) => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'registrationEnabled'").get() as { value: string } | undefined;
  const registrationEnabled = row ? row.value !== '0' : true;
  res.json({ registrationEnabled });
});

router.put('/registration-config', authMiddleware, (req: AuthRequest, res: Response) => {
  const requestingUser = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId) as { role: string } | undefined;
  if (!requestingUser || requestingUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { registrationEnabled } = req.body;
  if (typeof registrationEnabled !== 'boolean') {
    return res.status(400).json({ error: 'registrationEnabled must be a boolean' });
  }

  db.prepare("UPDATE app_settings SET value = ?, updatedAt = datetime('now') WHERE key = 'registrationEnabled'")
    .run(registrationEnabled ? '1' : '0');

  res.json({ registrationEnabled });
});

export default router;
