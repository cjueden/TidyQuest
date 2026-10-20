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
/** The first day the snapshot covers ('YYYY-MM-DD'): "left overdue" has no history before it. */
const SNAPSHOT_SINCE_KEY = 'overdueSnapshotSince';

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
    db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(SNAPSHOT_SINCE_KEY, day);
    if (getGlobalVacation().isVacation) return;
    const tasks = db.prepare(
      `SELECT * FROM tasks WHERE archivedAt IS NULL AND deletedAt IS NULL AND onDemand = 0 AND (oneTime = 0 OR doBy IS NOT NULL)`
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

export function snapshotSince(): string | null {
  return (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SNAPSHOT_SINCE_KEY) as { value: string } | undefined)?.value ?? null;
}

type ChoreRow = ScheduledTask & {
  id: number; roomId: number; name: string; translationKey: string | null; onDemand: number;
  assignmentMode: string | null; createdAt?: string | null; archivedAt?: string | null; deletedAt?: string | null;
};

/** Whole local calendar days from the due day to the day it was done (0 = on time). */
export function lateDays(due: Date, done: Date): number {
  return Math.round((startOfLocalDay(done).getTime() - startOfLocalDay(due).getTime()) / DAY_MS);
}

/** When the chore was due again after `prev` (the completion before); null when there's nothing to be late for. */
export function dueAfter(task: ChoreRow, prev: Date | null): Date | null {
  if (task.onDemand) return null;
  if (task.oneTime) return task.doBy && /^\d{4}-\d{2}-\d{2}$/.test(task.doBy) ? new Date(`${task.doBy}T00:00:00`) : null;
  if (!prev) return null;
  const due = nextDueAt({ ...task, lastCompletedAt: prev.toISOString() }, prev);
  return due && !isSeasonalNow(task, due) ? due : null;
}

/** Shared and custom chores are done by each assignee; the others once by whoever takes them. */
const perPerson = (t: ChoreRow) => t.assignmentMode === 'shared' || t.assignmentMode === 'custom';
const HOUR_MS = 3600000;

/**
 * Skipped and late chores in [start, end):
 * - late: per chore and person, [taskId, userId, times done, times late, days late added up, most days late]
 * - undone: from the nightly snapshot, [taskId, days left overdue, most days overdue]
 * - waits: open-pool chores, [taskId, times done, hours waited added up, longest wait in hours]
 * - waitingNow: open-pool chores overdue right now (current period only), [taskId, hours since due]
 */
export function skippedChores(start: Date, end: Date, now: Date = new Date()) {
  const done = db.prepare(
    `SELECT taskId, userId, completedAt FROM task_completions
     WHERE status IN ('approved', 'pending') AND completedAt >= ? AND completedAt < ?`
  ).all(new Date(start.getTime() - DAY_MS).toISOString(), new Date(end.getTime() + DAY_MS).toISOString()) as Array<{ taskId: number; userId: number; completedAt: string }>;
  const inPeriod = done.map((r) => ({ ...r, at: parseDbTime(r.completedAt) }))
    .filter((r) => r.at >= start && r.at < end)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  // The last completion before the period, per chore and per chore + person
  const before = db.prepare(
    `SELECT taskId, userId, MAX(completedAt) AS last FROM task_completions
     WHERE status IN ('approved', 'pending') AND completedAt < ? GROUP BY taskId, userId`
  ).all(start.toISOString()) as Array<{ taskId: number; userId: number; last: string }>;
  const lastByTask = new Map<number, Date>();
  const lastByPerson = new Map<string, Date>();
  for (const b of before) {
    const at = parseDbTime(b.last);
    if (at >= start) continue;
    lastByPerson.set(`${b.taskId}:${b.userId}`, at);
    if (!(lastByTask.get(b.taskId)! > at)) lastByTask.set(b.taskId, at);
  }

  const tasks = new Map((db.prepare('SELECT * FROM tasks').all() as ChoreRow[]).map((t) => [t.id, t]));
  const assignees = new Map<number, number[]>();
  for (const a of db.prepare('SELECT taskId, userId FROM task_assignees ORDER BY userId').all() as Array<{ taskId: number; userId: number }>) {
    assignees.set(a.taskId, [...(assignees.get(a.taskId) ?? []), a.userId]);
  }
  const isPool = (t: ChoreRow) => (t.assignmentMode ?? 'first') === 'first' && (assignees.get(t.id)?.length ?? 0) !== 1;

  const late = new Map<string, number[]>();
  const waits = new Map<number, number[]>();
  for (const r of inPeriod) {
    const task = tasks.get(r.taskId);
    if (!task) continue;
    const own = perPerson(task);
    const prev = own ? lastByPerson.get(`${r.taskId}:${r.userId}`) : lastByTask.get(r.taskId);
    lastByPerson.set(`${r.taskId}:${r.userId}`, r.at);
    lastByTask.set(r.taskId, r.at);
    // A team-up partner's row for the same chore
    if (!own && prev && r.at.getTime() - prev.getTime() < 60000) continue;
    const due = dueAfter(task, prev ?? null);
    if (!due) continue;
    const key = `${r.taskId}:${r.userId}`;
    const row = late.get(key) ?? [r.taskId, r.userId, 0, 0, 0, 0];
    const days = lateDays(due, r.at);
    row[2] += 1;
    if (days >= 1) { row[3] += 1; row[4] += days; row[5] = Math.max(row[5], days); }
    late.set(key, row);
    if (isPool(task)) {
      const hours = Math.max(0, (r.at.getTime() - due.getTime()) / HOUR_MS);
      const w = waits.get(r.taskId) ?? [r.taskId, 0, 0, 0];
      w[1] += 1; w[2] += hours; w[3] = Math.max(w[3], hours);
      waits.set(r.taskId, w);
    }
  }

  const undone = db.prepare(
    `SELECT taskId, COUNT(*) AS days, MAX(daysOverdue) AS worst FROM chore_overdue_days
     WHERE day >= ? AND day < ? GROUP BY taskId`
  ).all(localDateStr(start), localDateStr(end)) as Array<{ taskId: number; days: number; worst: number }>;

  // Open-pool chores still waiting: overdue since before today
  const waitingNow: number[][] = [];
  if (end > now && start <= now) {
    const today = startOfLocalDay(now);
    for (const t of tasks.values()) {
      if (t.archivedAt || t.deletedAt || t.onDemand || t.oneTime || !isPool(t)) continue;
      if (isSeasonalNow(t, now) || beforeStart(t, now)) continue;
      const due = nextDueAt(t, now) ?? (t.createdAt ? parseDbTime(t.createdAt) : null);
      if (due && due < today) waitingNow.push([t.id, (now.getTime() - due.getTime()) / HOUR_MS]);
    }
  }

  const round = (v: number) => Math.round(v * 10) / 10;
  const ids = new Set<number>([
    ...[...late.values()].map((r) => r[0]), ...undone.map((u) => u.taskId), ...waitingNow.map((w) => w[0]),
  ]);
  return {
    tasks: [...ids].map((id) => tasks.get(id)!).filter(Boolean).map((t) => ({
      id: t.id, name: t.name, translationKey: t.translationKey, roomId: t.roomId, pool: isPool(t), assignees: assignees.get(t.id) ?? [],
    })),
    late: [...late.values()],
    undone: undone.map((u) => [u.taskId, u.days, u.worst]),
    waits: [...waits.values()].map((w) => [w[0], w[1], round(w[2]), round(w[3])]),
    waitingNow: waitingNow.map((w) => [w[0], round(w[1])]),
  };
}
