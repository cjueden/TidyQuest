import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, homeToday } from './setup';
import { at as homeAt, wall } from '../utils/clock';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { startOfLocalWeek } from '../utils/periods';
import { customWindow, grainFor, heatSlot, periodWindow, snapshotOverdueChores } from '../utils/insights';
import { localDateStr } from '../utils/dateHelpers';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'kitchen' })).body.id as number;
  const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 3, frequencyDays: 1 })).body.id as number;
  return { admin, kid, room, task };
}

const done = (taskId: number, userId: number, at: Date, coins: number, status = 'approved') =>
  db.prepare('INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, ?, ?)')
    .run(taskId, userId, at.toISOString(), coins, status);

/** Local time `days` after this week's Monday at `hour`:`minute`. */
const thisWeek = (days: number, hour: number, minute = 0) => {
  const w = wall(startOfLocalWeek());
  return homeAt(w.year, w.month, w.date + days, hour, minute);
};

describe('insights', () => {
  it('is for parents only', async () => {
    const { kid } = await family();
    await agent.get('/api/insights/bars').set(auth(kid.token)).expect(403);
    await agent.get('/api/insights/heatmap').set(auth(kid.token)).expect(403);
  });

  it('groups a week by local day; pending counts as done but pays no coins yet; rejected is left out', async () => {
    const { admin, kid, task } = await family();
    const kidId = kid.user.id as number;
    done(task, kidId, thisWeek(0, 10), 5);
    done(task, kidId, thisWeek(0, 10, 30), 3, 'pending');
    done(task, kidId, thisWeek(1, 9), 5, 'rejected');
    done(task, kidId, thisWeek(-7, 0, 1), 4); // last week's Monday, just after midnight
    done(task, kidId, new Date(Date.now() - 7 * 86400000 + 60000), 2); // a week ago, a minute later than now: not yet

    const res = await agent.get('/api/insights/bars?period=week').set(auth(admin.token)).expect(200);
    expect(res.body.buckets).toHaveLength(7);
    expect(res.body.rows).toEqual([[0, kidId, task, 2, 5, 6]]);
    // This week so far vs last week up to the same moment
    expect(res.body.previousSoFar).toBe(true);
    expect(res.body.previous).toEqual([[kidId, 1, 4, 3]]);
    expect(res.body.tasks).toEqual([expect.objectContaining({ id: task, name: 'Dishes' })]);

    const last = await agent.get('/api/insights/bars?period=week&offset=-1').set(auth(admin.token)).expect(200);
    expect(last.body.previousSoFar).toBe(false);
    // Viewing last week itself counts all of it
    expect(last.body.rows.reduce((n: number, r: number[]) => n + r[3], 0)).toBe(2);
    // Future periods are clamped to the current one
    const future = await agent.get('/api/insights/bars?period=week&offset=3').set(auth(admin.token)).expect(200);
    expect(future.body.start).toBe(res.body.start);

    // A picked day shows the week holding it; a day in the future shows this week
    const wed = localDateStr(thisWeek(-5, 12));
    const picked = await agent.get(`/api/insights/bars?period=week&date=${wed}`).set(auth(admin.token)).expect(200);
    expect(picked.body.start).toBe(last.body.start);
    expect(picked.body.previousSoFar).toBe(false);
    const ahead = await agent.get(`/api/insights/bars?period=week&date=${localDateStr(thisWeek(20, 12))}`).set(auth(admin.token)).expect(200);
    expect(ahead.body.start).toBe(res.body.start);
  });

  it('builds day, month and year windows', () => {
    const now = homeAt(2026, 2, 15, 12); // 15 March 2026
    expect(periodWindow('day', 0, now).buckets).toHaveLength(24);
    const feb = periodWindow('month', -1, now);
    expect(feb.buckets).toHaveLength(28);
    expect(wall(feb.start).month).toBe(1);
    const dec = periodWindow('month', -3, now);
    expect([wall(dec.start).year, wall(dec.start).month]).toEqual([2025, 11]);
    expect(periodWindow('year', 0, now).buckets).toHaveLength(12);
    expect(periodWindow('year', 0, now).grain).toBe('month');
  });

  it('sizes custom ranges: hours, days, weeks (from Mondays) or months, at most 3 years', () => {
    expect([grainFor(2), grainFor(3), grainFor(62), grainFor(63), grainFor(366), grainFor(367)])
      .toEqual(['hour', 'day', 'day', 'week', 'week', 'month']);
    const two = customWindow(homeAt(2026, 2, 10, 12), homeAt(2026, 2, 11, 12));
    expect([two.grain, two.buckets.length]).toEqual(['hour', 48]);
    const tenDays = customWindow(homeAt(2026, 2, 20, 12), homeAt(2026, 2, 11, 12)); // either order
    expect([tenDays.grain, tenDays.buckets.length]).toEqual(['day', 10]);
    // Wed 1 Apr to Sun 28 Jun 2026: a part week, then 12 Mondays
    const spring = customWindow(homeAt(2026, 3, 1, 12), homeAt(2026, 5, 28, 12));
    expect(spring.grain).toBe('week');
    expect(spring.buckets).toHaveLength(13);
    expect(wall(spring.buckets[1]).weekday).toBe(1);
    const long = customWindow(homeAt(2018, 0, 1, 12), homeAt(2026, 0, 1, 12));
    expect(long.grain).toBe('month');
    expect(wall(long.start).year).toBe(2023);
  });

  it('takes a custom From–To range and compares it with the same number of days before', async () => {
    const { admin, kid, task } = await family();
    const kidId = kid.user.id as number;
    const day = (n: number) => homeToday(-n, 10);
    done(task, kidId, day(12), 3);
    done(task, kidId, day(25), 3); // in the 14 days before
    const res = await agent.get(`/api/insights/bars?period=custom&from=${localDateStr(day(13))}&to=${localDateStr(day(0))}`).set(auth(admin.token)).expect(200);
    expect(res.body.period).toBe('custom');
    expect(res.body.grain).toBe('day');
    expect(res.body.buckets).toHaveLength(14);
    expect(res.body.rows).toEqual([[1, kidId, task, 1, 3, 3]]);
    expect(res.body.previousSoFar).toBe(true);
    expect(res.body.previous).toEqual([[kidId, 1, 3, 3]]);
    const skipped = await agent.get(`/api/insights/skipped?period=custom&from=${localDateStr(day(13))}&to=${localDateStr(day(0))}`).set(auth(admin.token)).expect(200);
    expect(skipped.body.start).toBe(res.body.start);
  });

  it('puts the heatmap into weekday × time-of-day slots over 4 or 12 weeks', async () => {
    const { admin, kid, task } = await family();
    const kidId = kid.user.id as number;
    const at = (daysAgo: number, hour: number) => homeToday(-daysAgo, hour, 30);
    const afternoon = at(3, 16);
    done(task, kidId, afternoon, 5);
    done(task, kidId, at(3, 2), 5); // 2:30 am lands in the night slot
    done(task, kidId, at(40, 8), 5); // only in the 12-week window

    expect(heatSlot(homeAt(2026, 0, 1, 23))).toBe(5);
    expect(heatSlot(homeAt(2026, 0, 1, 6))).toBe(0);
    const weekday = (wall(afternoon).weekday + 6) % 7;
    const four = await agent.get('/api/insights/heatmap').set(auth(admin.token)).expect(200);
    expect(four.body.weeks).toBe(4);
    expect(four.body.rows).toEqual(expect.arrayContaining([[weekday, 3, kidId, 1, 5, 3], [weekday, 5, kidId, 1, 5, 3]]));
    expect(four.body.rows).toHaveLength(2);
    const twelve = await agent.get('/api/insights/heatmap?weeks=12').set(auth(admin.token)).expect(200);
    expect(twelve.body.rows).toHaveLength(3);
    // Ending a month ago: only the old one
    const older = await agent.get(`/api/insights/heatmap?end=${localDateStr(at(30, 12))}`).set(auth(admin.token)).expect(200);
    expect(older.body.rows).toEqual([[(wall(at(40, 8)).weekday + 6) % 7, 0, kidId, 1, 5, 3]]);
  });

  it('records chores left overdue once a day', async () => {
    const { admin, task, room } = await family();
    const fresh = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Wipe table', effort: 1, frequencyDays: 7 })).body.id as number;
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date(Date.now() - 4 * 86400000).toISOString(), task);
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date().toISOString(), fresh);

    const quest = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Any job', effort: 1, onDemand: true, customCoins: 5 })).body.id as number;
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date(Date.now() - 9 * 86400000).toISOString(), quest);

    expect(snapshotOverdueChores()).toBe(1); // not the anytime quest
    expect(db.prepare("SELECT value FROM app_settings WHERE key = 'overdueSnapshotSince'").get()).toBeTruthy();
    const rows = db.prepare('SELECT taskId, roomId, daysOverdue FROM chore_overdue_days').all() as Array<{ taskId: number; roomId: number; daysOverdue: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ taskId: task, roomId: room });
    expect(rows[0].daysOverdue).toBeGreaterThanOrEqual(2);
    expect(snapshotOverdueChores()).toBe(0); // already taken today
  });

  describe('skipped and late chores', () => {
    /** Last week's day (0 = Monday) at hour:minute, local time. */
    const lastWeek = (days: number, hour: number, minute = 0) => thisWeek(days - 7, hour, minute);
    const setMode = (taskId: number, mode: string, userIds: number[]) => {
      db.prepare('UPDATE tasks SET assignmentMode = ? WHERE id = ?').run(mode, taskId);
      db.prepare('DELETE FROM task_assignees WHERE taskId = ?').run(taskId);
      for (const u of userIds) db.prepare('INSERT INTO task_assignees (taskId, userId) VALUES (?, ?)').run(taskId, u);
    };

    it('works out lateness from the completion before, per person for shared chores', async () => {
      const { admin, kid, room, task } = await family();
      const kidId = kid.user.id as number;
      const kid2 = (await createUser(agent, admin.token, { username: 'kid2', displayName: 'Kid 2', password: 'pass123', role: 'child' })).user.id as number;
      setMode(task, 'first', [kidId]); // daily, assigned to one kid: not an open pool
      done(task, kidId, lastWeek(-1, 10), 3); // the Sunday before
      done(task, kidId, lastWeek(0, 10), 3); // on time
      done(task, kidId, lastWeek(3, 9), 3); // due Tuesday, done Thursday: 2 days late

      const shared = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Make bed', effort: 1, frequencyDays: 1 })).body.id as number;
      setMode(shared, 'shared', [kidId, kid2]);
      done(shared, kidId, lastWeek(-1, 9), 1);
      done(shared, kid2, lastWeek(-3, 9), 1);
      done(shared, kidId, lastWeek(0, 9), 1); // on time for this kid
      done(shared, kid2, lastWeek(0, 9, 1), 1); // 2 days late for the other

      const res = await agent.get('/api/insights/skipped?period=week&offset=-1').set(auth(admin.token)).expect(200);
      expect(res.body.late).toEqual(expect.arrayContaining([
        [task, kidId, 2, 1, 2, 2],
        [shared, kidId, 1, 0, 0, 0],
        [shared, kid2, 1, 1, 2, 2],
      ]));
      expect(res.body.waits).toEqual([]);
      expect(res.body.tasks.find((t: { id: number }) => t.id === task)).toMatchObject({ pool: false, assignees: [kidId], roomId: room });
    });

    it('measures how long open-pool chores waited, and counts a team-up once', async () => {
      const { admin, kid, room } = await family();
      const kidId = kid.user.id as number;
      const pool = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Walk dog', effort: 2, frequencyDays: 1 })).body.id as number;
      setMode(pool, 'first', []);
      done(pool, kidId, lastWeek(-1, 8), 4);
      done(pool, kidId, lastWeek(0, 14), 2); // due Monday 8:00, taken at 14:00
      done(pool, admin.user.id as number, new Date(lastWeek(0, 14).getTime() + 5000), 2); // team-up partner

      const res = await agent.get('/api/insights/skipped?period=week&offset=-1').set(auth(admin.token)).expect(200);
      expect(res.body.waits).toEqual([[pool, 1, 6, 6]]);
      expect(res.body.late).toEqual([[pool, kidId, 1, 0, 0, 0]]);
    });

    it('reads "left overdue" from the snapshot and lists open pools still waiting now', async () => {
      const { admin, room, task } = await family();
      const pool = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Take out bins', effort: 1, frequencyDays: 1 })).body.id as number;
      setMode(pool, 'first', []);
      db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date(Date.now() - 3 * 86400000).toISOString(), pool);
      const snap = db.prepare('INSERT INTO chore_overdue_days (day, taskId, roomId, dueAt, daysOverdue) VALUES (?, ?, ?, ?, ?)');
      snap.run(localDateStr(lastWeek(1, 12)), task, room, lastWeek(0, 0).toISOString(), 1);
      snap.run(localDateStr(lastWeek(2, 12)), task, room, lastWeek(0, 0).toISOString(), 2);
      snap.run(localDateStr(lastWeek(-2, 12)), task, room, lastWeek(-3, 0).toISOString(), 1); // the week before

      const last = await agent.get('/api/insights/skipped?period=week&offset=-1').set(auth(admin.token)).expect(200);
      expect(last.body.undone).toEqual([[task, 2, 2]]);
      expect(last.body.waitingNow).toEqual([]);

      const now = await agent.get('/api/insights/skipped?period=week').set(auth(admin.token)).expect(200);
      expect(now.body.waitingNow).toHaveLength(1);
      expect(now.body.waitingNow[0][0]).toBe(pool);
      expect(now.body.waitingNow[0][1]).toBeGreaterThan(24);
    });
  });

  describe('coins in and out', () => {
    it('gathers every coin in and out per week, leaving out refunds and pending coins', async () => {
      const { admin, kid, task } = await family();
      const kidId = kid.user.id as number;
      const now = new Date(Date.now() - 60000);
      done(task, kidId, now, 10);
      done(task, kidId, now, 5, 'pending'); // not paid yet
      db.prepare('INSERT INTO coin_adjustments (userId, amount, reason, createdBy, createdAt) VALUES (?, ?, ?, ?, ?)').run(kidId, 7, 'Bonus', admin.user.id, now.toISOString());
      db.prepare('INSERT INTO coin_adjustments (userId, amount, reason, createdBy, createdAt) VALUES (?, ?, ?, ?, ?)').run(kidId, -3, 'Oops', admin.user.id, now.toISOString());
      const reward = (title: string, cost: number) => Number(db.prepare('INSERT INTO rewards (title, costCoins, isActive) VALUES (?, ?, 1)').run(title, cost).lastInsertRowid);
      const movie = reward('Movie night', 20);
      const candy = reward('Candy', 15);
      const pizza = reward('Pizza', 30);
      reward('Never wanted', 99);
      const redeem = (rewardId: number, cost: number, status: string) =>
        Number(db.prepare('INSERT INTO reward_redemptions (rewardId, userId, costCoins, status) VALUES (?, ?, ?, ?)').run(rewardId, kidId, cost, status).lastInsertRowid);
      const movieId = redeem(movie, 20, 'requested');
      redeem(candy, 15, 'rejected'); // refunded
      const potId = redeem(pizza, 30, 'approved'); // a full shared pot: its chip-ins are the spending
      db.prepare('INSERT INTO reward_contributions (rewardId, userId, amount, redemptionId, createdAt) VALUES (?, ?, ?, ?, ?)').run(pizza, kidId, 12, potId, now.toISOString());
      db.prepare('INSERT INTO reward_contributions (rewardId, userId, amount, redemptionId, createdAt) VALUES (?, ?, ?, ?, ?)').run(pizza, admin.user.id, 18, potId, now.toISOString());
      db.prepare('INSERT INTO mascot_purchases (userId, itemId, price, createdAt) VALUES (?, ?, ?, ?)').run(kidId, 'hat', 4, now.toISOString());
      db.prepare("INSERT INTO streak_shield_events (userId, kind, coins, createdAt) VALUES (?, 'bought', 6, ?)").run(kidId, now.toISOString());
      db.prepare("INSERT INTO streak_shield_events (userId, kind, coins, createdAt) VALUES (?, 'earned', 0, ?)").run(kidId, now.toISOString());
      db.prepare('INSERT INTO user_goals (userId, title, goalCoins, startAt, repeatWeekly) VALUES (?, ?, ?, ?, 1)').run(kidId, 'Weekly', 100, startOfLocalWeek().toISOString());
      // Last week's copy (its repeat flag moved on) and a long savings goal, which isn't weekly
      const lastMonday = thisWeek(-7, 0);
      db.prepare('INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt) VALUES (?, ?, ?, ?, ?)')
        .run(kidId, 'Weekly', 90, lastMonday.toISOString(), new Date(startOfLocalWeek().getTime() - 1).toISOString());
      db.prepare('INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt) VALUES (?, ?, ?, ?, ?)')
        .run(kidId, 'Bike', 500, thisWeek(-14, 0).toISOString(), thisWeek(30, 0).toISOString());

      const res = await agent.get('/api/insights/coins').set(auth(admin.token)).expect(200);
      expect(res.body.weeks).toBe(8);
      expect(res.body.starts).toHaveLength(8);
      const mine = Object.fromEntries(res.body.flows.filter((f: unknown[]) => f[1] === kidId).map((f: unknown[]) => [f[2], [f[0], f[3]]]));
      expect(mine).toEqual({
        chores: [7, 10], bonus: [7, 7], adjust: [7, 3], rewards: [7, 20], chipins: [7, 12], mascot: [7, 4], shields: [7, 6],
      });
      expect(res.body.goals).toEqual([[7, kidId, 100], [6, kidId, 90]]);
      expect(res.body.bought).toEqual(expect.arrayContaining([[movie, kidId, movieId, 20], [pizza, kidId, potId, 12], [pizza, admin.user.id, potId, 18]]));
      expect(res.body.bought).toHaveLength(3);
      expect(res.body.rewards.map((r: { title: string }) => r.title)).toContain('Never wanted');
      expect(res.body.people.find((p: { id: number }) => p.id === kidId)).toHaveProperty('balance');

      // Ending last week: this week's coins are the net change since, for working balances back
      const before = await agent.get(`/api/insights/coins?end=${localDateStr(thisWeek(-3, 12))}`).set(auth(admin.token)).expect(200);
      expect(before.body.flows.filter((f: unknown[]) => f[1] === kidId)).toEqual([]);
      expect(before.body.afterNet).toEqual(expect.arrayContaining([[kidId, 10 + 7 - 3 - 20 - 12 - 4 - 6]]));
      expect(res.body.afterNet).toEqual([]);
      const long = await agent.get('/api/insights/coins?weeks=26').set(auth(admin.token)).expect(200);
      expect(long.body.starts).toHaveLength(26);
      await agent.get('/api/insights/coins').set(auth(kid.token)).expect(403);
    });
  });
});
