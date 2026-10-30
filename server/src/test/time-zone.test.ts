import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, HOSTED_RUN } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { at, familyZone, serverZone } from '../utils/clock';
import { localDateStr } from '../utils/dateHelpers';
import { currentLocalWeek, startOfLocalWeek, weekOfSql } from '../utils/periods';
import { nextDueAt } from '../utils/schedule';
import { holdUntil } from '../utils/notify';
import { missedStreakDays } from '../utils/streaks';

// ENH-10: the family's time zone (Settings → General). Until a parent picks one, the server's TZ is used.

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
  db.prepare("DELETE FROM app_settings WHERE key = 'timeZone'").run();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const AKL = 'Pacific/Auckland';
const LA = 'America/Los_Angeles';
// Neither zone is the server's in CI (UTC); locally one of them may be, which takes the Date path
const setZone = (tz: string) => db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('timeZone', ?)").run(tz);

describe('Time zone setting', () => {
  // Hosted mode has no /register: NEW-10's sign-up takes the browser's zone
  it.skipIf(HOSTED_RUN)("saves the first parent's browser zone, and only theirs", async () => {
    await agent.post('/api/auth/register').send({ username: 'mom', password: 'pass123', displayName: 'Mom', timeZone: AKL }).expect(201);
    expect(familyZone()).toBe(AKL);
    await agent.post('/api/auth/register').send({ username: 'kid', password: 'pass123', displayName: 'Kid', timeZone: LA }).expect(201);
    expect(familyZone()).toBe(AKL);
  });

  it.skipIf(HOSTED_RUN)('ignores a zone the server does not know on sign-up', async () => {
    await agent.post('/api/auth/register').send({ username: 'mom', password: 'pass123', displayName: 'Mom', timeZone: 'Nowhere/Land' }).expect(201);
    expect(familyZone()).toBe(serverZone());
  });

  it('is for parents, takes known zones, and reaches the dashboard', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
    let body = (await agent.get('/api/dashboard').set(auth(admin.token)).expect(200)).body;
    expect(body).toMatchObject({ timeZone: serverZone(), timeZoneSet: false });

    await agent.put('/api/users/time-zone').set(auth(kid.token)).send({ timeZone: AKL }).expect(403);
    await agent.put('/api/users/time-zone').set(auth(admin.token)).send({ timeZone: 'Mars/Base' }).expect(400);
    await agent.put('/api/users/time-zone').set(auth(admin.token)).send({ timeZone: "UTC'--" }).expect(400);
    expect((await agent.put('/api/users/time-zone').set(auth(admin.token)).send({ timeZone: AKL }).expect(200)).body).toEqual({ timeZone: AKL, timeZoneSet: true });
    body = (await agent.get('/api/dashboard').set(auth(kid.token)).expect(200)).body;
    expect(body).toMatchObject({ timeZone: AKL, timeZoneSet: true });

    // null goes back to the server's zone
    await agent.put('/api/users/time-zone').set(auth(admin.token)).send({ timeZone: null }).expect(200);
    expect((await agent.get('/api/dashboard').set(auth(admin.token)).expect(200)).body).toMatchObject({ timeZone: serverZone(), timeZoneSet: false });
  });

  it('is carried by export and import', async () => {
    const admin = await createAdmin(agent);
    setZone(AKL);
    const exported = (await agent.get('/api/export').set(auth(admin.token)).expect(200)).body;
    expect(JSON.stringify(exported)).toContain(AKL);
  });
});

describe('Days and weeks in the family zone', () => {
  // Sat 2026-10-24 03:30 UTC: still Friday evening in Los Angeles, Saturday afternoon in Auckland
  const T = new Date('2026-10-24T03:30:00Z');

  it('tells today and the week from the family zone', () => {
    setZone(AKL);
    expect(localDateStr(T)).toBe('2026-10-24');
    expect(startOfLocalWeek(T).toISOString()).toBe('2026-10-18T11:00:00.000Z'); // Mon 19 Oct, 00:00 NZDT
    setZone(LA);
    expect(localDateStr(T)).toBe('2026-10-23');
    expect(startOfLocalWeek(T).toISOString()).toBe('2026-10-19T07:00:00.000Z'); // Mon 19 Oct, 00:00 PDT
  });

  it('puts completions on the same days and weeks in SQL as in JavaScript', () => {
    for (const tz of [AKL, LA]) {
      setZone(tz);
      for (let h = 0; h < 48; h += 5) {
        const t = new Date(T.getTime() + h * 3600_000).toISOString();
        const row = db.prepare(`SELECT tz_date(?, '${tz}') AS d, ${weekOfSql('?')} AS w`).get(t, t) as { d: string; w: string };
        expect(row.d).toBe(localDateStr(new Date(t)));
        expect(row.w).toBe(localDateStr(startOfLocalWeek(new Date(t))));
      }
    }
  });

  it('makes a weekday chore due at midnight at home', () => {
    setZone(AKL);
    // Mondays only, last done on Monday 19 Oct (NZ): next due Monday 26 Oct 00:00 NZDT
    const task = { frequencyDays: 7, scheduleWeekdays: 1 << 1, lastCompletedAt: at(2026, 9, 19, 9, 0, 0, 0, AKL).toISOString() };
    expect(nextDueAt(task as never, T)!.toISOString()).toBe('2026-10-25T11:00:00.000Z');
  });

  it('holds messages through quiet hours at home', () => {
    setZone(AKL);
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('quietStart', '21:00'), ('quietEnd', '07:00')").run();
    // 22:30 in Auckland: held until 07:00 there
    expect(holdUntil(null, at(2026, 9, 24, 22, 30, 0, 0, AKL))?.toISOString()).toBe(at(2026, 9, 25, 7, 0, 0, 0, AKL).toISOString());
    // 16:30 in Auckland: goes out now
    expect(holdUntil(null, T)).toBeNull();
  });

  it('counts streak days by the family day', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'kitchen' })).body.id as number;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 1, frequencyDays: 1 })).body.id as number;
    setZone(AKL);
    // 23:30 on the 21st in Auckland is the 21st there (but the 21st 10:30 UTC)
    db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 1, 'approved')")
      .run(task, kid.user.id, at(2026, 9, 21, 23, 30, 0, 0, AKL).toISOString());
    expect(missedStreakDays(kid.user.id, '2026-10-20', '2026-10-21')).toEqual([]);
  });

  it('moves a running weekly goal onto the new zone\'s week', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
    setZone(LA);
    const week = currentLocalWeek(new Date(), 1, LA);
    const id = Number(db.prepare(
      'INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt, repeatWeekly) VALUES (?, ?, 50, ?, ?, 1)'
    ).run(kid.user.id, 'Weekly Win', week.startAt, week.endAt).lastInsertRowid);
    await agent.put('/api/users/time-zone').set(auth(admin.token)).send({ timeZone: AKL }).expect(200);
    const g = db.prepare('SELECT startAt, endAt FROM user_goals WHERE id = ?').get(id) as { startAt: string; endAt: string };
    const nz = currentLocalWeek(new Date(Date.parse(week.startAt) + 3.5 * 86_400_000), 1, AKL);
    expect(g).toEqual(nz);
  });
});
