import db from '../database';
import { readSteps } from './focus';
import { calculateHealth } from './health';
import { weekStartDay } from './periods';
import { at, dayAt, startOfDay, wall } from './clock';

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
 * - Monthly (scheduleMonthDay 1–31, or scheduleMonthWeek 1–4 / -1 = last + scheduleMonthWeekday):
 *   the same as set weekdays, with one scheduled day a month. Days 29–31 fall on the last day of
 *   shorter months. Set weekdays and monthly are "fixed" schedules; the rest is a rolling interval.
 * - Starts on (startsOn, any repeating chore): until it's done on or after that day, nothing is due
 *   before it (health 100), and it's first due on it (fixed schedules: the first scheduled day from
 *   it). Before it was set, a new chore's first due day came only from the health slider.
 * - Season (seasonStartMonth..seasonEndMonth, 1–12, may wrap over the new year, e.g. 11..2):
 *   outside it the task behaves exactly like isSeasonal (no due lists, no house health).
 * - Weekly rotation (rotationPeriod 'week'): whose turn is the assignees ordered by userId at
 *   index weekNumber % n, counting calendar weeks that start on the family's first day (Monday or
 *   Sunday; switching only moves Sunday into the next week's turn). Nothing is stored.
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
  scheduleMonthDay?: number | null;
  scheduleMonthWeek?: number | null;
  scheduleMonthWeekday?: number | null;
  /** Repeating chore's start date, 'YYYY-MM-DD' (local) */
  startsOn?: string | null;
}

interface Vacation { isVacation: boolean; startDate: string | null }
const NO_VACATION: Vacation = { isVacation: false, startDate: null };

export function weekdayMask(task: { scheduleWeekdays?: number | null }): number {
  return (Number(task.scheduleWeekdays) || 0) & ALL_WEEKDAYS;
}

export function hasWeekdaySchedule(task: { scheduleWeekdays?: number | null }): boolean {
  return weekdayMask(task) > 0;
}

type MonthlyRule = { day: number } | { week: number; weekday: number };
type FixedRule = { mask: number } | MonthlyRule;
type MonthlyFields = Pick<ScheduledTask, 'scheduleMonthDay' | 'scheduleMonthWeek' | 'scheduleMonthWeekday'>;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A monthly chore's rule: a day of the month, or the nth (-1 = last) weekday. */
export function monthlyRule(task: MonthlyFields): MonthlyRule | null {
  const day = Number(task.scheduleMonthDay);
  if (task.scheduleMonthDay != null && Number.isInteger(day) && day >= 1 && day <= 31) return { day };
  const week = Number(task.scheduleMonthWeek);
  const weekday = Number(task.scheduleMonthWeekday);
  if (task.scheduleMonthWeekday == null || ![1, 2, 3, 4, -1].includes(week) || !(Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)) return null;
  return { week, weekday };
}

/** Monthly rule first (the editor never sends both), then set weekdays. */
function fixedRule(task: ScheduledTask): FixedRule | null {
  const mask = weekdayMask(task);
  return monthlyRule(task) ?? (mask ? { mask } : null);
}

/** Due on calendar days (set weekdays or monthly) instead of a rolling interval. */
export function hasFixedSchedule(task: ScheduledTask): boolean {
  return fixedRule(task) !== null;
}

/** Midnight (the family's) of a repeating chore's start date, or null. */
function startDay(task: ScheduledTask): Date | null {
  return !task.oneTime && task.startsOn && ISO_DAY.test(task.startsOn) ? dayAt(task.startsOn) : null;
}

/** Hasn't been done on or after its start date (or never done). */
function notDoneSinceStart(task: ScheduledTask): boolean {
  const start = startDay(task);
  return !task.lastCompletedAt || (start !== null && new Date(task.lastCompletedAt).getTime() < start.getTime());
}

/** Before its start date: nothing is due yet. */
export function beforeStart(task: ScheduledTask, now: Date = new Date()): boolean {
  const start = startDay(task);
  return start !== null && now.getTime() < start.getTime();
}

/** Inside its season (or no season set). */
export function isInSeason(task: ScheduledTask, now: Date = new Date()): boolean {
  const start = Number(task.seasonStartMonth);
  const end = Number(task.seasonEndMonth);
  if (!(start >= 1 && start <= 12 && end >= 1 && end <= 12)) return true;
  const month = wall(now).month + 1;
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}

/** Treated as seasonal right now: the isSeasonal flag, or outside its season. */
export function isSeasonalNow(task: ScheduledTask, now: Date = new Date()): boolean {
  return !!task.isSeasonal || !isInSeason(task, now);
}

/** Midnight (the family's) of the day `days` after d's day. Built from the calendar, so DST can't shift it. */
function localDay(d: Date, days = 0): Date {
  return startOfDay(d, days);
}

/** The monthly rule's day in a month (month may be out of 0–11; Date.UTC rolls it over). */
function monthlyDayIn(rule: MonthlyRule, year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if ('day' in rule) return at(y, m, Math.min(rule.day, daysIn));
  if (rule.week > 0) return at(y, m, 1 + ((rule.weekday - first.getUTCDay() + 7) % 7) + (rule.week - 1) * 7);
  return at(y, m, daysIn - ((new Date(Date.UTC(y, m, daysIn)).getUTCDay() - rule.weekday + 7) % 7));
}

/** First scheduled day on or after (inclusive) / strictly after `from`'s day. */
function nextScheduledDay(rule: FixedRule, from: Date, inclusive: boolean): Date {
  const first = localDay(from, inclusive ? 0 : 1);
  if ('mask' in rule) {
    for (let i = 0; i < 7; i++) {
      const day = localDay(first, i);
      if (rule.mask & (1 << wall(day).weekday)) return day;
    }
    return localDay(first, 7); // unreachable with a non-empty mask
  }
  const w = wall(first);
  for (let i = 0; ; i++) {
    const day = monthlyDayIn(rule, w.year, w.month + i);
    if (day.getTime() >= first.getTime()) return day;
  }
}

/** Last scheduled day strictly before `before`'s day. */
function previousScheduledDay(rule: FixedRule, before: Date): Date {
  if ('mask' in rule) {
    for (let i = 1; i <= 7; i++) {
      const day = localDay(before, -i);
      if (rule.mask & (1 << wall(day).weekday)) return day;
    }
    return localDay(before, -7);
  }
  const limit = localDay(before);
  const w = wall(limit);
  for (let i = 0; ; i++) {
    const day = monthlyDayIn(rule, w.year, w.month - i);
    if (day.getTime() < limit.getTime()) return day;
  }
}

/** SQLite datetime('now') ("2026-10-16 07:12:00", UTC) or an ISO string, as a Date */
export const parseStored = (v: string) => new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`);

/**
 * A one-time chore is due from its do-by day (or from when it was added) and overdue once that day
 * ends (without a date: a week after it was added).
 */
export function oneTimeDeadline(task: ScheduledTask, now: Date = new Date()): Date {
  if (task.doBy && /^\d{4}-\d{2}-\d{2}$/.test(task.doBy)) return dayAt(task.doBy, 23, 59, 59, 999);
  const added = task.createdAt ? parseStored(task.createdAt) : now;
  return new Date(added.getTime() + 7 * DAY_MS);
}

/** Counts toward room and house health (not out of season, not a one-time chore). Before its start date a chore counts as clean. */
export function countsForHealth(task: ScheduledTask, now: Date = new Date()): boolean {
  return !task.oneTime && !isSeasonalNow(task, now);
}

/** When the task is next due; null for a rolling task that was never done (due now). */
export function nextDueAt(task: ScheduledTask, now: Date = new Date()): Date | null {
  if (task.oneTime) {
    if (task.doBy && /^\d{4}-\d{2}-\d{2}$/.test(task.doBy)) return dayAt(task.doBy);
    return task.createdAt ? parseStored(task.createdAt) : null;
  }
  const rule = fixedRule(task);
  const start = startDay(task);
  const fresh = notDoneSinceStart(task);
  if (rule) {
    return !fresh
      ? nextScheduledDay(rule, new Date(task.lastCompletedAt!), false)
      : nextScheduledDay(rule, start ?? now, true);
  }
  if (start && fresh) return start;
  if (!task.lastCompletedAt) return null;
  const safeFreq = Math.max(1 / 24, Number(task.frequencyDays) || 7);
  return new Date(new Date(task.lastCompletedAt).getTime() + safeFreq * DAY_MS);
}

/** Health 0–100 for either kind of schedule (frozen at the vacation start, like calculateHealth). */
export function taskHealth(task: ScheduledTask, vacation: Vacation = NO_VACATION, now: Date = new Date()): number {
  if (task.oneTime) return now.getTime() > oneTimeDeadline(task, now).getTime() ? 0 : 100;
  const at = vacation.isVacation && vacation.startDate ? new Date(vacation.startDate) : now;
  if (beforeStart(task, at)) return 100;
  const rule = fixedRule(task);
  const fresh = notDoneSinceStart(task);
  if (!rule) {
    // Not done since its start date (which has come): due since then
    if (startDay(task) && fresh) return 0;
    return calculateHealth(task.lastCompletedAt, task.frequencyDays, vacation.isVacation, vacation.startDate);
  }
  const due = nextDueAt(task, at)!.getTime();
  if (at.getTime() >= due) return 0;
  // Not done (since its start date): count down from the scheduled day before (or the start date),
  // as if it had been done then
  const from = !fresh
    ? new Date(task.lastCompletedAt!).getTime()
    : Math.max(previousScheduledDay(rule, new Date(due)).getTime(), startDay(task)?.getTime() ?? -Infinity);
  const span = Math.max(1, due - from);
  return Math.max(0, Math.min(100, Math.round(((due - at.getTime()) / span) * 100)));
}

/**
 * A lastCompletedAt that gives a task on a fixed schedule the wanted health now (the health slider
 * and "reset to dirty"). Health only goes down as lastCompletedAt moves back, so a binary search
 * over the last 8 days (monthly: 70) finds it; that far back always has a scheduled day since, i.e. health 0.
 */
export function lastCompletedAtForHealth(task: ScheduledTask, targetHealth: number, now: Date = new Date()): string {
  const target = Math.max(0, Math.min(100, Math.round(Number(targetHealth))));
  if (target >= 100) return now.toISOString();
  let lo = now.getTime() - (monthlyRule(task) ? 70 : 8) * DAY_MS; // health 0
  let hi = now.getTime(); // health 100
  if (target <= 0) return new Date(lo).toISOString();
  const healthIf = (ts: number) => taskHealth({ ...task, lastCompletedAt: new Date(ts).toISOString() }, NO_VACATION, now);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (healthIf(mid) >= target) hi = mid; else lo = mid;
  }
  return new Date(hi).toISOString();
}

/** Calendar weeks (the family's, starting on `first` like Date.getDay()) since a fixed one; consecutive across years. */
export function weekNumber(now: Date = new Date(), first: number = weekStartDay()): number {
  const w = wall(now);
  const dayIndex = Math.round(Date.UTC(w.year, w.month, w.date) / DAY_MS);
  // Day 0 (1970-01-01) was a Thursday; Monday-first weeks start counting on day 4, Sunday-first on day 3
  return Math.floor((dayIndex + 3 + (first === 0 ? 1 : 0)) / 7);
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
  | 'scheduleMonthDay' | 'scheduleMonthWeek' | 'scheduleMonthWeekday' | 'startsOn' | 'timerMinutes' | 'steps';

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
  // Monthly: a day of the month (1–31), or the nth weekday (week 1–4 or -1 = last, weekday 0–6). Sent
  // together; blank values clear it.
  if (body && ('scheduleMonthDay' in body || 'scheduleMonthWeek' in body || 'scheduleMonthWeekday' in body)) {
    const num = (v: unknown) => (blank(v) || Number(v) === 0 ? null : Number(v));
    const day = num(body.scheduleMonthDay);
    const week = num(body.scheduleMonthWeek);
    const weekday = blank(body.scheduleMonthWeekday) ? null : Number(body.scheduleMonthWeekday);
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return { error: 'invalid_month_day' };
    if (week !== null && ![1, 2, 3, 4, -1].includes(week)) return { error: 'invalid_month_day' };
    if (weekday !== null && !(Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)) return { error: 'invalid_month_day' };
    if ((week === null) !== (weekday === null) || (day !== null && week !== null)) return { error: 'invalid_month_day' };
    values.scheduleMonthDay = day;
    values.scheduleMonthWeek = week;
    values.scheduleMonthWeekday = weekday;
  }
  // A repeating chore's start date ('YYYY-MM-DD', empty = none)
  if (body && 'startsOn' in body) {
    const v = blank(body.startsOn) ? null : String(body.startsOn).trim();
    if (v !== null && (!ISO_DAY.test(v) || Number.isNaN(new Date(`${v}T12:00:00`).getTime()))) return { error: 'invalid_starts_on' };
    values.startsOn = v;
  }
  // Not scheduling, but saved the same way: the chore's countdown timer (empty or 0 = none)
  if (body && 'timerMinutes' in body) {
    const n = blank(body.timerMinutes) ? 0 : Number(body.timerMinutes);
    if (!Number.isInteger(n) || n < 0 || n > MAX_TIMER_MINUTES) return { error: 'invalid_timer' };
    values.timerMinutes = n > 0 ? n : null;
  }
  // The chore's steps (one thing at a time): an array or one per line
  if (body && 'steps' in body) {
    const steps = readSteps(body.steps);
    if ('error' in steps) return steps;
    values.steps = steps.value;
  }
  if (body && 'rotationPeriod' in body) {
    const p = blank(body.rotationPeriod) ? 'completion' : body.rotationPeriod;
    if (p !== 'completion' && p !== 'week') return { error: 'invalid_rotation_period' };
    values.rotationPeriod = p;
  }
  return { values };
}

/**
 * Store validated schedule fields. When a health was given and the task is on a fixed schedule, also
 * re-derive lastCompletedAt from it (the generic code assumed a rolling interval).
 */
export function saveScheduleInput(taskId: number, values: Partial<Record<ScheduleColumn, number | string | null>>, health?: unknown) {
  const cols = Object.keys(values) as ScheduleColumn[];
  if (cols.length > 0) {
    db.prepare(`UPDATE tasks SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => values[c]), taskId);
  }
  if (health !== undefined && health !== null && health !== '') {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    if (task && hasFixedSchedule(task)) {
      db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(lastCompletedAtForHealth(task, Number(health)), taskId);
    }
  }
}

/** Whole calendar days from today until `date` (0 when today or earlier). */
export function calendarDaysUntil(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.round((localDay(date).getTime() - localDay(now).getTime()) / DAY_MS));
}
