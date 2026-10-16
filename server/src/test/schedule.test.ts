import { describe, it, expect } from 'vitest';
import {
  calendarDaysUntil, isInSeason, isSeasonalNow, lastCompletedAtForHealth, nextDueAt, readScheduleInput,
  rotationTurnFor, taskHealth, weekNumber,
} from '../utils/schedule';
import { calculateHealth } from '../utils/health';

// Pure helper tests (no app). All dates are built in local time, like the server.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (d: Date) => d.toISOString();
const THU = 1 << 4;
const MON_WED_FRI = (1 << 1) | (1 << 3) | (1 << 5);
const base = { frequencyDays: 7, lastCompletedAt: null as string | null };

describe('Seasons', () => {
  it('May–September: in season in the summer, out in October and April', () => {
    const pool = { ...base, seasonStartMonth: 5, seasonEndMonth: 9 };
    expect(isInSeason(pool, local(2026, 5, 1))).toBe(true);
    expect(isInSeason(pool, local(2026, 9, 30, 23))).toBe(true);
    expect(isInSeason(pool, local(2026, 10, 1))).toBe(false);
    expect(isInSeason(pool, local(2026, 4, 30))).toBe(false);
    expect(isSeasonalNow(pool, local(2026, 10, 15))).toBe(true);
  });

  it('wraps over the new year (November–February)', () => {
    const winter = { ...base, seasonStartMonth: 11, seasonEndMonth: 2 };
    for (const m of [11, 12, 1, 2]) expect(isInSeason(winter, local(2026, m, 10))).toBe(true);
    for (const m of [3, 6, 10]) expect(isInSeason(winter, local(2026, m, 10))).toBe(false);
  });

  it('no season (or half of one) means all year; the isSeasonal flag still wins', () => {
    expect(isInSeason({ ...base }, local(2026, 1, 1))).toBe(true);
    expect(isInSeason({ ...base, seasonStartMonth: 5, seasonEndMonth: null }, local(2026, 1, 1))).toBe(true);
    expect(isSeasonalNow({ ...base, isSeasonal: 1, seasonStartMonth: 1, seasonEndMonth: 12 }, local(2026, 6, 1))).toBe(true);
  });
});

describe('Set weekdays', () => {
  it('bins on Thursday: due when the next Thursday after the last completion starts', () => {
    // Done Thursday Oct 15 at 7pm -> due Thursday Oct 22 00:00
    const bins = { ...base, scheduleWeekdays: THU, lastCompletedAt: iso(local(2026, 10, 15, 19)) };
    expect(nextDueAt(bins, local(2026, 10, 16))!.getTime()).toBe(local(2026, 10, 22).getTime());
    // Done late on Saturday: still the next Thursday, it doesn't drift
    const late = { ...bins, lastCompletedAt: iso(local(2026, 10, 24, 9)) };
    expect(nextDueAt(late, local(2026, 10, 24, 10))!.getTime()).toBe(local(2026, 10, 29).getTime());
  });

  it('never done: today when today is a scheduled day, otherwise the next one', () => {
    const bins = { ...base, scheduleWeekdays: THU };
    expect(nextDueAt(bins, local(2026, 10, 15, 10))!.getTime()).toBe(local(2026, 10, 15).getTime());
    expect(nextDueAt(bins, local(2026, 10, 12, 10))!.getTime()).toBe(local(2026, 10, 15).getTime());
    expect(taskHealth(bins, undefined, local(2026, 10, 15, 10))).toBe(0);
    // Monday 10:00, due Thursday 00:00: 62h left of the 7-day week -> 37%
    expect(taskHealth(bins, undefined, local(2026, 10, 12, 10))).toBe(37);
  });

  it('health runs from 100 at the completion to 0 when the due day starts', () => {
    const bins = { ...base, scheduleWeekdays: THU, lastCompletedAt: iso(local(2026, 10, 15, 0)) };
    expect(taskHealth(bins, undefined, local(2026, 10, 15, 0))).toBe(100);
    expect(taskHealth(bins, undefined, local(2026, 10, 18, 12))).toBe(50);
    expect(taskHealth(bins, undefined, local(2026, 10, 21, 23, 59))).toBe(0); // rounds down to 0 just before
    expect(taskHealth(bins, undefined, local(2026, 10, 22, 0))).toBe(0);
    expect(taskHealth(bins, undefined, local(2026, 10, 25))).toBe(0);
  });

  it('Mon/Wed/Fri lands on local midnights across the end of daylight saving time (Nov 1)', () => {
    const t = { ...base, scheduleWeekdays: MON_WED_FRI, lastCompletedAt: iso(local(2026, 10, 30, 18)) }; // Fri
    const due = nextDueAt(t, local(2026, 10, 31))!;
    expect(due.getTime()).toBe(local(2026, 11, 2).getTime()); // Monday after the switch
    expect([due.getHours(), due.getMinutes()]).toEqual([0, 0]);
    expect(calendarDaysUntil(due, local(2026, 10, 31, 23))).toBe(2);
    // And the spring switch (Mar 8 2026): done Fri Mar 6 -> Mon Mar 9 00:00
    const spring = { ...t, lastCompletedAt: iso(local(2026, 3, 6, 18)) };
    expect(nextDueAt(spring, local(2026, 3, 7))!.getTime()).toBe(local(2026, 3, 9).getTime());
  });

  it('a rolling-interval task keeps the old maths', () => {
    const last = iso(local(2026, 10, 10, 8));
    const t = { ...base, frequencyDays: 3, lastCompletedAt: last };
    expect(nextDueAt(t)!.getTime()).toBe(new Date(last).getTime() + 3 * 86400000);
    expect(nextDueAt({ ...base })).toBeNull();
    const now = local(2026, 10, 11, 20);
    expect(taskHealth(t, undefined, now)).toBe(calculateHealth(last, 3, false, null));
  });

  it('vacation freezes a weekday task\'s health like a rolling one', () => {
    const bins = { ...base, scheduleWeekdays: THU, lastCompletedAt: iso(local(2026, 10, 15, 0)) };
    const vacation = { isVacation: true, startDate: iso(local(2026, 10, 18, 12)) };
    expect(taskHealth(bins, vacation, local(2026, 10, 30))).toBe(50);
  });

  it('finds a lastCompletedAt for a wanted health (health slider, reset to dirty)', () => {
    const now = local(2026, 10, 19, 12); // Monday noon, bins due Thursday 00:00
    const bins = { ...base, scheduleWeekdays: THU };
    for (const h of [0, 50, 60, 100]) {
      const last = lastCompletedAtForHealth(bins, h, now);
      expect(Math.abs(taskHealth({ ...bins, lastCompletedAt: last }, undefined, now) - h)).toBeLessThanOrEqual(1);
    }
    // Done any time since last Thursday it counts down from 100 to ~36 by Monday noon; done before
    // that it's simply overdue (0). So 30 isn't reachable here: the closest reachable value is used.
    const h30 = taskHealth({ ...bins, lastCompletedAt: lastCompletedAtForHealth(bins, 30, now) }, undefined, now);
    expect(h30).toBeGreaterThanOrEqual(30);
    expect(h30).toBeLessThanOrEqual(40);
  });
});

describe('Weekly rotation', () => {
  it('counts Monday-to-Sunday weeks, consecutively over the new year', () => {
    expect(weekNumber(local(1970, 1, 5))).toBe(1); // first Monday
    expect(weekNumber(local(1970, 1, 4, 23))).toBe(0); // the Sunday before
    const mon = weekNumber(local(2026, 12, 28));
    expect(weekNumber(local(2027, 1, 3, 23, 59))).toBe(mon); // Sunday of the same week
    expect(weekNumber(local(2027, 1, 4))).toBe(mon + 1);
    // Not shifted by daylight saving time: Sun Nov 1 2026 and the Monday after
    expect(weekNumber(local(2026, 11, 2)) - weekNumber(local(2026, 11, 1, 23))).toBe(1);
  });

  it('turn = assignees ordered by id at weekNumber % n', () => {
    const task = { assignmentMode: 'rotating', rotationPeriod: 'week', rotationCurrentUserId: 99 };
    const monday = local(2026, 10, 12);
    const w = weekNumber(monday);
    const ids = [7, 3];
    expect(rotationTurnFor(task, ids, monday)).toBe([3, 7][w % 2]);
    expect(rotationTurnFor(task, ids, local(2026, 10, 18, 23))).toBe([3, 7][w % 2]);
    expect(rotationTurnFor(task, ids, local(2026, 10, 19))).toBe([3, 7][(w + 1) % 2]);
    // Per-completion rotation keeps the stored turn
    expect(rotationTurnFor({ ...task, rotationPeriod: 'completion' }, ids, monday)).toBe(99);
  });
});

describe('Input validation', () => {
  it('accepts weekdays as a list or a bitmask, and empty as "rolling interval"', () => {
    expect(readScheduleInput({ scheduleWeekdays: [1, 3, 5] })).toEqual({ values: { scheduleWeekdays: MON_WED_FRI } });
    expect(readScheduleInput({ scheduleWeekdays: THU })).toEqual({ values: { scheduleWeekdays: THU } });
    expect(readScheduleInput({ scheduleWeekdays: [] })).toEqual({ values: { scheduleWeekdays: null } });
    expect(readScheduleInput({ scheduleWeekdays: null })).toEqual({ values: { scheduleWeekdays: null } });
    expect(readScheduleInput({ scheduleWeekdays: [7] })).toEqual({ error: 'invalid_weekdays' });
    expect(readScheduleInput({ scheduleWeekdays: 200 })).toEqual({ error: 'invalid_weekdays' });
  });

  it('a season needs both months, 1–12', () => {
    expect(readScheduleInput({ seasonStartMonth: 5, seasonEndMonth: 9 })).toEqual({ values: { seasonStartMonth: 5, seasonEndMonth: 9 } });
    expect(readScheduleInput({ seasonStartMonth: null, seasonEndMonth: null })).toEqual({ values: { seasonStartMonth: null, seasonEndMonth: null } });
    expect(readScheduleInput({ seasonStartMonth: 5 })).toEqual({ error: 'invalid_season' });
    expect(readScheduleInput({ seasonStartMonth: 0, seasonEndMonth: 9 })).toEqual({ error: 'invalid_season' });
    expect(readScheduleInput({ seasonStartMonth: 5, seasonEndMonth: 13 })).toEqual({ error: 'invalid_season' });
  });

  it('rotation period is completion or week; nothing sent changes nothing', () => {
    expect(readScheduleInput({ rotationPeriod: 'week' })).toEqual({ values: { rotationPeriod: 'week' } });
    expect(readScheduleInput({ rotationPeriod: 'month' })).toEqual({ error: 'invalid_rotation_period' });
    expect(readScheduleInput({ name: 'x' })).toEqual({ values: {} });
  });
});
