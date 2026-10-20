import db from '../database';
import { localDateStr } from './dateHelpers';
import { startOfLocalDay, startOfLocalWeek } from './periods';
import { beforeStart, isSeasonalNow, nextDueAt, type ScheduledTask } from './schedule';
import { getGlobalVacation } from './adminHelpers';

// Insights for parents (NEW-7): chores done per period, a weekday × time-of-day heatmap, and a nightly
// record of chores left overdue. Everything is grouped by completedAt in the server's local time (TZ).

export type InsightsPeriod = 'day' | 'week' | 'month' | 'year';
export const INSIGHTS_PERIODS: InsightsPeriod[] = ['day', 'week', 'month', 'year'];

const DAY_MS = 86400000;

/** The period `offset` steps back (0 = the current one): [start, end) in local time and its bucket starts. */
export function periodWindow(period: InsightsPeriod, offset: number, now: Date = new Date()) {
  let start: Date;
  if (period === 'day') {
    start = startOfLocalDay(now);
    start.setDate(start.getDate() + offset);
  } else if (period === 'week') {
    start = startOfLocalWeek(now);
    start.setDate(start.getDate() + offset * 7);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  } else {
    start = new Date(now.getFullYear() + offset, 0, 1);
  }
  const end = new Date(start);
  if (period === 'day') end.setDate(end.getDate() + 1);
  else if (period === 'week') end.setDate(end.getDate() + 7);
  else if (period === 'month') end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);

  const buckets: string[] = [];
  const b = new Date(start);
  while (b < end) {
    buckets.push(b.toISOString());
    if (period === 'day') b.setHours(b.getHours() + 1, 0, 0, 0);
    else if (period === 'year') b.setMonth(b.getMonth() + 1);
    else b.setDate(b.getDate() + 1);
  }
  // A DST day has 23 or 25 hours; keep one bar per wall-clock hour
  return { start, end, buckets: period === 'day' ? buckets.slice(0, 24) : buckets };
}

/** The same moment one period earlier (this time yesterday, last week, last month or last year). */
export function samePointBefore(period: InsightsPeriod, now: Date = new Date()): Date {
  const d = new Date(now);
  if (period === 'day') d.setDate(d.getDate() - 1);
  else if (period === 'week') d.setDate(d.getDate() - 7);
  else if (period === 'month') {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else d.setFullYear(d.getFullYear() - 1);
  return d;
}

/** Which bar of the period a moment falls in. */
export function bucketIndex(period: InsightsPeriod, at: Date): number {
  if (period === 'day') return at.getHours();
  if (period === 'week') return (at.getDay() + 6) % 7;
  if (period === 'month') return at.getDate() - 1;
  return at.getMonth();
}

/** Heatmap columns: 6–9, 9–12, 12–3, 3–6, 6–9, and 9 pm to 6 am. */
export const HEAT_SLOTS = [6, 9, 12, 15, 18, 21];
export function heatSlot(at: Date): number {
  const h = at.getHours();
  if (h < 6) return 5;
  return Math.min(5, Math.floor((h - 6) / 3));
}

/** Stored times are ISO, but SQLite defaults ('YYYY-MM-DD HH:MM:SS') are UTC without a zone. */
export function parseDbTime(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
}

export interface DoneRow { at: Date; userId: number; taskId: number; coins: number; effort: number }

/** Chores done in [start, end): approved and waiting for approval. Coins count only once paid. */
export function choresDone(start: Date, end: Date): DoneRow[] {
  // Widen the text range by a day, then filter on parsed times (mixed stored formats)
  const rows = db.prepare(
    `SELECT tc.completedAt, tc.userId, tc.taskId, tc.status, tc.coinsEarned, t.effort
     FROM task_completions tc JOIN tasks t ON t.id = tc.taskId
     WHERE tc.status IN ('approved', 'pending') AND tc.completedAt >= ? AND tc.completedAt < ?`
  ).all(new Date(start.getTime() - DAY_MS).toISOString(), new Date(end.getTime() + DAY_MS).toISOString()) as Array<{
    completedAt: string; userId: number; taskId: number; status: string; coinsEarned: number; effort: number;
  }>;
  const out: DoneRow[] = [];
  for (const r of rows) {
    const at = parseDbTime(r.completedAt);
    if (at < start || at >= end) continue;
    out.push({ at, userId: r.userId, taskId: r.taskId, coins: r.status === 'approved' ? r.coinsEarned : 0, effort: r.effort || 1 });
  }
  return out;
}

const SNAPSHOT_KEY = 'overdueSnapshotDay';

/**
 * Once a day, record which chores were left overdue at the end of yesterday (date, chore, days overdue).
 * "Due and never done" isn't stored anywhere else, so its history starts the day this runs.
 */
export function snapshotOverdueChores(now: Date = new Date()): number {
  const at = startOfLocalDay(now);
  const yesterday = new Date(at);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = localDateStr(yesterday);
  const last = (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SNAPSHOT_KEY) as { value: string } | undefined)?.value;
  if (last && last >= day) return 0;

  let recorded = 0;
  const run = db.transaction(() => {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(SNAPSHOT_KEY, day);
    if (getGlobalVacation().isVacation) return;
    const tasks = db.prepare(
      `SELECT * FROM tasks WHERE archivedAt IS NULL AND deletedAt IS NULL AND (oneTime = 0 OR doBy IS NOT NULL)`
    ).all() as Array<ScheduledTask & { id: number; roomId: number; createdAt?: string | null }>;
    const insert = db.prepare('INSERT OR IGNORE INTO chore_overdue_days (day, taskId, roomId, dueAt, daysOverdue) VALUES (?, ?, ?, ?, ?)');
    const noon = new Date(yesterday);
    noon.setHours(12);
    for (const t of tasks) {
      if (!t.oneTime && isSeasonalNow(t, noon)) continue;
      if (beforeStart(t, at)) continue;
      const due = nextDueAt(t, at) ?? (t.createdAt ? parseDbTime(t.createdAt) : null);
      if (!due || due >= at) continue;
      const days = Math.max(1, Math.round((at.getTime() - startOfLocalDay(due).getTime()) / DAY_MS));
      recorded += insert.run(day, t.id, t.roomId, due.toISOString(), days).changes;
    }
  });
  run();
  return recorded;
}
