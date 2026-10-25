import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, homeToday } from './setup';
import { wall } from '../utils/clock';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { localDateStr } from '../utils/dateHelpers';

// "Done earlier…" (ENH-7): logging a chore late, for a day in the past week

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const daysAgo = (n: number) => localDateStr(homeToday(-n, 12));
const user = (id: number) => db.prepare('SELECT coins, currentStreak, lastActiveDate FROM users WHERE id = ?').get(id) as
  { coins: number; currentStreak: number; lastActiveDate: string | null };

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const teen = await createUser(agent, admin.token, { username: 'teen', displayName: 'Teen', password: 'pass123', role: 'member' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'kitchen' })).body.id as number;
  // Every chore was added a week and a half ago
  const added = async (body: object) => {
    const id = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ effort: 1, ...body })).body.id as number;
    db.prepare("UPDATE tasks SET createdAt = datetime('now', '-10 days') WHERE id = ?").run(id);
    return id;
  };
  const add = (body: object) => agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ effort: 1, ...body }).then((r) => r.body.id as number);
  const dishes = await added({ name: 'Dishes', frequencyDays: 1, customCoins: 6 });
  return { admin, kid, teen, add: added, addNew: add, dishes };
}
const logLate = (token: string, taskId: number, doneOn: string, extra: object = {}) =>
  agent.post(`/api/tasks/${taskId}/complete`).set(auth(token)).send({ doneOn, ...extra });
const approve = (token: string, id: number) => agent.post(`/api/completions/${id}/approve`).set(auth(token)).expect(200);
const completion = (id: number) => db.prepare('SELECT completedAt, loggedAt, status, coinsEarned FROM task_completions WHERE id = ?').get(id) as
  { completedAt: string; loggedAt: string | null; status: string; coinsEarned: number };

describe('Logging a chore late', () => {
  it("a kid's late log waits for a parent even with Strict Mode off, stored on its day", async () => {
    const { admin, kid, dishes } = await family();
    const res = await logLate(kid.token, dishes, daysAgo(1)).expect(200);
    expect(res.body).toMatchObject({ pendingApproval: true, late: true });
    const c = completion(res.body.completionId);
    expect(c.status).toBe('pending');
    expect(localDateStr(new Date(c.completedAt))).toBe(daysAgo(1));
    expect(wall(c.completedAt).hours).toBe(12);
    expect(c.loggedAt).toBeTruthy();
    expect(user(kid.user.id).coins).toBe(0);

    await approve(admin.token, res.body.completionId);
    expect(completion(res.body.completionId).status).toBe('approved');
    expect(user(kid.user.id).coins).toBe(6);
  });

  it("a member's late log waits too; a parent's own goes straight through", async () => {
    const { admin, teen, dishes } = await family();
    const teenRes = await logLate(teen.token, dishes, daysAgo(2)).expect(200);
    expect(teenRes.body.pendingApproval).toBe(true);
    const parentRes = await logLate(admin.token, dishes, daysAgo(1)).expect(200);
    expect(parentRes.body).toMatchObject({ pendingApproval: false, coinsEarned: 6, late: true });
  });

  it('a parent logging late for a kid goes straight through', async () => {
    const { admin, kid, dishes } = await family();
    const res = await logLate(admin.token, dishes, daysAgo(1), { onBehalfOfUserId: kid.user.id }).expect(200);
    expect(res.body.pendingApproval).toBe(false);
    expect(user(kid.user.id).coins).toBe(6);
  });

  it('only for the past 7 days, and not before the chore was added or its start date', async () => {
    const { admin, addNew, dishes } = await family();
    for (const day of [daysAgo(0), daysAgo(-1), daysAgo(8), 'yesterday']) {
      expect((await logLate(admin.token, dishes, day).expect(400)).body.error).toBe('invalid_done_on');
    }
    const fresh = await addNew({ name: 'New chore', frequencyDays: 1 });
    expect((await logLate(admin.token, fresh, daysAgo(1)).expect(409)).body.error).toBe('before_start');
    db.prepare('UPDATE tasks SET startsOn = ? WHERE id = ?').run(daysAgo(2), dishes);
    expect((await logLate(admin.token, dishes, daysAgo(3)).expect(409)).body.error).toBe('before_start');
    await logLate(admin.token, dishes, daysAgo(2)).expect(200);
  });

  it('not on a day it was already done (by anyone, when the first one gets it)', async () => {
    const { admin, kid, dishes } = await family();
    await logLate(admin.token, dishes, daysAgo(1)).expect(200);
    expect((await logLate(admin.token, dishes, daysAgo(1)).expect(409)).body.error).toBe('already_done_that_day');
    expect((await logLate(kid.token, dishes, daysAgo(1)).expect(409)).body.error).toBe('already_done_by_other');
  });

  it("lastCompletedAt only moves forward, and a chore that wasn't due yet can't be logged", async () => {
    const { admin, add, dishes } = await family();
    await agent.post(`/api/tasks/${dishes}/complete`).set(auth(admin.token)).expect(200);
    const last = (db.prepare('SELECT lastCompletedAt FROM tasks WHERE id = ?').get(dishes) as { lastCompletedAt: string }).lastCompletedAt;
    const res = await logLate(admin.token, dishes, daysAgo(1)).expect(200);
    expect(res.body.health).toBe(100);
    expect((db.prepare('SELECT lastCompletedAt FROM tasks WHERE id = ?').get(dishes) as { lastCompletedAt: string }).lastCompletedAt).toBe(last);

    const weekly = await add({ name: 'Mop', frequencyDays: 7 });
    await logLate(admin.token, weekly, daysAgo(3)).expect(200);
    expect((await logLate(admin.token, weekly, daysAgo(1)).expect(409)).body.error).toBe('not_yet_due');
  });

  it('pays the normal coins without double coins', async () => {
    const { admin, dishes } = await family();
    db.prepare("INSERT INTO coin_boosts (title, multiplier, startAt, endAt, createdBy) VALUES ('Double', 2, ?, ?, ?)").run(new Date(Date.now() - 3 * 86400000).toISOString(), new Date(Date.now() + 86400000).toISOString(), admin.user.id);
    expect((await agent.post(`/api/tasks/${dishes}/complete`).set(auth(admin.token)).expect(200)).body.coinsEarned).toBe(12);
    const res = await logLate(admin.token, dishes, daysAgo(1)).expect(200);
    expect(res.body.coinsEarned).toBe(6);
  });

  it("an anytime quest's repeat limit counts that day", async () => {
    const { admin, add } = await family();
    const quest = await add({ name: 'Help out', onDemand: true, customCoins: 2, repeatLimit: 1, repeatPeriod: 'day' });
    await agent.post(`/api/tasks/${quest}/complete`).set(auth(admin.token)).expect(200);
    await logLate(admin.token, quest, daysAgo(1)).expect(200);
    expect((await logLate(admin.token, quest, daysAgo(1)).expect(409)).body.error).toBe('repeat_limit_reached');
  });
});

describe('Late logs and streaks', () => {
  async function streakFamily() {
    const f = await family();
    // The dishes are overdue, so every recent day had a chore due
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date(Date.now() - 9 * 86400000).toISOString(), f.dishes);
    const quest = await f.add({ name: 'Any job', onDemand: true, customCoins: 1 });
    return { ...f, quest };
  }
  const setStreak = (id: number, streak: number, last: string) =>
    db.prepare('UPDATE users SET currentStreak = ?, lastActiveDate = ? WHERE id = ?').run(streak, last, id);

  it('a late log after the last counted day carries the streak on', async () => {
    const { admin, kid, quest } = await streakFamily();
    setStreak(kid.user.id, 4, daysAgo(2));
    await approve(admin.token, (await logLate(kid.token, quest, daysAgo(1)).expect(200)).body.completionId);
    expect(user(kid.user.id)).toMatchObject({ currentStreak: 5, lastActiveDate: daysAgo(1) });
    await agent.post(`/api/tasks/${quest}/complete`).set(auth(kid.token)).expect(200);
    expect(user(kid.user.id).currentStreak).toBe(6);
  });

  it('filling the missed days brings a broken streak back', async () => {
    const { admin, kid, quest } = await streakFamily();
    setStreak(kid.user.id, 5, daysAgo(3));
    // Today's chore first: two days were missed, so the streak restarts
    await agent.post(`/api/tasks/${quest}/complete`).set(auth(kid.token)).expect(200);
    expect(user(kid.user.id).currentStreak).toBe(1);

    await approve(admin.token, (await logLate(kid.token, quest, daysAgo(2)).expect(200)).body.completionId);
    expect(user(kid.user.id).currentStreak).toBe(1); // one day is still missing
    await approve(admin.token, (await logLate(kid.token, quest, daysAgo(1)).expect(200)).body.completionId);
    expect(user(kid.user.id)).toMatchObject({ currentStreak: 8, lastActiveDate: daysAgo(0) });
  });
});
