/**
 * The family's clock: which day, weekday and hour it is at home (Settings → General → Time zone,
 * sent with the dashboard as timeZone). Anything that decides which day it is (today's board, due
 * dates, streaks, weeks) goes through here, so a parent on a trip still sees home days. Times shown
 * on screen can stay in the device's zone. Months are 0–11 and weekdays 0 (Sunday) – 6, like Date.
 * The same math as the server's utils/clock.ts.
 */

const DAY_MS = 86_400_000;

let deviceZoneCache: string | null = null;
let homeZone: string | null = null;

/** This device's zone ("America/Los_Angeles"). */
export function deviceZone(): string {
  return (deviceZoneCache ??= Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
}

/** Set from the dashboard's timeZone. */
export function setFamilyZone(tz: string | null | undefined) {
  homeZone = tz && isTimeZone(tz) ? tz : null;
}

/** The family's zone (the device's until the dashboard has loaded). */
export function familyZone(): string {
  return homeZone ?? deviceZone();
}

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Every zone this browser knows, for the picker. */
export function allTimeZones(): string[] {
  const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  const out = new Set(list);
  out.add(deviceZone());
  if (homeZone) out.add(homeZone);
  return [...out].sort();
}

const formatters = new Map<string, Intl.DateTimeFormat>();
// Intl is slow, so each zone's offset is kept per UTC day, and per quarter hour only on a day the clocks
// change (they only change on a quarter hour)
const QUARTER_MS = 900_000;
const offsets = new Map<string, { days: Map<number, number | null>; quarters: Map<number, number> }>();

function lookUpOffset(s: number, tz: string): number {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    formatters.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(s)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - s;
}

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

/** "UTC+13" / "UTC−7" / "UTC+5:30" for a zone right now. */
export function offsetLabel(tz: string, now = new Date()): string {
  const m = Math.round(offsetAt(now.getTime(), tz) / 60000);
  const sign = m < 0 ? '−' : '+';
  const h = Math.floor(Math.abs(m) / 60), min = Math.abs(m) % 60;
  return `UTC${sign}${h}${min ? `:${String(min).padStart(2, '0')}` : ''}`;
}

export interface Wall { year: number; month: number; date: number; weekday: number; hours: number; minutes: number }

/** What the clock at home shows at a moment. */
export function wall(moment: Date | number | string = new Date(), tz = familyZone()): Wall {
  const d = moment instanceof Date ? moment : new Date(moment);
  if (tz === deviceZone()) return { year: d.getFullYear(), month: d.getMonth(), date: d.getDate(), weekday: d.getDay(), hours: d.getHours(), minutes: d.getMinutes() };
  const u = new Date(d.getTime() + offsetAt(d.getTime(), tz));
  return { year: u.getUTCFullYear(), month: u.getUTCMonth(), date: u.getUTCDate(), weekday: u.getUTCDay(), hours: u.getUTCHours(), minutes: u.getUTCMinutes() };
}

/** The moment the clock at home shows this time, like new Date(year, month, date, …) (fields may overflow). */
export function at(year: number, month: number, date = 1, hours = 0, minutes = 0, tz = familyZone()): Date {
  if (tz === deviceZone()) return new Date(year, month, date, hours, minutes);
  const w = Date.UTC(year, month, date, hours, minutes);
  const before = offsetAt(w - DAY_MS, tz);
  const after = offsetAt(w + DAY_MS, tz);
  if (before === after) return new Date(w - before);
  const early = w - before, late = w - after;
  const earlyOk = offsetAt(early, tz) === before, lateOk = offsetAt(late, tz) === after;
  if (earlyOk && lateOk) return new Date(Math.min(early, late));
  if (lateOk) return new Date(late);
  return new Date(early);
}

/** 'YYYY-MM-DD' of the family's day holding a moment. */
export function dateStr(moment: Date | number | string = new Date(), tz = familyZone()): string {
  const w = wall(moment, tz);
  return `${w.year}-${String(w.month + 1).padStart(2, '0')}-${String(w.date).padStart(2, '0')}`;
}

/** Midnight at home at the start of the moment's day, `plusDays` days later. */
export function startOfDay(moment: Date | number | string = new Date(), plusDays = 0, tz = familyZone()): Date {
  const w = wall(moment, tz);
  return at(w.year, w.month, w.date + plusDays, 0, 0, tz);
}

/** A datetime-local input's value ('YYYY-MM-DDTHH:MM') for a moment, on the clock at home. */
export function toHomeInput(moment: Date | number | string): string {
  const w = wall(moment);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${w.year}-${p(w.month + 1)}-${p(w.date)}T${p(w.hours)}:${p(w.minutes)}`;
}

/** The moment a datetime-local input's value means, on the clock at home; null if it isn't one. */
export function fromHomeInput(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  return m ? at(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

/** 23:59:59.999 at home on a 'YYYY-MM-DD' day, as an ISO string (the end of a goal's last day). */
export function endOfHomeDay(day: string): string {
  return new Date(at(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + 1).getTime() - 1).toISOString();
}

/**
 * The clock at home at a moment, as a Date on this device's clock: for formatting and calendar
 * math on server times (a day's bars, a period's name). Not the real moment unless the zones match.
 */
export function homeDate(moment: Date | number | string): Date {
  const w = wall(moment);
  return new Date(w.year, w.month, w.date, w.hours, w.minutes);
}
