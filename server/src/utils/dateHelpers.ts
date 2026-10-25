import { dateStr } from './clock';

/** Returns YYYY-MM-DD of the family's day (Settings → Time zone, else the server's TZ) */
export function localDateStr(d: Date = new Date()): string {
  return dateStr(d);
}
