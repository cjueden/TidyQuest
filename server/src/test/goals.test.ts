import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

const DAY = 86400000;
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

// Weekly windows relative to "now": last week ended 2 days ago, this week runs -2d..+5d
const LAST_WEEK = { startAt: at(-9), endAt: at(-2) };
const THIS_WEEK = { startAt: at(-2), endAt: at(5) };
const NEXT_WEEK = { startAt: at(5), endAt: at(12) };

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

async function setup() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid123', role: 'child' });
  const room = await agent.post('/api/rooms').set('Authorization', `Bearer ${admin.token}`).send({ name: 'Room', roomType: 'other' });
  const task = await agent.post(`/api/rooms/${room.body.id}/tasks`).set('Authorization', `Bearer ${admin.token}`).send({ name: 'Chore', effort: 1 });
  return { admin, kid, taskId: task.body.id as number };
}

function addGoal(userId: number, goalCoins: number, window: { startAt: string; endAt: string }, rewardCoins = 0) {
  return db.prepare(
    'INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt, rewardCoins) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, 'Weekly Win', goalCoins, window.startAt, window.endAt, rewardCoins).lastInsertRowid as number;
}

/** Simulate the stale cache the old code left behind: users row still points at last week's goal. */
function cacheGoal(userId: number, goalCoins: number, window: { startAt: string; endAt: string }) {
  db.prepare('UPDATE users SET goalCoins = ?, goalStartAt = ?, goalEndAt = ? WHERE id = ?')
    .run(goalCoins, window.startAt, window.endAt, userId);
}

function earn(userId: number, taskId: number, coins: number, offsetDays: number) {
  db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, ?, 'approved')")
    .run(taskId, userId, at(offsetDays), coins);
}

async function dashboard(token: string) {
  const res = await agent.get('/api/dashboard').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body;
}

describe('Weekly goals on the dashboard', () => {
  it('rolls over to the current week without any goal being edited', async () => {
    const { kid, taskId } = await setup();
    addGoal(kid.user.id, 135, LAST_WEEK);
    addGoal(kid.user.id, 135, THIS_WEEK);
    addGoal(kid.user.id, 135, NEXT_WEEK);
    cacheGoal(kid.user.id, 135, LAST_WEEK);
    earn(kid.user.id, taskId, 50, -5); // last week
    earn(kid.user.id, taskId, 20, -1); // this week

    const { myGoal } = await dashboard(kid.token);
    expect(myGoal.goalStartAt).toBe(THIS_WEEK.startAt);
    expect(myGoal.currentCoins).toBe(20);
    expect(myGoal.completed).toBe(false);
  });

  it('keeps a goal reached mid-week on screen as completed instead of jumping to next week', async () => {
    const { kid, taskId } = await setup();
    const thisWeek = addGoal(kid.user.id, 30, THIS_WEEK);
    addGoal(kid.user.id, 30, NEXT_WEEK);
    earn(kid.user.id, taskId, 35, -1);

    const { myGoal } = await dashboard(kid.token);
    expect(myGoal.goalStartAt).toBe(THIS_WEEK.startAt);
    expect(myGoal.completed).toBe(true);
    expect(myGoal.progress).toBe(100);
    const row = db.prepare('SELECT status FROM user_goals WHERE id = ?').get(thisWeek) as { status: string };
    expect(row.status).toBe('completed');
  });

  it('still reports completed when every week has the same target', async () => {
    const { kid, taskId } = await setup();
    addGoal(kid.user.id, 135, THIS_WEEK);
    addGoal(kid.user.id, 135, NEXT_WEEK);
    earn(kid.user.id, taskId, 140, -1);

    const { myGoal } = await dashboard(kid.token);
    expect(myGoal.completed).toBe(true);
  });

  it("rolls over the children's goals card for a parent too", async () => {
    const { admin, kid, taskId } = await setup();
    addGoal(kid.user.id, 110, LAST_WEEK);
    addGoal(kid.user.id, 110, THIS_WEEK);
    cacheGoal(kid.user.id, 110, LAST_WEEK);
    earn(kid.user.id, taskId, 15, -1);

    const { childrenGoals } = await dashboard(admin.token);
    const card = childrenGoals.find((c: any) => c.id === kid.user.id);
    expect(card.goalStartAt).toBe(THIS_WEEK.startAt);
    expect(card.currentCoins).toBe(15);
  });

  it('shows no goal once every goal has ended', async () => {
    const { kid } = await setup();
    addGoal(kid.user.id, 135, LAST_WEEK);
    cacheGoal(kid.user.id, 135, LAST_WEEK);

    const { myGoal } = await dashboard(kid.token);
    expect(myGoal).toBeNull();
  });

  it('shows the next upcoming goal when none is running yet', async () => {
    const { kid } = await setup();
    addGoal(kid.user.id, 135, NEXT_WEEK);

    const { myGoal } = await dashboard(kid.token);
    expect(myGoal.goalStartAt).toBe(NEXT_WEEK.startAt);
    expect(myGoal.currentCoins).toBe(0);
  });

  it('pays a goal bonus only once across repeated dashboard loads', async () => {
    const { kid, taskId } = await setup();
    addGoal(kid.user.id, 10, THIS_WEEK, 25);
    earn(kid.user.id, taskId, 12, -1);
    const before = (db.prepare('SELECT coins FROM users WHERE id = ?').get(kid.user.id) as { coins: number }).coins;

    await dashboard(kid.token);
    await dashboard(kid.token);
    await dashboard(kid.token);

    const after = (db.prepare('SELECT coins FROM users WHERE id = ?').get(kid.user.id) as { coins: number }).coins;
    expect(after - before).toBe(25);
  });
});
