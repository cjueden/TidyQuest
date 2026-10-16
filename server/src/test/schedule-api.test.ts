import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { weekNumber } from '../utils/schedule';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 86400000;

async function family() {
  const admin = await createAdmin(agent);
  const kidA = await createUser(agent, admin.token, { username: 'kida', displayName: 'Kid A', password: 'pass123', role: 'child' });
  const kidB = await createUser(agent, admin.token, { username: 'kidb', displayName: 'Kid B', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Room', roomType: 'other' })).body.id as number;
  return { admin, kidA, kidB, room };
}
const taskIn = async (token: string, id: number) =>
  ((await agent.get('/api/rooms').set(auth(token))).body as any[]).flatMap((r) => r.tasks).find((t: any) => t.id === id);

describe('Set weekdays', () => {
  it('stores the weekdays, reports the next due day, and blocks a repeat before it', async () => {
    const { admin, kidA, room } = await family();
    const inTwoDays = new Date(Date.now() + 2 * DAY).getDay();
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token))
      .send({ name: 'Bins to the curb', effort: 1, frequencyDays: 7, scheduleWeekdays: [inTwoDays] })).body.id as number;
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date().toISOString(), task);

    const t = await taskIn(kidA.token, task);
    expect(t.scheduleWeekdays).toBe(1 << inTwoDays);
    expect(new Date(t.nextDueAt).getDay()).toBe(inTwoDays);
    expect(t.health).toBeGreaterThan(90);
    const again = await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token));
    expect([again.status, again.body.error]).toEqual([409, 'not_yet_due']);
  });

  it('rejects bad weekdays and seasons', async () => {
    const { admin, room } = await family();
    const bad = (body: object) => agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'X', effort: 1, frequencyDays: 7, ...body });
    expect((await bad({ scheduleWeekdays: [7] })).body.error).toBe('invalid_weekdays');
    expect((await bad({ seasonStartMonth: 5 })).body.error).toBe('invalid_season');
    expect((await bad({ seasonStartMonth: 13, seasonEndMonth: 2 })).body.error).toBe('invalid_season');
  });
});

describe('Seasons', () => {
  it("keeps an out-of-season chore off Home's due list, and puts it back in season", async () => {
    const { admin, room } = await family();
    const month = new Date().getMonth() + 1;
    const other = ((month + 5) % 12) + 1; // a month that isn't this one
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token))
      .send({ name: 'Skim the pool', effort: 1, frequencyDays: 1, seasonStartMonth: other, seasonEndMonth: other })).body.id as number;
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date(Date.now() - 30 * DAY).toISOString(), task);
    const ready = async () => ((await agent.get('/api/dashboard').set(auth(admin.token))).body.readyToComplete as any[]).some((q) => q.id === task);

    expect(await ready()).toBe(false);
    expect((await taskIn(admin.token, task)).outOfSeason).toBe(true);
    await agent.put(`/api/tasks/${task}`).set(auth(admin.token)).send({ seasonStartMonth: month, seasonEndMonth: month }).expect(200);
    expect(await ready()).toBe(true);
  });
});

describe('Weekly rotation', () => {
  it('gives the turn by calendar week, not by who finished last', async () => {
    const { admin, kidA, kidB, room } = await family();
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({
      name: 'Feed the dogs', effort: 1, frequencyDays: 1, assignedUserIds: [kidA.user.id, kidB.user.id], assignmentMode: 'rotating', rotationPeriod: 'week',
    })).body.id as number;
    const ids = [kidA.user.id, kidB.user.id].sort((a, b) => a - b);
    const turn = ids[weekNumber() % 2];
    const [onTurn, offTurn] = turn === kidA.user.id ? [kidA, kidB] : [kidB, kidA];

    expect((await taskIn(admin.token, task)).rotationCurrentUserId).toBe(turn);
    expect((await agent.post(`/api/tasks/${task}/complete`).set(auth(offTurn.token))).body.error).toBe('not_your_turn');
    expect((await agent.post(`/api/tasks/${task}/complete`).set(auth(onTurn.token))).status).toBe(200);
    // Still the same person's turn afterwards (it changes on Monday)
    expect((await taskIn(admin.token, task)).rotationCurrentUserId).toBe(turn);
  });
});
