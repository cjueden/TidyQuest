import { describe, it, expect, beforeEach } from 'vitest';
import { beforeStart, hasFixedSchedule, lastCompletedAtForHealth, nextDueAt, readScheduleInput, taskHealth } from '../utils/schedule';
import { createTestApp, createAdmin } from './setup';
import type supertest from 'supertest';

// Monthly chores and the "Starts on" date (ENH-5). All dates are built in local time, like the server.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (d: Date) => d.toISOString();
const base = { frequencyDays: 30, lastCompletedAt: null as string | null };
const SAT = 6;
const FRI = 5;
const THU = 1 << 4;

describe('Monthly on a day of the month', () => {
  it('done any day in a month: due on that day next month, without drifting', () => {
    const filter = { ...base, scheduleMonthDay: 15, lastCompletedAt: iso(local(2026, 10, 15, 18)) };
    expect(hasFixedSchedule(filter)).toBe(true);
    expect(nextDueAt(filter, local(2026, 10, 16))!.getTime()).toBe(local(2026, 11, 15).getTime());
    // Done late, on the 20th: still the 15th of the next month
    const late = { ...filter, lastCompletedAt: iso(local(2026, 11, 20, 9)) };
    expect(nextDueAt(late, local(2026, 11, 20, 10))!.getTime()).toBe(local(2026, 12, 15).getTime());
  });

  it('29–31 fall on the last day of shorter months', () => {
    const endOfMonth = { ...base, scheduleMonthDay: 31, lastCompletedAt: iso(local(2026, 10, 31, 12)) };
    expect(nextDueAt(endOfMonth, local(2026, 11, 1))!.getTime()).toBe(local(2026, 11, 30).getTime());
    const feb = { ...endOfMonth, lastCompletedAt: iso(local(2027, 1, 31, 12)) };
    expect(nextDueAt(feb, local(2027, 2, 1))!.getTime()).toBe(local(2027, 2, 28).getTime());
  });

  it('never done: this month when the day is still ahead (or today), otherwise next month', () => {
    const filter = { ...base, scheduleMonthDay: 15 };
    expect(nextDueAt(filter, local(2026, 10, 15, 10))!.getTime()).toBe(local(2026, 10, 15).getTime());
    expect(nextDueAt(filter, local(2026, 10, 16, 10))!.getTime()).toBe(local(2026, 11, 15).getTime());
    expect(taskHealth(filter, undefined, local(2026, 10, 15, 10))).toBe(0);
  });

  it('health runs from 100 at the completion to 0 when the due day starts', () => {
    const filter = { ...base, scheduleMonthDay: 1, lastCompletedAt: iso(local(2026, 11, 1)) };
    expect(taskHealth(filter, undefined, local(2026, 11, 1))).toBe(100);
    expect(taskHealth(filter, undefined, local(2026, 11, 16))).toBe(50);
    expect(taskHealth(filter, undefined, local(2026, 12, 1))).toBe(0);
  });

  it('the health slider finds a matching last-done time', () => {
    const filter = { ...base, scheduleMonthDay: 1 };
    const now = local(2026, 11, 16);
    // Halfway through the month, a chore done since the 1st is at 50–100 (or 0 when not done since)
    for (const target of [0, 60, 80]) {
      const last = lastCompletedAtForHealth(filter, target, now);
      expect(Math.abs(taskHealth({ ...filter, lastCompletedAt: last }, undefined, now) - target)).toBeLessThanOrEqual(1);
    }
  });
});

describe('Monthly on the nth weekday', () => {
  it('first Saturday', () => {
    const t = { ...base, scheduleMonthWeek: 1, scheduleMonthWeekday: SAT, lastCompletedAt: iso(local(2026, 10, 3, 10)) };
    expect(nextDueAt(t, local(2026, 10, 4))!.getTime()).toBe(local(2026, 11, 7).getTime());
    const nov = { ...t, lastCompletedAt: iso(local(2026, 11, 7, 10)) };
    expect(nextDueAt(nov, local(2026, 11, 8))!.getTime()).toBe(local(2026, 12, 5).getTime());
  });

  it('last Friday', () => {
    const t = { ...base, scheduleMonthWeek: -1, scheduleMonthWeekday: FRI };
    expect(nextDueAt(t, local(2026, 10, 18))!.getTime()).toBe(local(2026, 10, 30).getTime());
    const done = { ...t, lastCompletedAt: iso(local(2026, 10, 30, 19)) };
    expect(nextDueAt(done, local(2026, 10, 31))!.getTime()).toBe(local(2026, 11, 27).getTime());
  });

  it('a weekday without a week (or a week without a weekday) is not a monthly rule', () => {
    expect(hasFixedSchedule({ ...base, scheduleMonthWeekday: SAT })).toBe(false);
    expect(hasFixedSchedule({ ...base, scheduleMonthWeek: 1 })).toBe(false);
  });
});

describe('Starts on', () => {
  it('rolling interval: clean before the start date, due on it, then every N days from when it was done', () => {
    const t = { ...base, frequencyDays: 7, startsOn: '2026-11-01' };
    expect(beforeStart(t, local(2026, 10, 18))).toBe(true);
    expect(nextDueAt(t, local(2026, 10, 18))!.getTime()).toBe(local(2026, 11, 1).getTime());
    expect(taskHealth(t, undefined, local(2026, 10, 31, 23))).toBe(100);
    expect(taskHealth(t, undefined, local(2026, 11, 1, 8))).toBe(0);
    // Done before the start date: it's still first due on the start date
    const early = { ...t, lastCompletedAt: iso(local(2026, 10, 30, 12)) };
    expect(nextDueAt(early, local(2026, 10, 31))!.getTime()).toBe(local(2026, 11, 1).getTime());
    // Done on the start date: the usual interval from then
    const done = { ...t, lastCompletedAt: iso(local(2026, 11, 1, 12)) };
    expect(nextDueAt(done, local(2026, 11, 2))!.getTime()).toBe(local(2026, 11, 8, 12).getTime());
    expect(taskHealth(done, undefined, local(2026, 11, 2, 12))).toBeGreaterThan(80);
  });

  it('set weekdays: first due on the first scheduled day from the start date, counting down from the start', () => {
    // Starts Sunday Nov 8; bins on Thursdays -> first due Thursday Nov 12
    const t = { ...base, frequencyDays: 7, scheduleWeekdays: THU, startsOn: '2026-11-08' };
    expect(nextDueAt(t, local(2026, 10, 18))!.getTime()).toBe(local(2026, 11, 12).getTime());
    expect(taskHealth(t, undefined, local(2026, 11, 5, 12))).toBe(100);
    expect(taskHealth(t, undefined, local(2026, 11, 8))).toBe(100);
    expect(taskHealth(t, undefined, local(2026, 11, 10))).toBe(50);
  });

  it('monthly: the first matching day on or after the start date', () => {
    const t = { ...base, scheduleMonthWeek: 1, scheduleMonthWeekday: SAT, startsOn: '2026-11-08' };
    expect(nextDueAt(t, local(2026, 10, 18))!.getTime()).toBe(local(2026, 12, 5).getTime());
  });

  it('a start date in the past only matters until the chore is done after it', () => {
    const t = { ...base, frequencyDays: 7, startsOn: '2026-10-01', lastCompletedAt: iso(local(2026, 10, 15, 9)) };
    expect(nextDueAt(t, local(2026, 10, 18))!.getTime()).toBe(local(2026, 10, 22, 9).getTime());
    // Never done since it started on Oct 1: due since then
    const never = { ...t, lastCompletedAt: null };
    expect(taskHealth(never, undefined, local(2026, 10, 18))).toBe(0);
  });

  it('one-time chores ignore it (they have a do-by date)', () => {
    const t = { ...base, oneTime: 1, startsOn: '2026-11-01', createdAt: '2026-10-18 12:00:00' };
    expect(beforeStart(t, local(2026, 10, 18))).toBe(false);
  });
});

describe('Input validation', () => {
  it('a day of the month, or a week and weekday; blanks clear it', () => {
    expect(readScheduleInput({ scheduleMonthDay: 15 })).toEqual({ values: { scheduleMonthDay: 15, scheduleMonthWeek: null, scheduleMonthWeekday: null } });
    expect(readScheduleInput({ scheduleMonthWeek: -1, scheduleMonthWeekday: 5 })).toEqual({ values: { scheduleMonthDay: null, scheduleMonthWeek: -1, scheduleMonthWeekday: 5 } });
    expect(readScheduleInput({ scheduleMonthDay: null, scheduleMonthWeek: null, scheduleMonthWeekday: null }))
      .toEqual({ values: { scheduleMonthDay: null, scheduleMonthWeek: null, scheduleMonthWeekday: null } });
    expect(readScheduleInput({ scheduleMonthDay: 32 })).toEqual({ error: 'invalid_month_day' });
    expect(readScheduleInput({ scheduleMonthWeek: 5, scheduleMonthWeekday: 1 })).toEqual({ error: 'invalid_month_day' });
    expect(readScheduleInput({ scheduleMonthWeek: 1 })).toEqual({ error: 'invalid_month_day' });
    expect(readScheduleInput({ scheduleMonthDay: 3, scheduleMonthWeek: 1, scheduleMonthWeekday: 1 })).toEqual({ error: 'invalid_month_day' });
  });

  it('a start date is YYYY-MM-DD or empty', () => {
    expect(readScheduleInput({ startsOn: '2026-11-01' })).toEqual({ values: { startsOn: '2026-11-01' } });
    expect(readScheduleInput({ startsOn: '' })).toEqual({ values: { startsOn: null } });
    expect(readScheduleInput({ startsOn: '11/01/2026' })).toEqual({ error: 'invalid_starts_on' });
  });
});

describe('Through the API', () => {
  let agent: supertest.Agent;
  beforeEach(() => { ({ agent } = createTestApp()); });
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('saves a monthly chore with a start date and reports its first due day', async () => {
    const admin = await createAdmin(agent);
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Room', roomType: 'other' })).body.id as number;
    const start = new Date(Date.now() + 40 * 86400000);
    const startsOn = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const created = await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token))
      .send({ name: 'Change the water filter', effort: 1, frequencyDays: 30, health: 20, scheduleMonthDay: 31, startsOn });
    expect(created.status).toBe(201);
    const t = ((await agent.get('/api/rooms').set(auth(admin.token))).body as any[]).flatMap((r) => r.tasks).find((x: any) => x.id === created.body.id);
    expect([t.scheduleMonthDay, t.startsOn, t.health]).toEqual([31, startsOn, 100]);
    // The last day of the start date's month
    const due = new Date(t.nextDueAt);
    expect([due.getMonth(), due.getDate()]).toEqual([start.getMonth(), new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()]);

    const bad = await agent.put(`/api/tasks/${created.body.id}`).set(auth(admin.token)).send({ scheduleMonthWeek: 1 });
    expect([bad.status, bad.body.error]).toEqual([400, 'invalid_month_day']);
  });
});
