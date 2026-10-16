/** Local-time calendar helpers (respect the TZ env var, like localDateStr). Weeks start on Monday. */

export function startOfLocalDay(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfLocalWeek(now: Date = new Date()): Date {
  const d = startOfLocalDay(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Shift a moment by whole calendar days, keeping its local wall-clock time across DST changes. */
export function addLocalDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** This week's window: Monday 00:00 to Sunday 23:59:59.999, local time. */
export function currentLocalWeek(now: Date = new Date()): { startAt: string; endAt: string } {
  const start = startOfLocalWeek(now);
  const nextStart = new Date(start);
  nextStart.setDate(nextStart.getDate() + 7);
  return { startAt: start.toISOString(), endAt: new Date(nextStart.getTime() - 1).toISOString() };
}
