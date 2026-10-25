import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, homeToday } from './setup';
import { at, wall } from '../utils/clock';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { currentLocalWeek, startOfLocalWeek, weekOfSql, weekStartDay } from '../utils/periods';
import { localDateStr } from '../utils/dateHelpers';
import { rotationTurnFor, weekNumber } from '../utils/schedule';
import { boardRanges, buildBoard } from '../utils/board';
import { periodStart, rotatingThisWeek } from '../utils/rewardRules';
import { realignWeeklyGoals, rollOverRepeatingGoals } from '../utils/goals';

// FIX-11: the family picks the week's first day (Settings → General). Monday unless set to Sunday.

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const local = (y: number, m: number, d: number, h = 0, min = 0) => at(y, m - 1, d, h, min);
const sundayFirst = () => db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('weekStart', '0')").run();
const WED = () => local(2026, 10, 21, 15); // Wednesday Oct 21 2026 (on the family's clock, once the database is set up)

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'kitchen' })).body.id as number;
  const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 3, frequencyDays: 1 })).body.id as number;
  return { admin, kid, kidId: kid.user.id as number, task };
}

const done = (taskId: number, userId: number, at: Date, coins: number) =>
  db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, ?, 'approved')")
    .run(taskId, userId, at.toISOString(), coins);

describe('Week start helpers', () => {
  it('starts weeks on Monday by default and on Sunday when chosen', () => {
    expect(weekStartDay()).toBe(1);
    expect(startOfLocalWeek(WED())).toEqual(local(2026, 10, 19));
    sundayFirst();
    expect(weekStartDay()).toBe(0);
    expect(startOfLocalWeek(WED())).toEqual(local(2026, 10, 18));
    expect(startOfLocalWeek(local(2026, 10, 18, 0, 5))).toEqual(local(2026, 10, 18)); // Sunday itself
    expect(startOfLocalWeek(local(2026, 10, 24, 23, 55))).toEqual(local(2026, 10, 18)); // Saturday night
    expect(currentLocalWeek(WED())).toEqual({ startAt: local(2026, 10, 18).toISOString(), endAt: new Date(local(2026, 10, 25).getTime() - 1).toISOString() });
  });

  it('puts days in the same weeks in SQL as in JavaScript, over a daylight saving change', () => {
    for (const first of [0, 1]) {
      for (let d = 0; d < 14; d++) {
        const at = local(2026, 10, 25 + d, d % 2 ? 0 : 23, 30);
        const sql = (db.prepare(`SELECT ${weekOfSql('?', first)} AS w`).get(at.toISOString()) as { w: string }).w;
        expect(sql).toBe(localDateStr(startOfLocalWeek(at, first)));
      }
    }
  });
});

describe('Weekly turns', () => {
  it('moves only Sunday into the next turn', () => {
    const days = [18, 19, 20, 21, 22, 23, 24, 25].map((d) => local(2026, 10, d, 12));
    const monday = days.map((d) => weekNumber(d, 1));
    const sunday = days.map((d) => weekNumber(d, 0));
    expect(sunday.slice(1, 7)).toEqual(monday.slice(1, 7)); // Mon 19 – Sat 24 keep their week
    expect(monday[0]).toBe(monday[1] - 1);
    expect(sunday[0]).toBe(sunday[1]); // Sunday 18 joins them
    expect(sunday[7]).toBe(sunday[6] + 1); // Sunday 25 starts the next one

    const task = { assignmentMode: 'rotating', rotationPeriod: 'week' };
    const ids = [3, 7];
    expect(rotationTurnFor(task, ids, local(2026, 10, 25, 12))).toBe(rotationTurnFor(task, ids, local(2026, 10, 24, 12)));
    sundayFirst();
    expect(rotationTurnFor(task, ids, local(2026, 10, 25, 12))).toBe(rotationTurnFor(task, ids, local(2026, 10, 26, 12)));
    expect(rotationTurnFor(task, ids, local(2026, 10, 25, 12))).not.toBe(rotationTurnFor(task, ids, local(2026, 10, 24, 12)));
  });
});

describe('Board, reward limits and rotating rewards', () => {
  it('use Sunday-to-Saturday weeks', () => {
    sundayFirst();
    expect(boardRanges('week', WED()).current).toEqual({ start: local(2026, 10, 18), end: WED() });
    expect(boardRanges('lastWeek', WED()).current).toEqual({ start: local(2026, 10, 11), end: local(2026, 10, 18) });
    expect(periodStart('week', WED())).toEqual(local(2026, 10, 18));
  });

  it('groups past winners by Sunday weeks', async () => {
    const { kidId, task } = await family();
    done(task, kidId, local(2026, 10, 11, 12), 5); // Sunday
    done(task, kidId, local(2026, 10, 17, 12), 7); // the Saturday after
    expect(buildBoard('week', 'coins', WED()).trophies.weeks.map((w) => w.weekStart)).toEqual(['2026-10-12', '2026-10-05']);
    sundayFirst();
    expect(buildBoard('week', 'coins', WED()).trophies.weeks).toEqual([{ weekStart: '2026-10-11', userIds: [kidId], coins: 12 }]);
  });

  it('keeps the rotating picks through a Sunday-first week, and Monday-first weeks as before', () => {
    const insert = db.prepare('INSERT INTO rewards (title, costCoins, isRotating) VALUES (?, 100, 1)');
    for (let i = 0; i < 10; i++) insert.run(`Dream ${i}`);
    const ids = (d: Date) => [...rotatingThisWeek(d)].sort().join(',');
    const mondayWeek = ids(local(2026, 10, 19, 12));
    expect(ids(local(2026, 10, 25, 23, 30))).toBe(mondayWeek);
    sundayFirst();
    expect(ids(local(2026, 10, 18, 0, 30))).toBe(mondayWeek);
    expect(ids(local(2026, 10, 24, 23, 30))).toBe(mondayWeek);
  });
});

describe('Weekly goals', () => {
  const insertGoal = (userId: number, title: string, startAt: string, endAt: string) => Number(db.prepare(
    'INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt, repeatWeekly) VALUES (?, ?, 50, ?, ?, 1)'
  ).run(userId, title, startAt, endAt).lastInsertRowid);
  const goal = (id: number) => db.prepare('SELECT title, startAt, endAt FROM user_goals WHERE id = ?').get(id);

  it('moves a running weekly goal to the week sharing six of its days; goals with their own dates stay', async () => {
    const { kidId } = await family();
    const week = currentLocalWeek(WED(), 1);
    const chain = insertGoal(kidId, 'Weekly Win · week of Oct 19', week.startAt, week.endAt);
    const dated = insertGoal(kidId, 'Big push', local(2026, 10, 20).toISOString(), '2026-10-27T23:59:59.999Z');

    expect(realignWeeklyGoals(1, 0, WED())).toEqual([kidId]);
    expect(goal(chain)).toEqual({ title: 'Weekly Win · week of Oct 18', ...currentLocalWeek(WED(), 0) });
    expect(goal(dated)).toMatchObject({ startAt: local(2026, 10, 20).toISOString(), endAt: '2026-10-27T23:59:59.999Z' });

    expect(realignWeeklyGoals(0, 1, WED())).toEqual([kidId]);
    expect(goal(chain)).toEqual({ title: 'Weekly Win · week of Oct 19', ...week });
  });

  it('switched on the last day, the goal ends and the next one starts on Sunday', async () => {
    const { kidId } = await family();
    const sunday = local(2026, 10, 25, 12);
    const week = currentLocalWeek(sunday, 1);
    insertGoal(kidId, 'Weekly Win', week.startAt, week.endAt);
    realignWeeklyGoals(1, 0, sunday);
    sundayFirst();
    rollOverRepeatingGoals(kidId, sunday);
    const starts = (db.prepare('SELECT startAt FROM user_goals WHERE userId = ? ORDER BY startAt').all(kidId) as Array<{ startAt: string }>).map((g) => g.startAt);
    expect(starts).toEqual([local(2026, 10, 18).toISOString(), local(2026, 10, 25).toISOString()]);
  });
});

describe('Week start setting', () => {
  it('is for parents, takes 0 or 1, and reaches the dashboard', async () => {
    const { admin, kid } = await family();
    await agent.put('/api/users/week-start').set(auth(kid.token)).send({ weekStart: 0 }).expect(403);
    await agent.put('/api/users/week-start').set(auth(admin.token)).send({ weekStart: 3 }).expect(400);
    expect((await agent.get('/api/dashboard').set(auth(admin.token)).expect(200)).body.weekStart).toBe(1);
    await agent.put('/api/users/week-start').set(auth(admin.token)).send({ weekStart: 0 }).expect(200);
    expect((await agent.get('/api/dashboard').set(auth(kid.token)).expect(200)).body.weekStart).toBe(0);
  });

  it("starts Insights' heatmap rows on the week's first day", async () => {
    const { admin, kidId, task } = await family();
    const when = homeToday(-3, 16, 30);
    done(task, kidId, when, 5);
    sundayFirst();
    const body = (await agent.get('/api/insights/heatmap').set(auth(admin.token)).expect(200)).body;
    expect(body.weekStart).toBe(0);
    expect(body.rows).toEqual([[wall(when).weekday, 3, kidId, 1, 5, 3]]);
  });
});
