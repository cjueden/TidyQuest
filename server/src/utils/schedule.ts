import db from '../database';
import { calculateHealth } from './health';

/**
 * When a task is due, in one place, so the room page, Home, the completion cooldown, house health
 * and the reminders all agree.
 *
 * - Rolling interval (the default): due frequencyDays after the last completion, so it drifts when
 *   done late. Unchanged; health is calculateHealth().
 * - Set weekdays (scheduleWeekdays, a bitmask like Date.getDay(): bit 0 = Sunday … bit 6 = Saturday):
 *   due when the first scheduled day after the day it was last done starts (never done: the first
 *   scheduled day from today on). Health runs from 100 at the last completion down to 0 at that
 *   moment, so "health 0" still means "due" everywhere.
 * - Season (seasonStartMonth..seasonEndMonth, 1–12, may wrap over the new year, e.g. 11..2):
 *   outside it the task behaves exactly like isSeasonal (no due lists, no house health).
 * - Weekly rotation (rotationPeriod 'week'): whose turn is the assignees ordered by userId at
 *   index weekNumber % n, counting calendar weeks that start on Monday. Nothing is stored.
 *
 * All dates are local time, like the rest of the server.
 */

const DAY_MS = 86400000;
export const ALL_WEEKDAYS = 0b1111111;

export interface ScheduledTask {
  frequencyDays: number;
  lastCompletedAt: string | null;
  isSeasonal?: number | boolean | null;
  seasonStartMonth?: number | null;
  seasonEndMonth?: number | null;
  scheduleWeekdays?: number | null;
  /** One-time chore: done once, then archived */
  oneTime?: number | boolean | null;
  /** One-time chore's "do by" date, 'YYYY-MM-DD' (local) */
  doBy?: string | null;
  createdAt?: string | null;
}

interface Vacation { isVacation: boolean; startDate: string | null }
const NO_VACATION: Vacation = { isVacation: false, startDate: null };

export function weekdayMask(task: { scheduleWeekdays?: number | null }): number {
  return (Number(task.scheduleWeekdays) || 0) & ALL_WEEKDAYS;
}

export function hasWeekdaySchedule(task: { scheduleWeekdays?: number | null }): boolean {
  return weekdayMask(task) > 0;
}

/** Inside its season (or no season set). */
export function isInSeason(task: ScheduledTask, now: Date = new Date()): boolean {
  const start = Number(task.seasonStartMonth);
  const end = Number(task.seasonEndMonth);
  if (!(start >= 1 && start <= 12 && end >= 1 && end <= 12)) return true;
  const month = now.getMonth() + 1;
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}

/** Treated as seasonal right now: the isSeasonal flag, or outside its season. */
export function isSeasonalNow(task: ScheduledTask, now: Date = new Date()): boolean {
  return !!task.isSeasonal || !isInSeason(task, now);
}

/** Midnight (local) of the day `days` after d's day. Built from the calendar, so DST can't shift it. */
function localDay(d: Date, days = 0): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** First scheduled day on or after (inclusive) / strictly after `from`'s day. */
function nextScheduledDay(mask: number, from: Date, inclusive: boolean): Date {
  for (let i = inclusive ? 0 : 1; i <= 7; i++) {
    const day = localDay(from, i);
    if (mask & (1 << day.getDay())) return day;
  }
  return localDay(from, 7); // unreachable with a non-empty mask
}

/** Last scheduled day strictly before `before`'s day. */
function previousScheduledDay(mask: number, before: Date): Date {
  for (let i = 1; i <= 7; i++) {
    const day = localDay(before, -i);
    if (mask & (1 << day.getDay())) return day;
  }
  return localDay(before, -7);
}

/** SQLite datetime('now') ("2026-10-16 07:12:00", UTC) or an ISO string, as a Date */
const parseStored = (v: string) => new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`);

/**
 * A one-time chore is due from its do-by day (or from when it was added) and overdue once that day
 * ends (without a date: a week after it was added).
 */
export function oneTimeDeadline(task: ScheduledTask, now: Date = new Date()): Date {
  if (task.doBy && /^\d{4}-\d{2}-\d{2}$/.test(task.doBy)) return new Date(`${task.doBy}T23:59:59.999`);
  const added = task.createdAt ? parseStored(task.createdAt) : now;
  return new Date(added.getTime() + 7 * DAY_MS);
}

/** Counts toward room and house health (not out of season, not a one-time chore). */
export function countsForHealth(task: ScheduledTask, now: Date = new Date()): boolean {
  return !task.oneTime && !isSeasonalNow(task, now);
}

/** When the task is next due; null for a rolling task that was never done (due now). */
export function nextDueAt(task: ScheduledTask, now: Date = new Date()): Date | null {
  if (task.oneTime) {
    if (task.doBy && /^\d{4}-\d{2}-\d{2}$/.test(task.doBy)) return new Date(`${task.doBy}T00:00:00`);
    return task.createdAt ? parseStored(task.createdAt) : null;
  }
  const mask = weekdayMask(task);
  if (mask) {
    return task.lastCompletedAt
      ? nextScheduledDay(mask, new Date(task.lastCompletedAt), false)
      : nextScheduledDay(mask, now, true);
  }
  if (!task.lastCompletedAt) return null;
  const safeFreq = Math.max(1 / 24, Number(task.frequencyDays) || 7);
  return new Date(new Date(task.lastCompletedAt).getTime() + safeFreq * DAY_MS);
}

/** Health 0–100 for either kind of schedule (frozen at the vacation start, like calculateHealth). */
export function taskHealth(task: ScheduledTask, vacation: Vacation = NO_VACATION, now: Date = new Date()): number {
  if (task.oneTime) return now.getTime() > oneTimeDeadline(task, now).getTime() ? 0 : 100;
  const mask = weekdayMask(task);
  if (!mask) return calculateHealth(task.lastCompletedAt, task.frequencyDays, vacation.isVacation, vacation.startDate);
  const at = vacation.isVacation && vacation.startDate ? new Date(vacation.startDate) : now;
  const due = nextDueAt(task, at)!.getTime();
  if (at.getTime() >= due) return 0;
  // Never done: count down from the scheduled day before, as if it had been done then
  const start = task.lastCompletedAt
    ? new Date(task.lastCompletedAt).getTime()
    : previousScheduledDay(mask, new Date(due)).getTime();
  const span = Math.max(1, due - start);
  return Math.max(0, Math.min(100, Math.round(((due - at.getTime()) / span) * 100)));
}

/**
 * A lastCompletedAt that gives a weekday-scheduled task the wanted health now (the health slider
 * and "reset to dirty"). Health only goes down as lastCompletedAt moves back, so a binary search
 * over the last 8 days finds it; 8 days back always has a scheduled day since, i.e. health 0.
 */
export function lastCompletedAtForHealth(task: ScheduledTask, targetHealth: number, now: Date = new Date()): string {
  const target = Math.max(0, Math.min(100, Math.round(Number(targetHealth))));
  if (target >= 100) return now.toISOString();
  let lo = now.getTime() - 8 * DAY_MS; // health 0
  let hi = now.getTime(); // health 100
  if (target <= 0) return new Date(lo).toISOString();
  const healthIf = (ts: number) => taskHealth({ ...task, lastCompletedAt: new Date(ts).toISOString() }, NO_VACATION, now);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (healthIf(mid) >= target) hi = mid; else lo = mid;
  }
  return new Date(hi).toISOString();
}

/** Calendar weeks (Monday to Sunday, local) since an arbitrary fixed Monday; consecutive across years. */
export function weekNumber(now: Date = new Date()): number {
  const dayIndex = Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
  return Math.floor((dayIndex + 3) / 7); // day 0 (1970-01-01) was a Thursday
}

/** Whose turn it is on a rotating task, given its assignees. */
export function rotationTurnFor(
  task: { assignmentMode?: string | null; rotationPeriod?: string | null; rotationCurrentUserId?: number | null },
  assigneeIds: number[],
  now: Date = new Date()
): number | null {
  if (task.assignmentMode === 'rotating' && task.rotationPeriod === 'week') {
    const ids = [...assigneeIds].sort((a, b) => a - b);
    return ids.length > 0 ? ids[weekNumber(now) % ids.length] : null;
  }
  return task.rotationCurrentUserId ?? null;
}

/** Same, looking the assignees up (completion route). */
export function rotationTurnUserId(task: { id: number; assignmentMode?: string | null; rotationPeriod?: string | null; rotationCurrentUserId?: number | null }, now: Date = new Date()): number | null {
  if (task.rotationPeriod !== 'week') return task.rotationCurrentUserId ?? null;
  const ids = (db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?').all(task.id) as { userId: number }[]).map((a) => a.userId);
  return rotationTurnFor(task, ids, now);
}

/**
 * Fields added to each task in the /rooms, /rooms/:id/tasks and /dashboard payloads (spread after
 * the raw row): nextDueAt, outOfSeason, seasonalFlag (the stored isSeasonal, for the edit form) and
 * whose turn it is now. isSeasonal itself is sent as isSeasonalNow() and health as taskHealth().
 */
export function scheduleFields(task: ScheduledTask & Parameters<typeof rotationTurnFor>[0], assigneeIds: number[], now: Date = new Date()) {
  const due = nextDueAt(task, now);
  return {
    nextDueAt: due ? due.toISOString() : null,
    outOfSeason: !isInSeason(task, now),
    seasonalFlag: !!task.isSeasonal,
    rotationCurrentUserId: rotationTurnFor(task, assigneeIds, now),
  };
}

type ScheduleColumn = 'seasonStartMonth' | 'seasonEndMonth' | 'scheduleWeekdays' | 'rotationPeriod' | 'reminderTime' | 'reminderDayBefore' | 'oneTime' | 'doBy'
  | 'timerMinutes';

/** Longest countdown a chore can have, in minutes */
export const MAX_TIMER_MINUTES = 240;
export type ScheduleInput = { error: string } | { values: Partial<Record<ScheduleColumn, number | string | null>> };

const blank = (v: unknown) => v === undefined || v === null || v === '';

/** Validate the schedule fields of a task create/update body (only the keys that are present). */
export function readScheduleInput(body: any): ScheduleInput {
  const values: Partial<Record<ScheduleColumn, number | string | null>> = {};
  if (body && ('seasonStartMonth' in body || 'seasonEndMonth' in body)) {
    const month = (v: unknown) => (blank(v) ? null : Number(v));
    const start = month(body.seasonStartMonth);
    const end = month(body.seasonEndMonth);
    const valid = (m: number | null) => m === null || (Number.isInteger(m) && m >= 1 && m <= 12);
    if (!valid(start) || !valid(end) || (start === null) !== (end === null)) return { error: 'invalid_season' };
    values.seasonStartMonth = start;
    values.seasonEndMonth = end;
  }
  if (body && 'scheduleWeekdays' in body) {
    const v = body.scheduleWeekdays;
    let mask: number | null = null;
    if (Array.isArray(v)) {
      if (!v.every((d) => Number.isInteger(Number(d)) && Number(d) >= 0 && Number(d) <= 6)) return { error: 'invalid_weekdays' };
      mask = v.reduce((m: number, d) => m | (1 << Number(d)), 0) || null;
    } else if (!blank(v) && Number(v) !== 0) {
      if (!Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > ALL_WEEKDAYS) return { error: 'invalid_weekdays' };
      mask = Number(v);
    }
    values.scheduleWeekdays = mask;
  }
  // A reminder at a set time ('HH:MM', empty = none) on the due day, or the day before
  if (body && 'reminderTime' in body) {
    const v = blank(body.reminderTime) ? null : String(body.reminderTime).trim();
    if (v !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return { error: 'invalid_reminder_time' };
    values.reminderTime = v;
  }
  if (body && 'reminderDayBefore' in body) values.reminderDayBefore = body.reminderDayBefore ? 1 : 0;
  // One-time chore and its optional do-by date ('YYYY-MM-DD')
  if (body && 'oneTime' in body) values.oneTime = body.oneTime ? 1 : 0;
  if (body && 'doBy' in body) {
    const v = blank(body.doBy) ? null : String(body.doBy).trim();
    if (v !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T12:00:00`).getTime()))) return { error: 'invalid_do_by' };
    values.doBy = v;
  }
  // Not scheduling, but saved the same way: the chore's countdown timer (empty or 0 = none)
  if (body && 'timerMinutes' in body) {
    const n = blank(body.timerMinutes) ? 0 : Number(body.timerMinutes);
    if (!Number.isInteger(n) || n < 0 || n > MAX_TIMER_MINUTES) return { error: 'invalid_timer' };
    values.timerMinutes = n > 0 ? n : null;
  }
  if (body && 'rotationPeriod' in body) {
    const p = blank(body.rotationPeriod) ? 'completion' : body.rotationPeriod;
    if (p !== 'completion' && p !== 'week') return { error: 'invalid_rotation_period' };
    values.rotationPeriod = p;
  }
  return { values };
}

/**
 * Store validated schedule fields. When a health was given and the task is on set weekdays, also
 * re-derive lastCompletedAt from it (the generic code assumed a rolling interval).
 */
export function saveScheduleInput(taskId: number, values: Partial<Record<ScheduleColumn, number | string | null>>, health?: unknown) {
  const cols = Object.keys(values) as ScheduleColumn[];
  if (cols.length > 0) {
    db.prepare(`UPDATE tasks SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => values[c]), taskId);
  }
  if (health !== undefined && health !== null && health !== '') {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    if (task && hasWeekdaySchedule(task)) {
      db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(lastCompletedAtForHealth(task, Number(health)), taskId);
    }
  }
}

/** Whole calendar days from today until `date` (0 when today or earlier). */
export function calendarDaysUntil(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.round((localDay(date).getTime() - localDay(now).getTime()) / DAY_MS));
}
