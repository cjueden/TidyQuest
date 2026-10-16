import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { getBoost, toBoost } from '../utils/boosts';

// Double coins events (admin only). Coins are multiplied when a chore is completed, in tasks.ts.
const router = Router();
router.use(authMiddleware);

const MAX_MULTIPLIER = 10;

/** Validate a create/update body. `current` fills in fields an update leaves out. */
type BoostFields = { title: string; multiplier: number; startAt: string; endAt: string; roomIds: number[] | null; taskIds: number[] | null };

/** An optional list of room or task ids: null/[] = none; every id must exist. */
function parseIdList(raw: unknown, current: number[] | null, table: 'rooms' | 'tasks'): { ids?: number[] | null; error?: string } {
  const field = table === 'rooms' ? 'roomIds' : 'taskIds';
  if (raw === undefined) return { ids: current };
  if (raw === null || (Array.isArray(raw) && raw.length === 0)) return { ids: null };
  if (!Array.isArray(raw)) return { error: `${field} must be an array of ${table === 'rooms' ? 'room' : 'task'} ids or null` };
  const ids = [...new Set(raw.map(Number))] as number[];
  if (ids.some((id) => !Number.isInteger(id))) return { error: `${field} must be an array of ${table === 'rooms' ? 'room' : 'task'} ids or null` };
  const found = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`).get(...ids) as { n: number };
  if (found.n !== ids.length) return { error: table === 'rooms' ? 'Room not found' : 'Task not found' };
  return { ids };
}

function parseBoost(body: any, current?: BoostFields): { value?: BoostFields; error?: string } {
  const title = body.title !== undefined ? String(body.title ?? '').trim().slice(0, 80) : current?.title ?? '';
  if (!title) return { error: 'title is required' };

  const multiplier = body.multiplier !== undefined ? Number(body.multiplier) : current?.multiplier ?? 2;
  if (!Number.isFinite(multiplier) || multiplier <= 1 || multiplier > MAX_MULTIPLIER) {
    return { error: `multiplier must be more than 1 and at most ${MAX_MULTIPLIER}` };
  }

  const startRaw = body.startAt !== undefined ? body.startAt : current?.startAt;
  const endRaw = body.endAt !== undefined ? body.endAt : current?.endAt;
  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;
  if (!start || Number.isNaN(start.getTime())) return { error: 'startAt must be a valid date' };
  if (!end || Number.isNaN(end.getTime())) return { error: 'endAt must be a valid date' };
  if (end.getTime() <= start.getTime()) return { error: 'endAt must be after startAt' };

  const rooms = parseIdList(body.roomIds, current?.roomIds ?? null, 'rooms');
  if (rooms.error) return { error: rooms.error };
  const tasks = parseIdList(body.taskIds, current?.taskIds ?? null, 'tasks');
  if (tasks.error) return { error: tasks.error };

  return { value: { title, multiplier: Math.round(multiplier * 100) / 100, startAt: start.toISOString(), endAt: end.toISOString(), roomIds: rooms.ids ?? null, taskIds: tasks.ids ?? null } };
}

const ids = (list: number[] | null) => (list ? JSON.stringify(list) : null);

// All boosts, newest first (the Settings list shows running, upcoming and recent ones)
router.get('/', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const rows = db.prepare('SELECT * FROM coin_boosts ORDER BY startAt DESC, id DESC LIMIT 100').all() as any[];
  res.json(rows.map(toBoost));
});

router.post('/', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const { value, error } = parseBoost(req.body || {});
  if (!value) return res.status(400).json({ error });
  const result = db.prepare(
    'INSERT INTO coin_boosts (title, multiplier, startAt, endAt, roomIds, taskIds, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(value.title, value.multiplier, value.startAt, value.endAt, ids(value.roomIds), ids(value.taskIds), req.userId);
  res.status(201).json(getBoost(Number(result.lastInsertRowid)));
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const current = getBoost(Number(req.params.id));
  if (!current) return res.status(404).json({ error: 'Boost not found' });
  const { value, error } = parseBoost(req.body || {}, current);
  if (!value) return res.status(400).json({ error });
  // A moved start or end gets its notification again (a start already in the past stays sent)
  const notifiedStart = value.startAt !== current.startAt && new Date(value.startAt).getTime() > Date.now() ? 0 : current.notifiedStart;
  const notifiedEnding = value.endAt !== current.endAt ? 0 : current.notifiedEnding;
  db.prepare(
    'UPDATE coin_boosts SET title = ?, multiplier = ?, startAt = ?, endAt = ?, roomIds = ?, taskIds = ?, notifiedStart = ?, notifiedEnding = ? WHERE id = ?'
  ).run(value.title, value.multiplier, value.startAt, value.endAt, ids(value.roomIds), ids(value.taskIds), notifiedStart, notifiedEnding, current.id);
  res.json(getBoost(current.id));
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const result = db.prepare('DELETE FROM coin_boosts WHERE id = ?').run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Boost not found' });
  res.json({ success: true });
});

export default router;
