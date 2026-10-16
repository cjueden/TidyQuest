import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { mascotFor, moodFor } from '../utils/mascot';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;
beforeEach(() => {
  ({ agent, db } = createTestApp());
});
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('House mascot', () => {
  it('starts as an egg, can be renamed by a parent, and grows with the family coins', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
    const mascot = async () => (await agent.get('/api/dashboard').set(auth(kid.token))).body.mascot;
    expect(await mascot()).toMatchObject({ creature: 'dog', name: 'Dusty', stage: 'egg', familyCoins: 0, nextStage: { stage: 'baby', at: 500 } });

    expect((await agent.put('/api/features').set(auth(kid.token)).send({ mascot: { creature: 'cat' } })).status).toBe(403);
    expect((await agent.put('/api/features').set(auth(admin.token)).send({ mascot: { creature: 'unicorn' } })).body.error).toBe('invalid_creature');
    expect((await agent.put('/api/features').set(auth(admin.token)).send({ mascot: { creature: 'axolotl', name: 'Bubbles' } })).body.mascot)
      .toEqual({ creature: 'axolotl', name: 'Bubbles' });

    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'other' })).body.id;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 1, frequencyDays: 1 })).body.id;
    db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 2100, 'approved')").run(task, kid.user.id, new Date().toISOString());
    expect(await mascot()).toMatchObject({ creature: 'axolotl', name: 'Bubbles', stage: 'kid', familyCoins: 2100, nextStage: { stage: 'grown', at: 5000 } });

    // A birthday today is the event of the day
    const d = new Date();
    db.prepare('UPDATE users SET birthday = ? WHERE id = ?').run(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, kid.user.id);
    expect(await mascot()).toMatchObject({ event: 'birthday', birthdayName: 'Kid' });

    await agent.put('/api/features').set(auth(admin.token)).send({ features: { mascot: false } }).expect(200);
    expect(await mascot()).toBeNull();
  });

  it('feels like the house and asks for help with the messiest room only when things get messy', () => {
    expect([moodFor(90), moodFor(80), moodFor(60), moodFor(40), moodFor(10)]).toEqual(['happy', 'happy', 'fine', 'messy', 'sad']);
    const rooms = [{ id: 1, name: 'Kitchen', health: 70 }, { id: 2, name: 'Bathroom', health: 20 }];
    expect(mascotFor({ houseHealth: 45, rooms, rescueDone: false }).messiestRoom).toEqual({ id: 2, name: 'Bathroom' });
    expect(mascotFor({ houseHealth: 85, rooms, rescueDone: true })).toMatchObject({ messiestRoom: null, mood: 'happy', event: 'rescue' });
  });
});
