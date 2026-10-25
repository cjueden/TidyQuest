import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { startOfLocalDay, weekStartDay } from '../utils/periods';
import { dayAt, familyZone, startOfDay, wall } from '../utils/clock';
import {
  bucketFinder, choresDone, coinsByWeek, customWindow, daysBetween, heatSlot, INSIGHTS_PERIODS, parseDbTime, periodWindow,
  samePointBefore, skippedChores, snapshotSince, type InsightsPeriod, type InsightsWindow,
} from '../utils/insights';

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

/** The family's day from 'YYYY-MM-DD' (noon, so DST never moves it), or null. */
function dayParam(v: unknown): Date | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? dayAt(v, 12) : null;
}

/**
 * The window a request asks for: period=day|week|month|year with date=YYYY-MM-DD (the period holding that day)
 * or offset=-n (periods back from now), or period=custom with from= and to= (both days included). Never later
 * than now. Also the window before it, which a running window compares with only up to the same point.
 */
function windowFrom(q: Record<string, unknown>, now: Date = new Date()) {
  const custom = q.period === 'custom';
  const period = (INSIGHTS_PERIODS as string[]).includes(String(q.period)) ? q.period as InsightsPeriod : 'week';
  let win: InsightsWindow;
  let prev: { start: Date; end: Date };
  if (custom) {
    const today = startOfLocalDay(now);
    const clamp = (d: Date | null) => (d && d < now ? d : today);
    const to = clamp(dayParam(q.to));
    const from = dayParam(q.from) ?? new Date(to.getTime() - 6 * 86400000);
    win = customWindow(clamp(from), to);
    const days = daysBetween(win.start, win.end);
    prev = { start: startOfDay(win.start, -days), end: win.start };
  } else {
    const date = dayParam(q.date);
    const anchor = date && date < now ? date : now;
    const offset = date ? 0 : Math.min(0, Math.max(-520, Math.trunc(Number(q.offset)) || 0));
    win = periodWindow(period, offset, anchor);
    prev = periodWindow(period, offset - 1, anchor);
  }
  const running = win.start <= now && now < win.end;
  const prevEnd = !running ? prev.end
    : custom ? new Date(prev.start.getTime() + (now.getTime() - win.start.getTime()))
      : samePointBefore(period, now);
  return { period: custom ? 'custom' : period, win, prevStart: prev.start, prevEnd, running };
}

// Bars for one period: rows [bucket, userId, taskId, chores, coins, effort], plus last period's totals per person.
// While a period is still running, last period counts only up to the same point (this time last week).
router.get('/bars', (req: AuthRequest, res: Response) => {
  const { period, win, prevStart, prevEnd, running } = windowFrom(req.query);
  const bucketOf = bucketFinder(win);

  const grouped = new Map<string, number[]>();
  const taskIds = new Set<number>();
  for (const d of choresDone(win.start, win.end)) {
    const b = bucketOf(d.at);
    const key = `${b}:${d.userId}:${d.taskId}`;
    const row = grouped.get(key) ?? [b, d.userId, d.taskId, 0, 0, 0];
    row[3] += 1; row[4] += d.coins; row[5] += d.effort;
    grouped.set(key, row);
    taskIds.add(d.taskId);
  }
  const previous = new Map<number, number[]>();
  for (const d of choresDone(prevStart, prevEnd)) {
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
    period, grain: win.grain,
    start: win.start.toISOString(), end: win.end.toISOString(), buckets: win.buckets,
    earliest: earliestDone(),
    people: people(), rooms, tasks,
    rows: [...grouped.values()],
    previous: [...previous.values()],
    previousSoFar: running,
  });
});

// Skipped and late chores for one period (see skippedChores); rooms are rolled up on the client
router.get('/skipped', (req: AuthRequest, res: Response) => {
  const { period, win } = windowFrom(req.query);
  res.json({
    period, start: win.start.toISOString(), end: win.end.toISOString(),
    snapshotSince: snapshotSince(),
    rooms: db.prepare('SELECT id, name, roomType FROM rooms ORDER BY sortOrder, id').all(),
    ...skippedChores(win.start, win.end),
  });
});

/** The last day a heatmap or the coins card covers: end=YYYY-MM-DD, never after today. */
function endDay(q: Record<string, unknown>, now: Date = new Date()): Date {
  const d = dayParam(q.end);
  return d && d < now ? d : now;
}

// Coins in and out per person and week, over the 8 or 26 weeks up to the week holding end= (default today)
router.get('/coins', (req: AuthRequest, res: Response) => {
  res.json(coinsByWeek(Number(req.query.weeks) === 26 ? 26 : 8, endDay(req.query)));
});

// Weekday × time of day over the 4 or 12 weeks up to end= (default today): rows [weekday (0 = the week's first day), slot, userId,
// chores, coins, effort]
router.get('/heatmap', (req: AuthRequest, res: Response) => {
  const weeks = Number(req.query.weeks) === 12 ? 12 : 4;
  const end = startOfDay(endDay(req.query), 1);
  const start = startOfDay(end, -weeks * 7);

  const first = weekStartDay();
  const tz = familyZone();
  const grouped = new Map<string, number[]>();
  for (const d of choresDone(start, end)) {
    if (d.late) continue; // a late log's time of day is unknown
    const w = (wall(d.at, tz).weekday - first + 7) % 7; // row 0 is the week's first day
    const s = heatSlot(d.at, tz);
    const key = `${w}:${s}:${d.userId}`;
    const row = grouped.get(key) ?? [w, s, d.userId, 0, 0, 0];
    row[3] += 1; row[4] += d.coins; row[5] += d.effort;
    grouped.set(key, row);
  }
  res.json({ weeks, weekStart: first, start: start.toISOString(), end: end.toISOString(), people: people(), rows: [...grouped.values()] });
});

export default router;
