import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

const DAY = 86400000;
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

async function setup() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid123', role: 'child' });
  const auth = { Authorization: `Bearer ${admin.token}` };
  const kitchen = (await agent.post('/api/rooms').set(auth).send({ name: 'Kitchen', roomType: 'other' })).body.id as number;
  const yard = (await agent.post('/api/rooms').set(auth).send({ name: 'Yard', roomType: 'other' })).body.id as number;
  const dishes = (await agent.post(`/api/rooms/${kitchen}/tasks`).set(auth).send({ name: 'Dinner Dishes', effort: 1 })).body.id as number;
  const mow = (await agent.post(`/api/rooms/${yard}/tasks`).set(auth).send({ name: 'Mow the Lawn', effort: 3 })).body.id as number;
  const pct = (await agent.post(`/api/rooms/${kitchen}/tasks`).set(auth).send({ name: 'Wipe 100% of counters', effort: 1 })).body.id as number;

  const add = (taskId: number, userId: number, offsetDays: number, status = 'approved') =>
    db.prepare('INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 5, ?)')
      .run(taskId, userId, at(offsetDays), status);
  add(dishes, admin.user.id, -1);
  add(dishes, kid.user.id, -10);
  add(mow, kid.user.id, -2);
  add(mow, kid.user.id, -3, 'pending'); // never listed
  add(pct, admin.user.id, -4);
  return { admin, kid, kitchen, yard };
}

async function history(token: string, query: Record<string, string | number> = {}) {
  const res = await agent.get('/api/history').query({ limit: 100, ...query }).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body as { history: Array<{ taskName: string; userId: number }>; total: number };
}

describe('Activity history filters', () => {
  it('lists every approved completion without filters', async () => {
    const { admin } = await setup();
    expect((await history(admin.token)).total).toBe(4);
  });

  it('filters by person', async () => {
    const { admin, kid } = await setup();
    const res = await history(admin.token, { userId: kid.user.id });
    expect(res.total).toBe(2);
    expect(res.history.every((h) => h.userId === kid.user.id)).toBe(true);
  });

  it('filters by room', async () => {
    const { admin, yard } = await setup();
    const res = await history(admin.token, { roomId: yard });
    expect(res.history.map((h) => h.taskName)).toEqual(['Mow the Lawn']);
  });

  it('filters by date range, with "to" exclusive', async () => {
    const { admin } = await setup();
    const res = await history(admin.token, { from: at(-5), to: at(-1.5) });
    expect(res.history.map((h) => h.taskName).sort()).toEqual(['Mow the Lawn', 'Wipe 100% of counters']);
  });

  it('searches task names, case-insensitively, treating % and _ literally', async () => {
    const { admin } = await setup();
    expect((await history(admin.token, { q: 'dishes' })).total).toBe(2);
    expect((await history(admin.token, { q: '100%' })).history.map((h) => h.taskName)).toEqual(['Wipe 100% of counters']);
    expect((await history(admin.token, { q: '%' })).total).toBe(1);
  });

  it('combines filters and keeps pagination totals right', async () => {
    const { admin, kid, kitchen } = await setup();
    const res = await history(admin.token, { userId: kid.user.id, roomId: kitchen, limit: 1 });
    expect(res.total).toBe(1);
    expect(res.history).toHaveLength(1);
  });

  it('ignores malformed filter values', async () => {
    const { admin } = await setup();
    expect((await history(admin.token, { userId: 'abc', from: 'not-a-date' })).total).toBe(4);
  });

  it('returns up to 2000 rows for a bounded date range (the calendar month), but caps open queries at 100', async () => {
    const { admin, kid } = await setup();
    const task = (db.prepare("SELECT id FROM tasks WHERE name = 'Mow the Lawn'").get() as { id: number }).id;
    const insert = db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 1, 'approved')");
    for (let i = 0; i < 150; i++) insert.run(task, kid.user.id, at(-20 - i / 100));
    const ranged = await history(admin.token, { limit: 2000, from: at(-30), to: at(0) });
    expect(ranged.history.length).toBeGreaterThan(100);
    const open = await history(admin.token, { limit: 2000 });
    expect(open.history).toHaveLength(100);
  });
});

