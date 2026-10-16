import { localeFor } from './locale';

/**
 * The scheduling options of a task (server: utils/schedule.ts): due on set weekdays instead of a
 * rolling interval, a season (months, may wrap over the new year), and a weekly turn for rotating
 * tasks.
 */
export interface ScheduleValue {
  /** Every N days, on set weekdays, or one time (then it's archived) */
  mode: 'interval' | 'weekdays' | 'once';
  /** One time: optional do-by date 'YYYY-MM-DD' */
  doBy: string;
  /** Bitmask like Date.getDay(): bit 0 = Sunday … bit 6 = Saturday */
  weekdays: number;
  seasonOn: boolean;
  seasonStart: number;
  seasonEnd: number;
  rotationPeriod: 'completion' | 'week';
  /** A reminder at this time ('HH:MM', '' = none) on the due day, or the day before */
  reminderTime: string;
  reminderDayBefore: boolean;
}

export interface ScheduledTaskFields {
  scheduleWeekdays?: number | null;
  seasonStartMonth?: number | null;
  seasonEndMonth?: number | null;
  rotationPeriod?: 'completion' | 'week' | null;
  reminderTime?: string | null;
  reminderDayBefore?: number | boolean | null;
  oneTime?: number | boolean | null;
  doBy?: string | null;
}

export const EMPTY_SCHEDULE: ScheduleValue = { mode: 'interval', doBy: '', weekdays: 0, seasonOn: false, seasonStart: 4, seasonEnd: 10, rotationPeriod: 'completion', reminderTime: '', reminderDayBefore: false };

export function scheduleFromTask(task: ScheduledTaskFields): ScheduleValue {
  const weekdays = Number(task.scheduleWeekdays) || 0;
  const seasonOn = !!task.seasonStartMonth && !!task.seasonEndMonth;
  return {
    mode: task.oneTime ? 'once' : weekdays ? 'weekdays' : 'interval',
    doBy: task.doBy ?? '',
    weekdays,
    seasonOn,
    seasonStart: seasonOn ? Number(task.seasonStartMonth) : EMPTY_SCHEDULE.seasonStart,
    seasonEnd: seasonOn ? Number(task.seasonEndMonth) : EMPTY_SCHEDULE.seasonEnd,
    rotationPeriod: task.rotationPeriod === 'week' ? 'week' : 'completion',
    reminderTime: task.reminderTime ?? '',
    reminderDayBefore: !!task.reminderDayBefore,
  };
}

/** The fields to send with a task create/update. */
export function schedulePayload(v: ScheduleValue, opts: { onDemand: boolean; rotating: boolean }) {
  return {
    scheduleWeekdays: !opts.onDemand && v.mode === 'weekdays' && v.weekdays ? v.weekdays : null,
    oneTime: !opts.onDemand && v.mode === 'once',
    doBy: !opts.onDemand && v.mode === 'once' && v.doBy ? v.doBy : null,
    seasonStartMonth: v.seasonOn ? v.seasonStart : null,
    seasonEndMonth: v.seasonOn ? v.seasonEnd : null,
    rotationPeriod: opts.rotating ? v.rotationPeriod : 'completion',
    reminderTime: !opts.onDemand && v.reminderTime ? v.reminderTime : null,
    reminderDayBefore: v.reminderDayBefore,
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
