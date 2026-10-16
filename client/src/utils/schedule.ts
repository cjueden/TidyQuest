import { localeFor } from './locale';

/**
 * The scheduling options of a task (server: utils/schedule.ts): due on set weekdays instead of a
 * rolling interval, a season (months, may wrap over the new year), and a weekly turn for rotating
 * tasks.
 */
export interface ScheduleValue {
  mode: 'interval' | 'weekdays';
  /** Bitmask like Date.getDay(): bit 0 = Sunday … bit 6 = Saturday */
  weekdays: number;
  seasonOn: boolean;
  seasonStart: number;
  seasonEnd: number;
  rotationPeriod: 'completion' | 'week';
}

export interface ScheduledTaskFields {
  scheduleWeekdays?: number | null;
  seasonStartMonth?: number | null;
  seasonEndMonth?: number | null;
  rotationPeriod?: 'completion' | 'week' | null;
}

export const EMPTY_SCHEDULE: ScheduleValue = { mode: 'interval', weekdays: 0, seasonOn: false, seasonStart: 4, seasonEnd: 10, rotationPeriod: 'completion' };

export function scheduleFromTask(task: ScheduledTaskFields): ScheduleValue {
  const weekdays = Number(task.scheduleWeekdays) || 0;
  const seasonOn = !!task.seasonStartMonth && !!task.seasonEndMonth;
  return {
    mode: weekdays ? 'weekdays' : 'interval',
    weekdays,
    seasonOn,
    seasonStart: seasonOn ? Number(task.seasonStartMonth) : EMPTY_SCHEDULE.seasonStart,
    seasonEnd: seasonOn ? Number(task.seasonEndMonth) : EMPTY_SCHEDULE.seasonEnd,
    rotationPeriod: task.rotationPeriod === 'week' ? 'week' : 'completion',
  };
}

/** The fields to send with a task create/update. */
export function schedulePayload(v: ScheduleValue, opts: { onDemand: boolean; rotating: boolean }) {
  return {
    scheduleWeekdays: !opts.onDemand && v.mode === 'weekdays' && v.weekdays ? v.weekdays : null,
    seasonStartMonth: v.seasonOn ? v.seasonStart : null,
    seasonEndMonth: v.seasonOn ? v.seasonEnd : null,
    rotationPeriod: opts.rotating ? v.rotationPeriod : 'completion',
  };
}

/** Weekdays in display order (Monday first), as getDay() numbers. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function weekdayName(day: number, language?: string, width: 'short' | 'narrow' = 'short'): string {
  // 2023-01-01 was a Sunday
  return new Date(2023, 0, 1 + day).toLocaleDateString(localeFor(language), { weekday: width });
}

export function monthName(month: number, language?: string): string {
  return new Date(2023, month - 1, 1).toLocaleDateString(localeFor(language), { month: 'short' });
}

/** "Mon, Thu" for a weekday mask. */
export function weekdaysLabel(mask: number, language?: string): string {
  return WEEK_ORDER.filter((d) => mask & (1 << d)).map((d) => weekdayName(d, language)).join(', ');
}

/** "Apr–Oct" for a season. */
export function seasonLabel(start: number, end: number, language?: string): string {
  return `${monthName(start, language)}–${monthName(end, language)}`;
}
