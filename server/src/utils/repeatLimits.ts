import db from '../database';
import { startOfLocalDay, startOfLocalWeek } from './periods';

export type RepeatPeriod = 'day' | 'week';

/**
 * An anytime (on-demand) quest can be limited to a number of completions per person per day or
 * per week, e.g. "All Homework Turned In This Week" once a week. Scheduled tasks have their own
 * cooldown, so a limit stored on one is ignored.
 */
export function repeatLimitOf(task: { onDemand?: number | boolean | null; repeatLimit?: number | null; repeatPeriod?: string | null }): { limit: number; period: RepeatPeriod } | null {
  if (!task.onDemand) return null;
  const limit = Number(task.repeatLimit);
  if (!Number.isInteger(limit) || limit <= 0) return null;
  return { limit, period: task.repeatPeriod === 'day' ? 'day' : 'week' };
}

/**
 * Validate repeatLimit / repeatPeriod from a create or update request.
 * Returns undefined when the request doesn't touch the limit, or an error message.
 */
export function parseRepeatLimit(body: { repeatLimit?: unknown; repeatPeriod?: unknown }):
  { value?: { repeatLimit: number | null; repeatPeriod: RepeatPeriod | null }; error?: string } {
  const { repeatLimit, repeatPeriod } = body;
  if (repeatLimit === undefined && repeatPeriod === undefined) return {};
  if (repeatLimit === null || repeatLimit === '' || repeatLimit === 0 || repeatLimit === '0') {
    return { value: { repeatLimit: null, repeatPeriod: null } };
  }
  const n = Number(repeatLimit);
  if (!Number.isInteger(n) || n < 1 || n > 99) return { error: 'repeatLimit must be a whole number from 1 to 99' };
  if (repeatPeriod !== 'day' && repeatPeriod !== 'week') return { error: "repeatPeriod must be 'day' or 'week'" };
  return { value: { repeatLimit: n, repeatPeriod } };
}

export function periodStart(period: RepeatPeriod, now: Date = new Date()): Date {
  return period === 'day' ? startOfLocalDay(now) : startOfLocalWeek(now);
}

/** Times this person did the task in the current day/week; completions waiting for a parent count too. */
export function countInPeriod(taskId: number, userId: number, period: RepeatPeriod, now: Date = new Date()): number {
  const row = db.prepare(
    "SELECT COUNT(*) AS n FROM task_completions WHERE taskId = ? AND userId = ? AND status IN ('approved', 'pending') AND completedAt >= ?"
  ).get(taskId, userId, periodStart(period, now).toISOString()) as { n: number };
  return row.n;
}

/** The viewer's count in the current period for every task that has a repeat limit (task id -> count). */
export function repeatCountsFor(userId: number | undefined, tasks: Array<{ id: number; onDemand?: number | boolean | null; repeatLimit?: number | null; repeatPeriod?: string | null }>, now: Date = new Date()): Map<number, number> {
  const counts = new Map<number, number>();
  if (!userId) return counts;
  const limited = tasks.filter((t) => repeatLimitOf(t));
  if (limited.length === 0) return counts;
  const countsSince = (period: RepeatPeriod) => new Map(
    (db.prepare(
      "SELECT taskId, COUNT(*) AS n FROM task_completions WHERE userId = ? AND status IN ('approved', 'pending') AND completedAt >= ? GROUP BY taskId"
    ).all(userId, periodStart(period, now).toISOString()) as { taskId: number; n: number }[]).map((r) => [r.taskId, r.n])
  );
  const byPeriod: Partial<Record<RepeatPeriod, Map<number, number>>> = {};
  for (const t of limited) {
    const { period } = repeatLimitOf(t)!;
    byPeriod[period] ??= countsSince(period);
    counts.set(t.id, byPeriod[period]!.get(t.id) || 0);
  }
  return counts;
}
