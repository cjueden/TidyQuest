import db from '../database';
import { localDateStr } from './dateHelpers';
import { lastCompletedAtForHealth, type ScheduledTask } from './schedule';

/**
 * Pausing a chore (ENH-1). A paused chore keeps its history, settings and assignees but drops out of
 * every list (Home, Tasks, Calendar, reminders, Rescue Mission, team-ups, mascot hints, house health).
 * Parents still see it, greyed, in its room. pausedUntil (a local day) switches it back on by itself.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A valid pause-until day after today, or null (no end date). Returns 'invalid' for anything else. */
export function readPausedUntil(value: unknown, now: Date = new Date()): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value).trim();
  if (!ISO_DAY.test(v) || Number.isNaN(new Date(`${v}T12:00:00`).getTime())) return 'invalid';
  return v > localDateStr(now) ? v : 'invalid';
}

export function pauseTask(taskId: number, until: string | null, now: Date = new Date()): void {
  db.prepare('UPDATE tasks SET pausedAt = COALESCE(pausedAt, ?), pausedUntil = ? WHERE id = ?')
    .run(now.toISOString(), until, taskId);
}

/** Switch a chore back on. It comes back fresh, as if just done, so it doesn't return overdue. */
export function resumeTask(taskId: number, now: Date = new Date()): void {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as (ScheduledTask & { pausedAt: string | null }) | undefined;
  if (!task?.pausedAt) return;
  if (task.oneTime) db.prepare('UPDATE tasks SET pausedAt = NULL, pausedUntil = NULL WHERE id = ?').run(taskId);
  else db.prepare('UPDATE tasks SET pausedAt = NULL, pausedUntil = NULL, lastCompletedAt = ? WHERE id = ?')
    .run(lastCompletedAtForHealth(task, 100, now), taskId);
}

/** Resume chores whose pause-until day has come (run from the 30 s tick). Returns how many. */
export function resumeDuePauses(now: Date = new Date()): number {
  const due = db.prepare('SELECT id FROM tasks WHERE pausedAt IS NOT NULL AND pausedUntil IS NOT NULL AND pausedUntil <= ?')
    .all(localDateStr(now)) as Array<{ id: number }>;
  for (const { id } of due) resumeTask(id, now);
  return due.length;
}
