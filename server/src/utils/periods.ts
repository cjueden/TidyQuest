import db from '../database';
import { addDays, at, familyZone, startOfDay, wall, zoneSql } from './clock';

/**
 * Calendar helpers in the family's time zone (utils/clock). Weeks start on the
 * family's chosen day (Settings → General → Week starts on): Monday unless app_settings
 * 'weekStart' says '0' (Sunday). Every "this week" on the server goes through these.
 */

/** The first day of the week, like Date.getDay(): 1 = Monday (the default), 0 = Sunday. */
export function weekStartDay(): number {
  const v = (db.prepare("SELECT value FROM app_settings WHERE key = 'weekStart'").get() as { value: string } | undefined)?.value;
  return v === '0' ? 0 : 1;
}

/** SQL for the first day ('YYYY-MM-DD', the family's) of the week holding a UTC timestamp column. */
export function weekOfSql(column: string, first: number = weekStartDay(), tz: string = familyZone()): string {
  return `tz_week(${column}, ${zoneSql(tz)}, ${first === 0 ? 0 : 1})`;
}

export function startOfLocalDay(now: Date = new Date(), tz: string = familyZone()): Date {
  return startOfDay(now, 0, tz);
}

export function startOfLocalWeek(now: Date = new Date(), first: number = weekStartDay(), tz: string = familyZone()): Date {
  const w = wall(now, tz);
  return at(w.year, w.month, w.date - ((w.weekday - first + 7) % 7), 0, 0, 0, 0, tz);
}

/** Shift a moment by whole calendar days, keeping its wall-clock time at home across DST changes. */
export function addLocalDays(iso: string, days: number, tz: string = familyZone()): string {
  return addDays(iso, days, tz).toISOString();
}

/** This week's window: its first day 00:00 to its last day 23:59:59.999, the family's time. */
export function currentLocalWeek(now: Date = new Date(), first: number = weekStartDay(), tz: string = familyZone()): { startAt: string; endAt: string } {
  const start = startOfLocalWeek(now, first, tz);
  const nextStart = startOfDay(start, 7, tz);
  return { startAt: start.toISOString(), endAt: new Date(nextStart.getTime() - 1).toISOString() };
}
