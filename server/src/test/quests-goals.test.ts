import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, homeToday } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { sendCoinBoostNotificationsIfNeeded } from '../utils/boosts';
import { currentLocalWeek } from '../utils/periods';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const HOUR = 3600000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const mkRoom = async (name: string) => (await agent.post('/api/rooms').set(auth(admin.token)).send({ name, roomType: 'other' })).body.id as number;
  return { admin, kid, room: await mkRoom('Quests'), otherRoom: await mkRoom('Yard') };
}
const coins = (userId: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number }).coins;

describe('Repeat limits on anytime quests', () => {
  it('stops a second completion in the same week, counting ones still waiting for approval', async () => {
    const { admin, kid, room } = await family();
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token))
      .send({ name: 'All homework turned in', effort: 1, onDemand: true, repeatLimit: 1, repeatPeriod: 'week' })).body.id as number;

    expect((await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token))).body.pendingApproval).toBe(true);
    const again = await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token));
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: 'repeat_limit_reached', limit: 1, period: 'week', count: 1 });

    const rooms = (await agent.get('/api/rooms').set(auth(kid.token))).body;
    const t = rooms.flatMap((r: any) => r.tasks).find((x: any) => x.id === task);
    expect([t.repeatLimit, t.repeatPeriod, t.myRepeatCount]).toEqual([1, 'week', 1]);
  });

  it('counts from the start of the day for a daily limit, and can be cleared', async () => {
    const { admin, kid, room } = await family();
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token))
      .send({ name: 'Made the bus', effort: 1, onDemand: true, repeatLimit: 1, repeatPeriod: 'day' })).body.id as number;
    // Yesterday's completion doesn't count today
    db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 1, 'approved')")
      .run(task, kid.user.id, new Date(homeToday().getTime() - HOUR).toISOString());
    expect((await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token))).status).toBe(200);
    expect((await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token))).status).toBe(409);

    await agent.put(`/api/tasks/${task}`).set(auth(admin.token)).send({ repeatLimit: null }).expect(200);
    expect((await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token))).status).toBe(200);
  });

  it('rejects bad values', async () => {
    const { admin, room } = await family();
    const res = await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'X', effort: 1, onDemand: true, repeatLimit: 2, repeatPeriod: 'month' });
    expect(res.status).toBe(400);
  });
});

describe('Double coins events', () => {
  it('multiplies coins in the chosen rooms while it runs, and keeps the boost through a later approval', async () => {
    const { admin, kid, room, otherRoom } = await family();
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
    const inRoom = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Tidy', effort: 1, onDemand: true, customCoins: 10 })).body.id as number;
    const elsewhere = (await agent.post(`/api/rooms/${otherRoom}/tasks`).set(auth(admin.token)).send({ name: 'Rake', effort: 1, onDemand: true, customCoins: 10 })).body.id as number;
    expect((await agent.post('/api/boosts').set(auth(kid.token)).send({ title: 'Party prep', multiplier: 2, startAt: at(-HOUR), endAt: at(HOUR) })).status).toBe(403);
    const boost = await agent.post('/api/boosts').set(auth(admin.token)).send({ title: 'Party prep', multiplier: 2, startAt: at(-HOUR), endAt: at(HOUR), roomIds: [room] });
    expect(boost.status).toBe(201);

    const a = (await agent.post(`/api/tasks/${inRoom}/complete`).set(auth(kid.token))).body.completionId;
    const b = (await agent.post(`/api/tasks/${elsewhere}/complete`).set(auth(kid.token))).body.completionId;
    const earned = (id: number) => (db.prepare('SELECT coinsEarned FROM task_completions WHERE id = ?').get(id) as { coinsEarned: number }).coinsEarned;
    expect([earned(a), earned(b)]).toEqual([20, 10]);

    // The event ends before the parent approves: the stored, boosted amount is still paid
    db.prepare('UPDATE coin_boosts SET endAt = ?').run(at(-1000));
    const before = coins(kid.user.id);
    await agent.post(`/api/completions/${a}/approve`).set(auth(admin.token)).expect(200);
    expect(coins(kid.user.id) - before).toBe(20);
  });

  it('can be aimed at chosen chores as well as rooms', async () => {
    const { admin, kid, room, otherRoom } = await family();
    const task = async (roomId: number, name: string) =>
      (await agent.post(`/api/rooms/${roomId}/tasks`).set(auth(admin.token)).send({ name, effort: 1, onDemand: true, customCoins: 10 })).body.id as number;
    const inRoom = await task(room, 'Tidy');
    const picked = await task(otherRoom, 'Clean Shower & Tub');
    const nextToIt = await task(otherRoom, 'Rake');
    expect((await agent.post('/api/boosts').set(auth(admin.token)).send({ title: 'Party prep', multiplier: 2, startAt: at(-HOUR), endAt: at(HOUR), taskIds: [99999] })).body.error).toBe('Task not found');
    const boost = (await agent.post('/api/boosts').set(auth(admin.token))
      .send({ title: 'Party prep', multiplier: 2, startAt: at(-HOUR), endAt: at(HOUR), roomIds: [room], taskIds: [picked, picked] })).body;
    expect([boost.roomIds, boost.taskIds]).toEqual([[room], [picked]]);

    const dash = (await agent.get('/api/dashboard').set(auth(kid.token))).body;
    expect(dash.coinBoosts.map((x: any) => [x.taskIds, x.taskNames])).toEqual([[[picked], ['Clean Shower & Tub']]]);
    const earned = async (taskId: number) => (await agent.post(`/api/tasks/${taskId}/complete`).set(auth(kid.token))).body.coinsEarned;
    expect([await earned(inRoom), await earned(picked), await earned(nextToIt)]).toEqual([20, 20, 10]);

    // The start notification names the room and the chore
    for (const [key, value] of [['notificationsEnabled', '1'], ['ntfyEnabled', '1'], ['ntfyTopic', 'family']]) {
      db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
    }
    const sent: string[] = [];
    await sendCoinBoostNotificationsIfNeeded(new Date(), async (m) => { sent.push(m); return true; });
    expect(sent[0]).toContain('(Quests, Clean Shower & Tub)');

    // Dropping the chore leaves just the room
    const updated = (await agent.put(`/api/boosts/${boost.id}`).set(auth(admin.token)).send({ taskIds: [] })).body;
    expect([updated.roomIds, updated.taskIds]).toEqual([[room], null]);
  });

  it('shows running events on Home and nothing once they end', async () => {
    const { admin, kid } = await family();
    await agent.post('/api/boosts').set(auth(admin.token)).send({ title: 'Party prep', multiplier: 3, startAt: at(-HOUR), endAt: at(HOUR) });
    await agent.post('/api/boosts').set(auth(admin.token)).send({ title: 'Next week', multiplier: 2, startAt: at(24 * HOUR), endAt: at(30 * HOUR) });
    const dash = (await agent.get('/api/dashboard').set(auth(kid.token))).body;
    expect(dash.coinBoosts.map((x: any) => [x.title, x.multiplier, x.roomIds])).toEqual([['Party prep', 3, null]]);
  });

  it('notifies once when an event starts and once in its last hour', async () => {
    const { admin } = await family();
    for (const [key, value] of [['notificationsEnabled', '1'], ['ntfyEnabled', '1'], ['ntfyTopic', 'family']]) {
      db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
    }
    await agent.post('/api/boosts').set(auth(admin.token)).send({ title: 'Party prep', multiplier: 2, startAt: at(-HOUR), endAt: at(3 * HOUR) });
    const sent: string[] = [];
    const send = async (m: string) => { sent.push(m); return true; };
    await sendCoinBoostNotificationsIfNeeded(new Date(), send);
    await sendCoinBoostNotificationsIfNeeded(new Date(), send);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('2× coins');
    await sendCoinBoostNotificationsIfNeeded(new Date(Date.now() + 2.5 * HOUR), send);
    await sendCoinBoostNotificationsIfNeeded(new Date(Date.now() + 2.6 * HOUR), send);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain('Last hour');
  });
});

describe('Goals that repeat weekly, and the bonus', () => {
  it("sets up this week's goal from last week's on its own, once", async () => {
    const { admin, kid } = await family();
    const week = currentLocalWeek();
    const lastStart = new Date(new Date(week.startAt).getTime() - 7 * 24 * HOUR).toISOString();
    const lastEnd = new Date(new Date(week.startAt).getTime() - 1).toISOString();
    db.prepare('INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt, rewardCoins, repeatWeekly) VALUES (?, ?, ?, ?, ?, ?, 1)')
      .run(kid.user.id, 'Weekly Win · week of Oct 5', 135, lastStart, lastEnd, 20);

    await agent.get('/api/dashboard').set(auth(kid.token));
    await agent.get('/api/dashboard').set(auth(kid.token));
    const goals = db.prepare('SELECT title, goalCoins, rewardCoins, repeatWeekly, startAt FROM user_goals WHERE userId = ? ORDER BY startAt').all(kid.user.id) as any[];
    expect(goals).toHaveLength(2);
    expect(goals[1]).toMatchObject({ goalCoins: 135, rewardCoins: 20, repeatWeekly: 1 });
    expect(goals[1].title).toMatch(/^Weekly Win · week of /);
    expect(goals[0].repeatWeekly).toBe(0);
    const dash = (await agent.get('/api/dashboard').set(auth(kid.token))).body;
    expect(dash.myGoal).toMatchObject({ goalCoins: 135, rewardCoins: 20 });
    void admin;
  });

  it('pays the bonus once when the goal is reached and records it in the coin history', async () => {
    const { admin, kid, room } = await family();
    const week = currentLocalWeek();
    await agent.post(`/api/users/${kid.user.id}/goals`).set(auth(admin.token))
      .send({ title: 'Weekly Win', goalCoins: 10, startAt: week.startAt, endAt: week.endAt, rewardCoins: 25 }).expect(201);
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Big job', effort: 1, onDemand: true, customCoins: 12 })).body.id as number;
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).expect(200);
    const before = coins(kid.user.id);
    await agent.get('/api/dashboard').set(auth(kid.token));
    await agent.get('/api/dashboard').set(auth(kid.token));
    expect(coins(kid.user.id) - before).toBe(25);
    const ledger = db.prepare('SELECT amount, reason FROM coin_adjustments WHERE userId = ?').all(kid.user.id);
    expect(ledger).toEqual([{ amount: 25, reason: 'Goal reached: Weekly Win' }]);
  });

  it('lets a parent edit the bonus and the repeat setting', async () => {
    const { admin, kid } = await family();
    const goal = (await agent.post(`/api/users/${kid.user.id}/goals`).set(auth(admin.token)).send({ title: 'Weekly Win', goalCoins: 100, repeatWeekly: true })).body;
    expect(goal.repeatWeekly).toBe(1);
    expect(goal.endAt).toBeTruthy(); // a repeating goal without dates covers this week
    const res = await agent.put(`/api/users/goals/${goal.id}`).set(auth(admin.token))
      .send({ title: 'Weekly Win', goalCoins: 110, startAt: goal.startAt, endAt: goal.endAt, rewardCoins: 15, repeatWeekly: false });
    expect(res.body).toMatchObject({ goalCoins: 110, rewardCoins: 15, repeatWeekly: 0 });
  });
});
