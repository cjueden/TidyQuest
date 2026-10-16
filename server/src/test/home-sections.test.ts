import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 86400000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'House', roomType: 'other' })).body.id as number;
  const mk = async (name: string, body: object) => (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name, effort: 1, ...body })).body.id as number;
  const done = (taskId: number, userId: number, when: string) =>
    db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 1, 'approved')").run(taskId, userId, when);
  return { admin, kid, room, mk, done };
}
const dash = async (token: string) => (await agent.get('/api/dashboard').set(auth(token))).body;

describe('Your usual', () => {
  it('lists pins first, then what this person did most in the last 30 days', async () => {
    const { kid, mk, done } = await family();
    const feed = await mk('Feed the dogs', { onDemand: true });
    const bus = await mk('Made the bus', { onDemand: true });
    const once = await mk('Water plants', { onDemand: true });
    const old = await mk('Old habit', { onDemand: true });
    for (const d of [1, 2, 3]) done(feed, kid.user.id, ago(d));
    for (const d of [1, 2]) done(bus, kid.user.id, ago(d));
    done(once, kid.user.id, ago(1)); // only once: not "usual"
    for (const d of [40, 41, 42]) done(old, kid.user.id, ago(d)); // too long ago
    expect((await dash(kid.token)).usualQuests.map((q: any) => [q.name, q.pinned])).toEqual([['Feed the dogs', false], ['Made the bus', false]]);

    await agent.post(`/api/tasks/${once}/pin`).set(auth(kid.token)).expect(200);
    expect((await dash(kid.token)).usualQuests.map((q: any) => [q.name, q.pinned])).toEqual([['Water plants', true], ['Feed the dogs', false], ['Made the bus', false]]);
    const rooms = (await agent.get('/api/rooms').set(auth(kid.token))).body;
    expect(rooms[0].tasks.find((t: any) => t.id === once).pinned).toBe(true);
    await agent.delete(`/api/tasks/${once}/pin`).set(auth(kid.token)).expect(200);
    expect((await dash(kid.token)).usualQuests.map((q: any) => q.name)).toEqual(['Feed the dogs', 'Made the bus']);
  });
});

describe('Maybe you forgot about these', () => {
  it('lists chores overdue by at least their own interval, worst first, and honours a snooze', async () => {
    const { kid, mk } = await family();
    const weekly = await mk('Clean the fridge', { frequencyDays: 7 });
    const daily = await mk('Wipe counters', { frequencyDays: 1 });
    const fresh = await mk('Vacuum', { frequencyDays: 7 });
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(ago(16), weekly); // 9 days overdue: > 1 interval
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(ago(5), daily);   // 4 days overdue: 4 intervals
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(ago(10), fresh);  // 3 days overdue: < 1 interval
    let d = await dash(kid.token);
    expect(d.forgottenQuests.map((q: any) => [q.name, q.overdueDays])).toEqual([['Wipe counters', 4], ['Clean the fridge', 9]]);

    await agent.post(`/api/tasks/${daily}/snooze`).set(auth(kid.token)).send({ days: 3 }).expect(200);
    d = await dash(kid.token);
    expect(d.forgottenQuests.map((q: any) => q.name)).toEqual(['Clean the fridge']);
    void fresh;
  });

  it('counts a never-done chore from when it was added', async () => {
    const { kid, mk } = await family();
    const t = await mk('Clean the gutters', { frequencyDays: 30 });
    expect((await dash(kid.token)).forgottenQuests).toEqual([]);
    db.prepare("UPDATE tasks SET createdAt = datetime('now', '-31 days') WHERE id = ?").run(t);
    expect((await dash(kid.token)).forgottenQuests.map((q: any) => q.name)).toEqual(['Clean the gutters']);
  });
});
