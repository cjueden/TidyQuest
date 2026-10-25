import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp } from './setup';
import { at, addDays, canonicalZone, dateStr, dayAt, endOfDay, familyZone, serverZone, startOfDay, wall } from '../utils/clock';

const LA = 'America/Los_Angeles';
const AKL = 'Pacific/Auckland';
const iso = (d: Date) => d.toISOString();

describe('clock: wall time in a zone', () => {
  it('reads the day, weekday and hour at home', () => {
    // 2026-10-24 03:30 UTC is Fri 20:30 in Los Angeles and Sat 16:30 in Auckland
    const t = new Date('2026-10-24T03:30:00Z');
    expect(wall(t, LA)).toMatchObject({ year: 2026, month: 9, date: 23, weekday: 5, hours: 20, minutes: 30 });
    expect(wall(t, AKL)).toMatchObject({ year: 2026, month: 9, date: 24, weekday: 6, hours: 16, minutes: 30 });
    expect(dateStr(t, 'UTC')).toBe('2026-10-24');
    expect(dateStr(t, LA)).toBe('2026-10-23');
  });

  it('turns a wall-clock time back into the moment', () => {
    expect(iso(at(2026, 9, 24, 0, 0, 0, 0, AKL))).toBe('2026-10-23T11:00:00.000Z');
    expect(iso(at(2026, 0, 15, 9, 0, 0, 0, LA))).toBe('2026-01-15T17:00:00.000Z');
    // Fields overflow like new Date(): month 12 is next January, day 0 the month before's last day
    expect(iso(at(2026, 12, 1, 0, 0, 0, 0, 'UTC'))).toBe('2027-01-01T00:00:00.000Z');
    expect(iso(at(2026, 2, 0, 0, 0, 0, 0, 'UTC'))).toBe('2026-02-28T00:00:00.000Z');
    expect(iso(dayAt('2026-07-04', 12, 0, 0, 0, LA))).toBe('2026-07-04T19:00:00.000Z');
  });

  it('handles clock changes like Date does', () => {
    // Los Angeles springs forward 2026-03-08 02:00 → 03:00: 02:30 doesn't exist and lands at 03:30
    expect(iso(at(2026, 2, 8, 2, 30, 0, 0, LA))).toBe('2026-03-08T10:30:00.000Z');
    // ...and falls back 2026-11-01 02:00 → 01:00: 01:30 happens twice, the first one wins
    expect(iso(at(2026, 10, 1, 1, 30, 0, 0, LA))).toBe('2026-11-01T08:30:00.000Z');
    // Auckland's spring-forward day (2026-09-27) is 23 hours long
    const start = startOfDay(new Date('2026-09-27T05:00:00Z'), 0, AKL);
    const next = startOfDay(new Date('2026-09-27T05:00:00Z'), 1, AKL);
    expect(iso(start)).toBe('2026-09-26T12:00:00.000Z');
    expect(next.getTime() - start.getTime()).toBe(23 * 3600_000);
    // Adding days keeps the wall-clock time across the change
    expect(wall(addDays(at(2026, 8, 26, 18, 0, 0, 0, AKL), 2, AKL), AKL)).toMatchObject({ date: 28, hours: 18, minutes: 0 });
    expect(iso(endOfDay(new Date('2026-10-24T03:30:00Z'), 0, LA))).toBe('2026-10-24T06:59:59.999Z');
  });

  it('only accepts zones Intl knows', () => {
    expect(canonicalZone(AKL)).toBe(AKL);
    expect(canonicalZone('utc')).toBe('UTC');
    expect(canonicalZone('Mars/Olympus_Mons')).toBeNull();
    expect(canonicalZone("UTC'); DROP TABLE users;--")).toBeNull();
    expect(canonicalZone(42)).toBeNull();
  });
});

describe('clock: the family zone', () => {
  let db: ReturnType<typeof createTestApp>['db'];
  beforeAll(() => { ({ db } = createTestApp()); });

  it('uses the saved zone, else the server zone', () => {
    db.prepare("DELETE FROM app_settings WHERE key = 'timeZone'").run();
    expect(familyZone()).toBe(serverZone());
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('timeZone', ?)").run(AKL);
    expect(familyZone()).toBe(AKL);
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('timeZone', 'Not/AZone')").run();
    expect(familyZone()).toBe(serverZone());
  });

  it('gives SQL the family day, hour and week', () => {
    const row = db.prepare(
      `SELECT tz_date('2026-10-24T03:30:00.000Z', '${AKL}') AS akl, tz_date('2026-10-24 03:30:00', '${LA}') AS la,
              tz_hour('2026-10-24T03:30:00Z', '${AKL}') AS h, tz_week('2026-10-24T03:30:00Z', '${AKL}', 1) AS mon,
              tz_week('2026-10-24T03:30:00Z', '${AKL}', 0) AS sun, tz_date(NULL, 'UTC') AS none`
    ).get() as Record<string, unknown>;
    expect(row).toEqual({ akl: '2026-10-24', la: '2026-10-23', h: 16, mon: '2026-10-19', sun: '2026-10-18', none: null });
  });
});
