import type Database from 'better-sqlite3';
import { currentDatabase } from '../database';

/**
 * The family's clock: which day, weekday and hour it is at home. Every "today", "this week" and
 * "what time is it" on the server goes through here (or the helpers in dateHelpers and periods that
 * use it), in the family's time zone: Settings → General → Time zone, app_settings 'timeZone'. Until
 * a parent picks one, the server's own zone (the TZ environment setting) is used, exactly as before.
 * Moments are stored as exact UTC times, so a new zone only moves when days start from then on.
 *
 * Months are 0–11 and weekdays 0 (Sunday) – 6, like Date's getMonth() and getDay().
 */

const DAY_MS = 86_400_000;

let serverZoneCache: string | null = null;

/** The zone the server runs in (the TZ environment setting, else the machine's). */
export function serverZone(): string {
  return (serverZoneCache ??= new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
}

const canonical = new Map<string, string | null>();

/** The zone's standard name ("America/Los_Angeles") when Intl knows it, else null. */
export function canonicalZone(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(v)) return null;
  let name = canonical.get(v);
  if (name === undefined) {
    try {
      const n = new Intl.DateTimeFormat('en-US', { timeZone: v }).resolvedOptions().timeZone;
      name = /^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(n) ? n : null;
    } catch {
      name = null;
    }
    if (canonical.size < 1000) canonical.set(v, name);
  }
  return name;
}

// Read on nearly every date calculation, so each database keeps its prepared statement
const zoneReads = new WeakMap<object, Database.Statement>();

/** The zone a parent picked in Settings, or null while the server's is in use. */
export function savedZone(): string | null {
  const instance = currentDatabase();
  if (!instance) return null; // no database yet (unit tests of the calendar math): the server's zone
  let read = zoneReads.get(instance);
  if (!read) {
    read = instance.prepare("SELECT value FROM app_settings WHERE key = 'timeZone'");
    zoneReads.set(instance, read);
  }
  return canonicalZone((read.get() as { value: string } | undefined)?.value);
}

/** The family's time zone. */
export function familyZone(): string {
  return savedZone() ?? serverZone();
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

// Intl is slow (tens of µs a call), so each zone's offset is kept per UTC day: two lookups tell whether
// the clocks changed that day, and only on such a day is it looked up per quarter hour (clocks only
// change on a quarter hour, UTC)
const QUARTER_MS = 900_000;
const offsets = new Map<string, { days: Map<number, number | null>; quarters: Map<number, number> }>();

function lookUpOffset(s: number, tz: string): number {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(s)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - s;
}

/** How far the zone's wall clock is ahead of UTC at a moment, in ms. */
function offsetAt(t: number, tz: string): number {
  let known = offsets.get(tz);
  if (!known || known.days.size > 20_000 || known.quarters.size > 20_000) offsets.set(tz, (known = { days: new Map(), quarters: new Map() }));
  const day = Math.floor(t / DAY_MS);
  let whole = known.days.get(day);
  if (whole === undefined) {
    const first = lookUpOffset(day * DAY_MS, tz);
    whole = first === lookUpOffset((day + 1) * DAY_MS - QUARTER_MS, tz) ? first : null;
    known.days.set(day, whole);
  }
  if (whole !== null) return whole;
  const quarter = Math.floor(t / QUARTER_MS);
  let off = known.quarters.get(quarter);
  if (off === undefined) known.quarters.set(quarter, (off = lookUpOffset(quarter * QUARTER_MS, tz)));
  return off;
}

export interface Wall {
  year: number;
  /** 0–11, like getMonth() */
  month: number;
  /** Day of the month, like getDate() */
  date: number;
  /** 0 = Sunday … 6 = Saturday, like getDay() */
  weekday: number;
  hours: number;
  minutes: number;
  seconds: number;
  ms: number;
}

/** What the clock on the wall at home shows at a moment. */
export function wall(moment: Date | number | string = new Date(), tz: string = familyZone()): Wall {
  const d = moment instanceof Date ? moment : new Date(moment);
  if (tz === serverZone()) {
    return { year: d.getFullYear(), month: d.getMonth(), date: d.getDate(), weekday: d.getDay(), hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds(), ms: d.getMilliseconds() };
  }
  const u = new Date(d.getTime() + offsetAt(d.getTime(), tz));
  return { year: u.getUTCFullYear(), month: u.getUTCMonth(), date: u.getUTCDate(), weekday: u.getUTCDay(), hours: u.getUTCHours(), minutes: u.getUTCMinutes(), seconds: u.getUTCSeconds(), ms: u.getUTCMilliseconds() };
}

/**
 * The moment the wall clock at home shows this time, like new Date(year, month, date, …): fields
 * may overflow (month 12 is next January, date 0 the previous month's last day). A time skipped by
 * a clock change lands just after it, and a time that happens twice is the first one, like Date.
 */
export function at(year: number, month: number, date = 1, hours = 0, minutes = 0, seconds = 0, ms = 0, tz: string = familyZone()): Date {
  if (tz === serverZone()) return new Date(year, month, date, hours, minutes, seconds, ms);
  const w = Date.UTC(year, month, date, hours, minutes, seconds, ms);
  const before = offsetAt(w - DAY_MS, tz);
  const after = offsetAt(w + DAY_MS, tz);
  if (before === after) return new Date(w - before);
  const early = w - before, late = w - after;
  const earlyOk = offsetAt(early, tz) === before, lateOk = offsetAt(late, tz) === after;
  if (earlyOk && lateOk) return new Date(Math.min(early, late));
  if (lateOk) return new Date(late);
  return new Date(early); // inside a gap: the old offset puts it just past the change
}

/** 'YYYY-MM-DD' of the family's day holding a moment. */
export function dateStr(moment: Date | number | string = new Date(), tz: string = familyZone()): string {
  const w = wall(moment, tz);
  return `${w.year}-${String(w.month + 1).padStart(2, '0')}-${String(w.date).padStart(2, '0')}`;
}

/** A 'YYYY-MM-DD' day at a wall-clock time (midnight unless given). */
export function dayAt(day: string, hours = 0, minutes = 0, seconds = 0, ms = 0, tz: string = familyZone()): Date {
  return at(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hours, minutes, seconds, ms, tz);
}

/** Midnight at the start of the moment's day, `plusDays` days later (DST can't shift it). */
export function startOfDay(moment: Date | number | string = new Date(), plusDays = 0, tz: string = familyZone()): Date {
  const w = wall(moment, tz);
  return at(w.year, w.month, w.date + plusDays, 0, 0, 0, 0, tz);
}

/** 23:59:59.999 on the moment's day, `plusDays` days later. */
export function endOfDay(moment: Date | number | string = new Date(), plusDays = 0, tz: string = familyZone()): Date {
  const w = wall(moment, tz);
  return at(w.year, w.month, w.date + plusDays, 23, 59, 59, 999, tz);
}

/** The same wall-clock time whole calendar days later (or earlier), across DST changes. */
export function addDays(moment: Date | number | string, days: number, tz: string = familyZone()): Date {
  const w = wall(moment, tz);
  return at(w.year, w.month, w.date + days, w.hours, w.minutes, w.seconds, w.ms, tz);
}

/** Minutes since midnight on the wall clock (0–1439). */
export function minuteOfDay(moment: Date | number | string = new Date(), tz: string = familyZone()): number {
  const w = wall(moment, tz);
  return w.hours * 60 + w.minutes;
}

/** A stored timestamp read the way SQLite does: without a zone it is UTC; a bare day is UTC midnight. */
function sqlMoment(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const s = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : /(Z|[+-]\d{2}:?\d{2})$/i.test(v) ? v.replace(' ', 'T') : `${v.replace(' ', 'T')}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * SQL functions in place of SQLite's own 'localtime', which only knows the server's zone:
 * tz_date(ts, zone) the day 'YYYY-MM-DD', tz_hour(ts, zone) the hour 0–23, and tz_week(ts, zone,
 * first) the first day of its week. Registered on every database the app opens.
 */
export function registerClockFunctions(instance: InstanceType<typeof Database>): void {
  const zoneOf = (z: unknown) => canonicalZone(z) ?? serverZone();
  instance.function('tz_date', { deterministic: true }, (ts: unknown, z: unknown) => {
    const d = sqlMoment(ts);
    return d ? dateStr(d, zoneOf(z)) : null;
  });
  instance.function('tz_hour', { deterministic: true }, (ts: unknown, z: unknown) => {
    const d = sqlMoment(ts);
    return d ? wall(d, zoneOf(z)).hours : null;
  });
  instance.function('tz_week', { deterministic: true }, (ts: unknown, z: unknown, first: unknown) => {
    const d = sqlMoment(ts);
    if (!d) return null;
    const tz = zoneOf(z);
    const w = wall(d, tz);
    const back = (w.weekday - Number(first) + 7) % 7;
    const start = new Date(Date.UTC(w.year, w.month, w.date - back));
    return start.toISOString().slice(0, 10);
  });
}

/** The zone as a quoted SQL literal (canonicalZone only lets letters, digits and _+-/ through). */
export function zoneSql(tz: string = familyZone()): string {
  return `'${canonicalZone(tz) ?? serverZone()}'`;
}

/** SQL for the family's day ('YYYY-MM-DD') of a UTC timestamp column or ? parameter. */
export function daySql(column: string, tz: string = familyZone()): string {
  return `tz_date(${column}, ${zoneSql(tz)})`;
}

/** SQL for the family's hour (0–23) of a UTC timestamp column. */
export function hourSql(column: string, tz: string = familyZone()): string {
  return `tz_hour(${column}, ${zoneSql(tz)})`;
}
