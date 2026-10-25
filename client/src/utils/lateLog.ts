import { localeFor } from './locale';
import { dateStr, startOfDay } from './clock';

/** "Done earlier…" (ENH-7): how many days back a chore can be logged late (the server checks the same) */
export const LATE_DAYS = 7;

/** The days a chore can be logged for, yesterday first ('YYYY-MM-DD', the family's). */
export function lateDays(now: Date = new Date()): string[] {
  return Array.from({ length: LATE_DAYS }, (_, i) => dateStr(startOfDay(now, -(i + 1))));
}

/** "Sat, Oct 17" for a 'YYYY-MM-DD' day or a stored timestamp. */
export function lateDayLabel(day: string, language?: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00`) : new Date(day);
  return d.toLocaleDateString(localeFor(language), { weekday: 'short', month: 'short', day: 'numeric' });
}
