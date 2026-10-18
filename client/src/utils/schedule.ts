import { localeFor } from './locale';
import { choreSteps } from './focus';

/**
 * The scheduling options of a task (server: utils/schedule.ts): due on set weekdays instead of a
 * rolling interval, a season (months, may wrap over the new year), and a weekly turn for rotating
 * tasks.
 */
export interface ScheduleValue {
  /** Every N days, on set weekdays, monthly, or one time (then it's archived) */
  mode: 'interval' | 'weekdays' | 'monthly' | 'once';
  /** One time: optional do-by date 'YYYY-MM-DD' */
  doBy: string;
  /** Bitmask like Date.getDay(): bit 0 = Sunday … bit 6 = Saturday */
  weekdays: number;
  /** Monthly: 0 = on a day of the month (monthDay 1–31), else the nth (1–4, -1 = last) monthWeekday */
  monthWeek: number;
  monthDay: number;
  monthWeekday: number;
  /** Repeating chore: nothing is due before this date ('YYYY-MM-DD', '' = none) */
  startsOn: string;
  seasonOn: boolean;
  seasonStart: number;
  seasonEnd: number;
  rotationPeriod: 'completion' | 'week';
  /** A reminder at this time ('HH:MM', '' = none) on the due day, or the day before */
  reminderTime: string;
  reminderDayBefore: boolean;
  /** Not scheduling, but saved with it: the chore's countdown timer in minutes ('' = none) */
  timerMinutes: string;
  /** One thing at a time: the chore's steps, one per line */
  steps: string;
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
  scheduleMonthDay?: number | null;
  scheduleMonthWeek?: number | null;
  scheduleMonthWeekday?: number | null;
  startsOn?: string | null;
  timerMinutes?: number | null;
  /** JSON array of strings */
  steps?: string | null;
}

export const EMPTY_SCHEDULE: ScheduleValue = { mode: 'interval', doBy: '', weekdays: 0, monthWeek: 0, monthDay: 1, monthWeekday: 6, startsOn: '', seasonOn: false, seasonStart: 4, seasonEnd: 10, rotationPeriod: 'completion', reminderTime: '', reminderDayBefore: false, timerMinutes: '', steps: '' };

export function scheduleFromTask(task: ScheduledTaskFields): ScheduleValue {
  const weekdays = Number(task.scheduleWeekdays) || 0;
  const seasonOn = !!task.seasonStartMonth && !!task.seasonEndMonth;
  const monthWeek = task.scheduleMonthWeek != null && task.scheduleMonthWeekday != null ? Number(task.scheduleMonthWeek) : 0;
  const monthly = !!task.scheduleMonthDay || monthWeek !== 0;
  return {
    mode: task.oneTime ? 'once' : monthly ? 'monthly' : weekdays ? 'weekdays' : 'interval',
    doBy: task.doBy ?? '',
    weekdays,
    monthWeek,
    monthDay: task.scheduleMonthDay ? Number(task.scheduleMonthDay) : new Date().getDate(),
    monthWeekday: monthWeek ? Number(task.scheduleMonthWeekday) : new Date().getDay(),
    startsOn: task.startsOn ?? '',
    seasonOn,
    seasonStart: seasonOn ? Number(task.seasonStartMonth) : EMPTY_SCHEDULE.seasonStart,
    seasonEnd: seasonOn ? Number(task.seasonEndMonth) : EMPTY_SCHEDULE.seasonEnd,
    rotationPeriod: task.rotationPeriod === 'week' ? 'week' : 'completion',
    reminderTime: task.reminderTime ?? '',
    reminderDayBefore: !!task.reminderDayBefore,
    timerMinutes: task.timerMinutes ? String(task.timerMinutes) : '',
    steps: choreSteps(task.steps).join('\n'),
  };
}

/** The fields to send with a task create/update. */
export function schedulePayload(v: ScheduleValue, opts: { onDemand: boolean; rotating: boolean }) {
  const monthly = !opts.onDemand && v.mode === 'monthly';
  return {
    scheduleWeekdays: !opts.onDemand && v.mode === 'weekdays' && v.weekdays ? v.weekdays : null,
    scheduleMonthDay: monthly && !v.monthWeek ? v.monthDay : null,
    scheduleMonthWeek: monthly && v.monthWeek ? v.monthWeek : null,
    scheduleMonthWeekday: monthly && v.monthWeek ? v.monthWeekday : null,
    startsOn: !opts.onDemand && v.mode !== 'once' && v.startsOn ? v.startsOn : null,
    oneTime: !opts.onDemand && v.mode === 'once',
    doBy: !opts.onDemand && v.mode === 'once' && v.doBy ? v.doBy : null,
    seasonStartMonth: v.seasonOn ? v.seasonStart : null,
    seasonEndMonth: v.seasonOn ? v.seasonEnd : null,
    rotationPeriod: opts.rotating ? v.rotationPeriod : 'completion',
    reminderTime: !opts.onDemand && v.reminderTime ? v.reminderTime : null,
    reminderDayBefore: v.reminderDayBefore,
    timerMinutes: Number(v.timerMinutes) > 0 ? Math.round(Number(v.timerMinutes)) : null,
    steps: v.steps.split('\n').map((s) => s.trim()).filter(Boolean),
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

/** "Monthly, day 15" / "Every first Sat" for a monthly chore; '' when it isn't one. */
export function monthlyLabel(task: ScheduledTaskFields, t: (k: string) => string, language?: string): string {
  const v = scheduleFromTask(task);
  if (v.mode !== 'monthly') return '';
  if (!v.monthWeek) return v.monthDay >= 31 ? t('schedule.monthlyLastDay') : t('schedule.monthlyDay').replace('{day}', String(v.monthDay));
  const nth = t(v.monthWeek < 0 ? 'schedule.nthLast' : `schedule.nth${v.monthWeek}`).toLowerCase();
  return t('schedule.monthlyNth').replace('{nth}', nth).replace('{weekday}', weekdayName(v.monthWeekday, language));
}

/** Today as 'YYYY-MM-DD' (local). */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** A repeating chore whose start date hasn't come yet. */
export function startsLater(task: { startsOn?: string | null; oneTime?: number | boolean | null }): boolean {
  return !task.oneTime && !!task.startsOn && task.startsOn > todayIso();
}

/** "Apr–Oct" for a season. */
export function seasonLabel(start: number, end: number, language?: string): string {
  return `${monthName(start, language)}–${monthName(end, language)}`;
}
