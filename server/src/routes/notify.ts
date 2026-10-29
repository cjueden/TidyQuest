import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { NOTIFICATION_KINDS } from '../utils/notifications';
import { getPeople, personalChannels, sendPersonTest } from '../utils/notify';
import { SCHEDULE_DEFAULTS } from '../utils/notifySchedule';
import { tr } from '../utils/i18n';
import { isHosted } from '../hosted/context';

/**
 * Notification settings beyond the family channel (Settings → Notifications): times for the
 * summaries, quiet and school hours, Home Assistant, each person's own channels and choices, and the
 * log of what was sent.
 */
const router = Router();
router.use(authMiddleware);

const get = (key: string) => (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? '';
const set = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function readSettings() {
  return {
    morningTime: get('morningTime') || SCHEDULE_DEFAULTS.morningTime,
    eveningTime: get('eveningTime') || SCHEDULE_DEFAULTS.eveningTime,
    recapDay: Number(get('recapDay') || SCHEDULE_DEFAULTS.recapDay),
    recapTime: get('recapTime') || SCHEDULE_DEFAULTS.recapTime,
    quietStart: get('quietStart'),
    quietEnd: get('quietEnd'),
    schoolHoursEnabled: get('schoolHoursEnabled') === '1',
    schoolStart: get('schoolStart') || '08:00',
    schoolEnd: get('schoolEnd') || '15:00',
    haUrl: get('haUrl'),
    hasHaToken: !!get('haToken'),
    haFamilyService: get('haFamilyService'),
  };
}

router.get('/settings', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  res.json(readSettings());
});

router.put('/settings', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const b = req.body ?? {};
  for (const key of ['morningTime', 'eveningTime', 'recapTime', 'schoolStart', 'schoolEnd']) {
    if (b[key] !== undefined && !HM.test(String(b[key]))) return res.status(400).json({ error: 'invalid_time', field: key });
  }
  for (const key of ['quietStart', 'quietEnd']) {
    if (b[key] !== undefined && b[key] !== '' && !HM.test(String(b[key]))) return res.status(400).json({ error: 'invalid_time', field: key });
  }
  if (b.recapDay !== undefined && !(Number.isInteger(Number(b.recapDay)) && Number(b.recapDay) >= 0 && Number(b.recapDay) <= 6)) {
    return res.status(400).json({ error: 'invalid_day' });
  }
  // Hosted mode has no Home Assistant: its address could be a machine inside the hosting network
  if (isHosted() && (b.haUrl || b.haToken || b.haFamilyService)) return res.status(400).json({ error: 'ha_off' });
  if (b.haUrl) {
    try {
      if (!['http:', 'https:'].includes(new URL(String(b.haUrl)).protocol)) throw new Error('protocol');
    } catch {
      return res.status(400).json({ error: 'invalid_url' });
    }
  }
  if (b.haFamilyService && !/^(notify\.)?[a-z0-9_]+$/.test(String(b.haFamilyService))) return res.status(400).json({ error: 'invalid_service' });
  for (const key of ['morningTime', 'eveningTime', 'recapTime', 'schoolStart', 'schoolEnd', 'quietStart', 'quietEnd', 'haFamilyService']) {
    if (b[key] !== undefined) set(key, String(b[key]).trim());
  }
  if (b.recapDay !== undefined) set('recapDay', String(Number(b.recapDay)));
  if (b.schoolHoursEnabled !== undefined) set('schoolHoursEnabled', b.schoolHoursEnabled ? '1' : '0');
  if (b.haUrl !== undefined) set('haUrl', String(b.haUrl).trim().replace(/\/+$/, ''));
  // The token is write-only: empty string clears it, leaving it out keeps it
  if (typeof b.haToken === 'string') set('haToken', b.haToken.trim());
  res.json(readSettings());
});

const canEdit = (req: AuthRequest, userId: number) => ensureAdmin(req.userId) || req.userId === userId;

function personView(id: number) {
  const p = getPeople().find((x) => x.id === id);
  if (!p) return null;
  return {
    id: p.id, displayName: p.displayName, role: p.role, language: p.language,
    ntfyTopic: p.ntfyTopic ?? '', telegramChatId: p.telegramChatId ?? '', haNotifyService: p.haNotifyService ?? '',
    prefs: Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, p.prefs[k] !== false])),
    channels: personalChannels(p).map((c) => c.channel),
  };
}

router.get('/people', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  res.json(getPeople().map((p) => personView(p.id)));
});

router.get('/people/:id', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!canEdit(req, id)) return res.status(403).json({ error: 'Not allowed' });
  const view = personView(id);
  if (!view) return res.status(404).json({ error: 'not_found' });
  res.json(view);
});

router.put('/people/:id', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!canEdit(req, id)) return res.status(403).json({ error: 'Not allowed' });
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) return res.status(404).json({ error: 'not_found' });
  const b = req.body ?? {};
  const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (b.ntfyTopic !== undefined && clean(b.ntfyTopic) && !/^[A-Za-z0-9_-]{1,64}$/.test(clean(b.ntfyTopic))) return res.status(400).json({ error: 'invalid_topic' });
  if (b.telegramChatId !== undefined && clean(b.telegramChatId) && !/^-?\d{1,20}$|^@[A-Za-z0-9_]{4,64}$/.test(clean(b.telegramChatId))) return res.status(400).json({ error: 'invalid_chat' });
  if (b.haNotifyService !== undefined && clean(b.haNotifyService) && !/^(notify\.)?[a-z0-9_]+$/.test(clean(b.haNotifyService))) return res.status(400).json({ error: 'invalid_service' });
  if (isHosted() && clean(b.haNotifyService)) return res.status(400).json({ error: 'ha_off' });
  const updates: Record<string, string | null> = {};
  for (const key of ['ntfyTopic', 'telegramChatId', 'haNotifyService']) if (b[key] !== undefined) updates[key] = clean(b[key]) || null;
  if (b.prefs && typeof b.prefs === 'object') {
    updates.notifyPrefs = JSON.stringify(Object.fromEntries(NOTIFICATION_KINDS.filter((k) => b.prefs[k] === false).map((k) => [k, false])));
  }
  const cols = Object.keys(updates);
  if (cols.length) db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(updates), id);
  res.json(personView(id));
});

router.post('/people/:id/test', async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!canEdit(req, id)) return res.status(403).json({ error: 'Not allowed' });
  const p = getPeople().find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const results = await sendPersonTest(id, tr(p.language, 'notify.test', { name: p.displayName }));
  if (results.length === 0) return res.status(400).json({ error: 'no_channels' });
  res.json({ results });
});

router.get('/log', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  res.json(db.prepare(
    `SELECT l.id, l.sentAt, l.userId, u.displayName, l.channel, l.kind, l.message, l.ok, l.error
     FROM notification_log l LEFT JOIN users u ON u.id = l.userId ORDER BY l.id DESC LIMIT 100`
  ).all());
});

export default router;
