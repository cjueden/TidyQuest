import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import { dayAt } from '../utils/clock';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { localDateStr } from '../utils/dateHelpers';
import { resumeDuePauses } from '../utils/pause';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const dayFromNow = (n: number) => localDateStr(new Date(Date.now() + n * 86400000));

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Pool', roomType: 'other' })).body.id as number;
  const add = async (name: string, health: number) => (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token))
    .send({ name, effort: 2, frequencyDays: 7, health })).body.id as number;
  const skim = await add('Skim the pool', 0); // overdue
  const sweep = await add('Sweep the deck', 100);
  return { admin, kid, room, skim, sweep };
}
const dash = async (token: string) => (await agent.get('/api/dashboard').set(auth(token))).body;
const roomTasks = async (token: string, room: number) => ((await agent.get('/api/rooms').set(auth(token))).body as any[]).find((r) => r.id === room)?.tasks ?? [];
const roomHealth = async (token: string, room: number) => ((await agent.get('/api/rooms').set(auth(token))).body as any[]).find((r) => r.id === room)?.health;

describe('Pausing a chore (ENH-1)', () => {
  it('drops it from every list and health; parents still see it in its room; Done is refused', async () => {
    const { admin, kid, room, skim } = await family();
    expect((await dash(kid.token)).readyToComplete.some((q: any) => q.id === skim)).toBe(true);
    expect(await roomHealth(admin.token, room)).toBe(50);

    await agent.post(`/api/tasks/${skim}/pause`).set(auth(kid.token)).send({}).expect(403);
    const paused = await agent.post(`/api/tasks/${skim}/pause`).set(auth(admin.token)).send({}).expect(200);
    expect(paused.body.pausedAt).toBeTruthy();
    expect(paused.body.pausedUntil).toBeNull();

    const d = await dash(kid.token);
    expect(d.readyToComplete.some((q: any) => q.id === skim)).toBe(false);
    expect(d.rooms.find((r: any) => r.id === room).health).toBe(100);
    expect((await agent.get('/api/tasks/overdue').set(auth(admin.token))).body.some((t: any) => t.id === skim)).toBe(false);
    expect((await roomTasks(kid.token, room)).map((t: any) => t.name)).toEqual(['Sweep the deck']);
    expect((await agent.get(`/api/rooms/${room}/tasks`).set(auth(kid.token))).body.map((t: any) => t.name)).toEqual(['Sweep the deck']);

    // Parents: still listed (greyed in the room), but it doesn't pull the room down
    const mine = await roomTasks(admin.token, room);
    expect(mine.find((t: any) => t.id === skim)?.pausedAt).toBeTruthy();
    expect(await roomHealth(admin.token, room)).toBe(100);
    expect((await agent.get(`/api/rooms/${room}/tasks`).set(auth(admin.token))).body.find((t: any) => t.id === skim)?.teamUp).toBeNull();

    const done = await agent.post(`/api/tasks/${skim}/complete`).set(auth(kid.token)).send({});
    expect([done.status, done.body.error]).toEqual([409, 'paused']);
  });

  it('comes back fresh when switched back on', async () => {
    const { admin, kid, room, skim } = await family();
    await agent.post(`/api/tasks/${skim}/pause`).set(auth(admin.token)).send({}).expect(200);
    const back = await agent.delete(`/api/tasks/${skim}/pause`).set(auth(admin.token)).expect(200);
    expect(back.body.pausedAt).toBeNull();
    const task = (await roomTasks(kid.token, room)).find((t: any) => t.id === skim);
    expect(task.health).toBe(100);
    expect((await dash(kid.token)).readyToComplete.some((q: any) => q.id === skim)).toBe(false); // not overdue
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_completions WHERE taskId = ?').get(skim)).toEqual({ n: 0 }); // no fake completion
  });

  it('"Pause until" a day switches it back on by itself', async () => {
    const { admin, skim } = await family();
    for (const bad of [dayFromNow(0), dayFromNow(-2), 'Nov 1', '2026-13-01']) {
      const r = await agent.post(`/api/tasks/${skim}/pause`).set(auth(admin.token)).send({ until: bad });
      expect([bad, r.status, r.body.error]).toEqual([bad, 400, 'invalid_paused_until']);
    }
    const until = dayFromNow(5);
    await agent.post(`/api/tasks/${skim}/pause`).set(auth(admin.token)).send({ until }).expect(200);
    expect(resumeDuePauses()).toBe(0);
    expect(resumeDuePauses(new Date(Date.now() + 4 * 86400000))).toBe(0);
    expect(resumeDuePauses(dayAt(until, 0, 5))).toBe(1);
    expect(db.prepare('SELECT pausedAt, pausedUntil FROM tasks WHERE id = ?').get(skim)).toEqual({ pausedAt: null, pausedUntil: null });
  });

  it('the chore editor sets it; a save without `paused` (the plan sync) leaves it alone', async () => {
    const { admin, skim } = await family();
    const save = (body: object) => agent.put(`/api/tasks/${skim}`).set(auth(admin.token)).send({ name: 'Skim the pool', effort: 2, frequencyDays: 7, ...body });
    const row = () => db.prepare('SELECT pausedAt IS NOT NULL AS paused, pausedUntil FROM tasks WHERE id = ?').get(skim);

    await save({ paused: true, pausedUntil: dayFromNow(10) }).expect(200);
    expect(row()).toEqual({ paused: 1, pausedUntil: dayFromNow(10) });
    await save({ notes: 'Net in the shed' }).expect(200);
    expect(row()).toEqual({ paused: 1, pausedUntil: dayFromNow(10) });
    await save({ paused: true, pausedUntil: '' }).expect(200); // no end date any more
    expect(row()).toEqual({ paused: 1, pausedUntil: null });
    expect((await save({ paused: true, pausedUntil: dayFromNow(-1) })).body.error).toBe('invalid_paused_until');
    await save({ paused: false }).expect(200);
    expect(row()).toEqual({ paused: 0, pausedUntil: null });
  });
});

describe('Hiding a reward (ENH-1)', () => {
  it('a save without isActive keeps it hidden; kids never see it, parents do', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
    const id = (await agent.post('/api/rewards').set(auth(admin.token)).send({ title: 'Pool party', costCoins: 50 })).body.id as number;
    await agent.put(`/api/rewards/${id}`).set(auth(admin.token)).send({ title: 'Pool party', costCoins: 50, isActive: false }).expect(200);
    await agent.put(`/api/rewards/${id}`).set(auth(admin.token)).send({ title: 'Pool party', costCoins: 60 }).expect(200);
    expect(db.prepare('SELECT isActive, costCoins FROM rewards WHERE id = ?').get(id)).toEqual({ isActive: 0, costCoins: 60 });
    expect((await agent.get('/api/rewards').set(auth(kid.token))).body.rewards.some((r: any) => r.id === id)).toBe(false);
    expect((await agent.get('/api/rewards/admin').set(auth(admin.token))).body.rewards.find((r: any) => r.id === id)?.isActive).toBe(0);
    await agent.put(`/api/rewards/${id}`).set(auth(admin.token)).send({ title: 'Pool party', costCoins: 60, isActive: true }).expect(200);
    expect((await agent.get('/api/rewards').set(auth(kid.token))).body.rewards.some((r: any) => r.id === id)).toBe(true);
  });
});
