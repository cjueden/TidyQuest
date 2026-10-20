import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { startOfLocalDay } from '../utils/periods';
import { bucketIndex, choresDone, coinsByWeek, heatSlot, INSIGHTS_PERIODS, parseDbTime, periodWindow, samePointBefore, skippedChores, snapshotSince, type InsightsPeriod } from '../utils/insights';

// Insights for parents (NEW-7). Admins only. Rows are compact arrays; the client stacks and switches measure.
const router = Router();
router.use(authMiddleware);
router.use((req: AuthRequest, res, next) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  next();
});

function people() {
  return db.prepare('SELECT id, displayName AS name, avatarColor AS color FROM users ORDER BY id').all();
}

function earliestDone(): string | null {
  const row = db.prepare("SELECT MIN(completedAt) AS first FROM task_completions WHERE status IN ('approved', 'pending')").get() as { first: string | null };
  return row.first ? parseDbTime(row.first).toISOString() : null;
}

// Bars for one period: rows [bucket, userId, taskId, chores, coins, effort], plus last period's totals per person.
// While a period is still running, last period counts only up to the same point (this time last week).
router.get('/bars', (req: AuthRequest, res: Response) => {
  const period = (INSIGHTS_PERIODS as string[]).includes(String(req.query.period)) ? req.query.period as InsightsPeriod : 'week';
  const offset = Math.min(0, Math.max(-520, Math.trunc(Number(req.query.offset)) || 0));
  const win = periodWindow(period, offset);
  const prev = periodWindow(period, offset - 1);
  const soFar = offset === 0;
  const prevEnd = soFar ? samePointBefore(period) : prev.end;

  const grouped = new Map<string, number[]>();
  const taskIds = new Set<number>();
  for (const d of choresDone(win.start, win.end)) {
    const b = bucketIndex(period, d.at);
    const key = `${b}:${d.userId}:${d.taskId}`;
    const row = grouped.get(key) ?? [b, d.userId, d.taskId, 0, 0, 0];
    row[3] += 1; row[4] += d.coins; row[5] += d.effort;
    grouped.set(key, row);
    taskIds.add(d.taskId);
  }
  const previous = new Map<number, number[]>();
  for (const d of choresDone(prev.start, prevEnd)) {
    const row = previous.get(d.userId) ?? [d.userId, 0, 0, 0];
    row[1] += 1; row[2] += d.coins; row[3] += d.effort;
    previous.set(d.userId, row);
  }

  const ids = [...taskIds];
  const tasks = ids.length
    ? db.prepare(`SELECT id, name, roomId, translationKey FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : [];
  const rooms = db.prepare('SELECT id, name, roomType FROM rooms ORDER BY sortOrder, id').all();

  res.json({
    period, offset,
    start: win.start.toISOString(), end: win.end.toISOString(), buckets: win.buckets,
    earliest: earliestDone(),
    people: people(), rooms, tasks,
    rows: [...grouped.values()],
    previous: [...previous.values()],
    previousSoFar: soFar,
  });
});

// Skipped and late chores for one period (see skippedChores); rooms are rolled up on the client
router.get('/skipped', (req: AuthRequest, res: Response) => {
  const period = (INSIGHTS_PERIODS as string[]).includes(String(req.query.period)) ? req.query.period as InsightsPeriod : 'week';
  const offset = Math.min(0, Math.max(-520, Math.trunc(Number(req.query.offset)) || 0));
  const win = periodWindow(period, offset);
  res.json({
    period, offset, start: win.start.toISOString(), end: win.end.toISOString(),
    snapshotSince: snapshotSince(),
    rooms: db.prepare('SELECT id, name, roomType FROM rooms ORDER BY sortOrder, id').all(),
    ...skippedChores(win.start, win.end),
  });
});

// Coins in and out per person and week, over the last 8 or 26 weeks
router.get('/coins', (req: AuthRequest, res: Response) => {
  res.json(coinsByWeek(Number(req.query.weeks) === 26 ? 26 : 8));
});

// Weekday × time of day over the last 4 or 12 weeks: rows [weekday (0 = Mon), slot, userId, chores, coins, effort]
router.get('/heatmap', (req: AuthRequest, res: Response) => {
  const weeks = Number(req.query.weeks) === 12 ? 12 : 4;
  const end = startOfLocalDay();
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - weeks * 7);

  const grouped = new Map<string, number[]>();
  for (const d of choresDone(start, end)) {
    const w = (d.at.getDay() + 6) % 7;
    const s = heatSlot(d.at);
    const key = `${w}:${s}:${d.userId}`;
    const row = grouped.get(key) ?? [w, s, d.userId, 0, 0, 0];
    row[3] += 1; row[4] += d.coins; row[5] += d.effort;
    grouped.set(key, row);
  }
  res.json({ weeks, start: start.toISOString(), end: end.toISOString(), people: people(), rows: [...grouped.values()] });
});

export default router;
