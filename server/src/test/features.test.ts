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
const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

describe('Settings → Features', () => {
  it('switches extras off for everyone, and sets the Rescue Mission multiplier', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'House', roomType: 'other' })).body.id;
    const chore = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Wipe counters', effort: 1, frequencyDays: 1, customCoins: 10 })).body.id;
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(ago(5), chore);
    await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Fix the door', effort: 1, oneTime: true });

    // The test setup starts with the Rescue Mission off; turn it on at 3×
    expect((await agent.put('/api/features').set(auth(kid.token)).send({ features: { rescue: true } })).status).toBe(403);
    const on = (await agent.put('/api/features').set(auth(admin.token)).send({ features: { rescue: true }, rescueMultiplier: 3 })).body;
    expect(on).toEqual({ features: { rescue: true, usual: true, forgot: true, todos: true, boardAwards: true, levels: true, nextBadge: true, seasonal: true, cheers: true, mascot: true }, rescueMultiplier: 3, holidaysOff: [], mascot: { creature: 'dog', name: 'Dusty' } });
    expect((await agent.get('/api/features').set(auth(kid.token))).body.rescueMultiplier).toBe(3);
    let d = (await agent.get('/api/dashboard').set(auth(kid.token))).body;
    expect(d.rescueMission).toMatchObject({ taskId: chore, multiplier: 3 });
    expect(d.forgottenQuests).toEqual([]); // the only forgotten chore is the mission
    expect(d.todoQuests).toHaveLength(1);
    expect(d.myLevel).not.toBeNull();
    expect((await agent.put('/api/features').set(auth(admin.token)).send({ rescueMultiplier: 10 })).body.error).toBe('invalid_multiplier');

    await agent.put('/api/features').set(auth(admin.token))
      .send({ features: { rescue: false, todos: false, levels: false, nextBadge: false, boardAwards: false } }).expect(200);
    d = (await agent.get('/api/dashboard').set(auth(kid.token))).body;
    expect([d.rescueMission, d.todoQuests, d.myLevel, d.nextBadge]).toEqual([null, [], null, null]);
    expect(d.forgottenQuests.map((q: any) => q.id)).toEqual([chore]);
    const board = (await agent.get('/api/leaderboard/board').set(auth(kid.token))).body;
    expect([board.awardsEnabled, board.awards, board.trophies.weeks]).toEqual([false, [], []]);
    const ach = (await agent.get('/api/achievements').set(auth(kid.token))).body.me;
    expect([ach.level, ach.nextBadge]).toEqual([null, null]);
  });

  it('switches seasonal styling and single holidays off, and lets each person keep their own colors', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
    let d = (await agent.get('/api/dashboard').set(auth(kid.token))).body;
    expect([d.features.seasonal, d.holidaysOff]).toEqual([true, []]);

    expect((await agent.put('/api/features').set(auth(kid.token)).send({ holidaysOff: ['halloween'] })).status).toBe(403);
    expect((await agent.put('/api/features').set(auth(admin.token)).send({ holidaysOff: ['groundhog'] })).body.error).toBe('invalid_holiday');
    const v = (await agent.put('/api/features').set(auth(admin.token)).send({ holidaysOff: ['christmas', 'christmas'] })).body;
    expect(v.holidaysOff).toEqual(['christmas']);
    await agent.put('/api/features').set(auth(admin.token)).send({ features: { seasonal: false } }).expect(200);
    d = (await agent.get('/api/dashboard').set(auth(kid.token))).body;
    expect([d.features.seasonal, d.holidaysOff]).toEqual([false, ['christmas']]);

    // Holiday colors are on by default; a kid can keep their own theme instead
    expect((await agent.get('/api/auth/me').set(auth(kid.token))).body.holidayColors).toBe(1);
    const me = (await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(kid.token)).send({ holidayColors: false })).body;
    expect(me.holidayColors).toBe(0);
  });
});
