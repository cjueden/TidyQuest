import db from '../database';
import { hasWeekdaySchedule, weekdayMask } from './schedule';

/**
 * Two Home sections built from the dashboard's task list:
 * - Your usual: the tasks a person pins, then the ones they did most in the last 30 days.
 * - Maybe you forgot about these: chores overdue by at least their own interval (a weekly chore not
 *   done in two weeks), worst first, minus the ones this person snoozed.
 */

const DAY_MS = 86400000;
const parseStored = (v: string) => new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`);

interface HomeTask {
  id: number; onDemand?: number | boolean; oneTime?: number | boolean; isSeasonal?: boolean; frequencyDays: number;
  lastCompletedAt: string | null; createdAt?: string | null; dueDate: string; scheduleWeekdays?: number | null;
}

/** A chore's own interval in days (set weekdays: the average gap between them), at least a day. */
export function intervalDays(t: { frequencyDays: number; scheduleWeekdays?: number | null }): number {
  if (hasWeekdaySchedule(t)) {
    let mask = weekdayMask(t); let n = 0;
    while (mask) { n += mask & 1; mask >>= 1; }
    return Math.max(1, 7 / n);
  }
  return Math.max(1, Number(t.frequencyDays) || 7);
}

/** How long a chore has been overdue, in days (never done: since it was added). */
export function overdueDays(t: HomeTask, now: Date = new Date()): number {
  const due = !t.lastCompletedAt && !hasWeekdaySchedule(t) && t.createdAt ? parseStored(t.createdAt) : new Date(t.dueDate);
  return Math.max(0, (now.getTime() - due.getTime()) / DAY_MS);
}

export function pinnedTaskIds(userId: number): number[] {
  return (db.prepare('SELECT taskId FROM task_pins WHERE userId = ? ORDER BY createdAt').all(userId) as Array<{ taskId: number }>).map((r) => r.taskId);
}

/** Pins first, then the tasks this person did most (at least twice) in the last 30 days. */
export function usualTasks<T extends HomeTask>(tasks: T[], userId: number, now: Date = new Date(), limit = 10): Array<T & { pinned: boolean; usualCount: number }> {
  const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const counts = new Map((db.prepare(
    "SELECT taskId, COUNT(*) AS n FROM task_completions WHERE userId = ? AND status IN ('approved', 'pending') AND completedAt >= ? GROUP BY taskId"
  ).all(userId, since) as Array<{ taskId: number; n: number }>).map((r) => [r.taskId, r.n]));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const pins = pinnedTaskIds(userId).map((id) => byId.get(id)).filter((t): t is T => !!t);
  const pinnedIds = new Set(pins.map((t) => t.id));
  const auto = tasks
    .filter((t) => !pinnedIds.has(t.id) && !t.oneTime && !t.isSeasonal && (counts.get(t.id) ?? 0) >= 2)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.id - b.id);
  return [...pins, ...auto].slice(0, Math.max(limit, pins.length)).map((t) => ({ ...t, pinned: pinnedIds.has(t.id), usualCount: counts.get(t.id) ?? 0 }));
}

/** Chores overdue by at least their own interval, worst (most intervals behind) first. */
export function forgottenTasks<T extends HomeTask>(tasks: T[], userId: number, now: Date = new Date(), exclude: Set<number> = new Set(), limit = 10): Array<T & { overdueDays: number }> {
  const snoozed = new Set((db.prepare('SELECT taskId FROM task_snoozes WHERE userId = ? AND until > ?').all(userId, now.toISOString()) as Array<{ taskId: number }>).map((r) => r.taskId));
  return tasks
    .filter((t) => !t.onDemand && !t.oneTime && !t.isSeasonal && !snoozed.has(t.id) && !exclude.has(t.id))
    .map((t) => ({ t, days: overdueDays(t, now), ratio: overdueDays(t, now) / intervalDays(t) }))
    .filter((x) => x.ratio >= 1)
    .sort((a, b) => b.ratio - a.ratio || a.t.id - b.t.id)
    .slice(0, limit)
    .map((x) => ({ ...x.t, overdueDays: Math.floor(x.days) }));
}
