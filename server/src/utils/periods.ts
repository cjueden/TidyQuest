import db from '../database';

/**
 * Local-time calendar helpers (respect the TZ env var, like localDateStr). Weeks start on the
 * family's chosen day (Settings → General → Week starts on): Monday unless app_settings
 * 'weekStart' says '0' (Sunday). Every "this week" on the server goes through these.
 */

/** The first day of the week, like Date.getDay(): 1 = Monday (the default), 0 = Sunday. */
export function weekStartDay(): number {
  const v = (db.prepare("SELECT value FROM app_settings WHERE key = 'weekStart'").get() as { value: string } | undefined)?.value;
  return v === '0' ? 0 : 1;
}

/** SQL for the first day ('YYYY-MM-DD', local) of the week holding a UTC timestamp column. */
export function weekOfSql(column: string, first: number = weekStartDay()): string {
  return `date(${column}, 'localtime', 'weekday ${(first + 6) % 7}', '-6 days')`;
}

export function startOfLocalDay(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfLocalWeek(now: Date = new Date(), first: number = weekStartDay()): Date {
  const d = startOfLocalDay(now);
  d.setDate(d.getDate() - ((d.getDay() - first + 7) % 7));
  return d;
}

/** Shift a moment by whole calendar days, keeping its local wall-clock time across DST changes. */
export function addLocalDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** This week's window: its first day 00:00 to its last day 23:59:59.999, local time. */
export function currentLocalWeek(now: Date = new Date(), first: number = weekStartDay()): { startAt: string; endAt: string } {
  const start = startOfLocalWeek(now, first);
  const nextStart = new Date(start);
  nextStart.setDate(nextStart.getDate() + 7);
  return { startAt: start.toISOString(), endAt: new Date(nextStart.getTime() - 1).toISOString() };
}
