import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import { dateStr } from '../utils/clock';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { mascotFor, moodFor, treatAt, tummy } from '../utils/mascot';

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
      .toEqual({ creature: 'axolotl', name: 'Bubbles', bedtimeFrom: '21:00', bedtimeTo: '07:00' });

    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'other' })).body.id;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 1, frequencyDays: 1 })).body.id;
    db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 2100, 'approved')").run(task, kid.user.id, new Date().toISOString());
    expect(await mascot()).toMatchObject({ creature: 'axolotl', name: 'Bubbles', stage: 'kid', familyCoins: 2100, nextStage: { stage: 'grown', at: 5000 } });

    // A birthday today is the event of the day
    db.prepare('UPDATE users SET birthday = ? WHERE id = ?').run(dateStr().slice(5), kid.user.id);
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

  it('fills its tummy 5% per chore (a team-up once) and empties it over 2 days', async () => {
    const admin = await createAdmin(agent);
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'other' })).body.id;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 1, frequencyDays: 1 })).body.id;
    const now = new Date();
    const done = (hoursAgo: number, teamupId: number | null = null) => db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status, teamupId) VALUES (?, ?, ?, 1, 'approved', ?)")
      .run(task, admin.user.id, new Date(now.getTime() - hoursAgo * 3600000).toISOString(), teamupId);
    expect(tummy(now)).toBe(0);
    for (let i = 0; i < 3; i++) done(0);
    expect(tummy(now)).toBe(15);
    db.prepare('DELETE FROM task_completions').run();
    for (let i = 0; i < 25; i++) done(24); // full a day ago, then half a day's... a whole day of draining
    expect(tummy(now)).toBe(50);
    db.prepare('DELETE FROM task_completions').run();
    done(1, 7); done(1, 7); done(1, 7); // one team-up, three people
    expect(tummy(now)).toBe(3); // 5%, minus an hour of draining
  });

  it('cheers only for chores of 3★ effort or more; smaller ones still fill the tummy (ENH-12)', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Yard', roomType: 'other' })).body.id;
    const chore = async (name: string, effort: number) => (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name, effort, onDemand: true })).body.id;
    const bed = await chore('Make your bed', 2);
    const lawn = await chore('Mow the lawn', 3);
    const mascot = async () => (await agent.get('/api/dashboard').set(auth(kid.token))).body.mascot;

    await agent.post(`/api/tasks/${bed}/complete`).set(auth(kid.token)).expect(200);
    expect(await mascot()).toMatchObject({ tummy: 5, treatAt: null });

    // Waiting for a parent doesn't count yet; the cheer comes with the approval
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true }).expect(200);
    const id = (await agent.post(`/api/tasks/${lawn}/complete`).set(auth(kid.token))).body.completionId;
    expect((await mascot()).treatAt).toBeNull();
    await agent.post(`/api/completions/${id}/approve`).set(auth(admin.token)).expect(200);
    const approvedAt = (db.prepare('SELECT approvedAt FROM task_completions WHERE id = ?').get(id) as { approvedAt: string }).approvedAt;
    expect(await mascot()).toMatchObject({ tummy: 10, treatAt: approvedAt });

    // A team-up is one treat and one helping
    const later = new Date(Date.now() + 60000).toISOString();
    for (const userId of [admin.user.id, kid.user.id]) {
      db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status, approvedAt, teamupId) VALUES (?, ?, ?, 1, 'approved', ?, 9)")
        .run(lawn, userId, new Date().toISOString(), later);
    }
    expect(treatAt()).toBe(later);
    expect(tummy()).toBe(15);
  });

  it('sells accessories that go on right away for everyone, and only the buyer or a parent can take them off', async () => {
    const admin = await createAdmin(agent);
    const cecil = await createUser(agent, admin.token, { username: 'cecil', displayName: 'Cecil', password: 'pass123', role: 'child' });
    const cylis = await createUser(agent, admin.token, { username: 'cylis', displayName: 'Cylis', password: 'pass123', role: 'child' });
    db.prepare('UPDATE users SET coins = 6 WHERE id IN (?, ?)').run(cecil.user.id, cylis.user.id);
    const buy = (token: string, itemId: string) => agent.post('/api/mascot/buy').set(auth(token)).send({ itemId });

    // Still an egg: the shop stays shut (no peeking at what it will hatch into)
    expect((await buy(cecil.token, 'bow')).body.error).toBe('not_hatched');
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'other' })).body.id;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 1, frequencyDays: 1 })).body.id;
    db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 600, 'approved')").run(task, admin.user.id, new Date(Date.now() - 86400000).toISOString());

    expect((await buy(cecil.token, 'crown')).body.error).toBe('unknown_item');
    const first = (await buy(cecil.token, 'wizardHat')).body;
    expect([first.coins, first.outfit.head.id, first.outfit.head.byName]).toEqual([1, 'wizardHat', 'Cecil']);
    expect((await buy(cecil.token, 'cape')).body.error).toBe('not_enough_coins');
    // Cylis sees it too, and replaces it by buying another hat (no closet: the wizard hat is gone)
    expect((await agent.get('/api/dashboard').set(auth(cylis.token))).body.mascot.outfit.head.id).toBe('wizardHat');
    expect((await buy(cylis.token, 'bow')).body.outfit.head).toMatchObject({ id: 'bow', byName: 'Cylis' });
    await buy(cylis.token, 'sunglasses').expect(200);

    // Taking off: the buyer or a parent, nobody else
    expect((await agent.post('/api/mascot/take-off').set(auth(cecil.token)).send({ slot: 'head' })).body.error).toBe('not_yours');
    expect((await agent.post('/api/mascot/take-off').set(auth(cylis.token)).send({ slot: 'head' })).body.outfit.head).toBeUndefined();
    expect((await agent.post('/api/mascot/take-off').set(auth(admin.token)).send({ slot: 'face' })).body.outfit).toEqual({});

    // Purchases show in Activity
    const rows = (await agent.get('/api/history').set(auth(admin.token))).body.history.filter((h: any) => h.type === 'mascotPurchase');
    expect(rows.map((r: any) => [r.displayName, r.itemId, r.coinsEarned])).toEqual([['Cylis', 'sunglasses', -3], ['Cylis', 'bow', -1], ['Cecil', 'wizardHat', -5]]);

    // Shop switched off: no shop, no outfit, no buying
    await agent.put('/api/features').set(auth(admin.token)).send({ features: { mascotShop: false } }).expect(200);
    const m = (await agent.get('/api/dashboard').set(auth(cecil.token))).body.mascot;
    expect([m.shop, m.outfit]).toEqual([null, {}]);
    expect((await buy(cylis.token, 'bandana')).status).toBe(403);
  });

  it('keeps a family bedtime', async () => {
    const admin = await createAdmin(agent);
    expect((await agent.put('/api/features').set(auth(admin.token)).send({ mascot: { bedtimeFrom: '25:00' } })).body.error).toBe('invalid_bedtime');
    const v = (await agent.put('/api/features').set(auth(admin.token)).send({ mascot: { bedtimeFrom: '20:30', bedtimeTo: '06:45' } })).body;
    expect(v.mascot).toEqual({ creature: 'dog', name: 'Dusty', bedtimeFrom: '20:30', bedtimeTo: '06:45' });
  });

  it('swaps to a new creature as an egg, and an old one comes back with its growth, name and outfit', async () => {
    const admin = await createAdmin(agent);
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'other' })).body.id;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 1, frequencyDays: 1 })).body.id;
    const earn = (coins: number) => db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, ?, 'approved')")
      .run(task, admin.user.id, new Date(Date.now() - 3600000).toISOString(), coins);
    const mascot = async () => (await agent.get('/api/dashboard').set(auth(admin.token))).body.mascot;
    const swap = (creature: string) => agent.put('/api/features').set(auth(admin.token)).send({ mascot: { creature } });
    db.prepare('UPDATE users SET coins = 50 WHERE id = ?').run(admin.user.id);

    earn(600); // Dusty hatches and gets a hat
    await agent.post('/api/mascot/buy').set(auth(admin.token)).send({ itemId: 'wizardHat' }).expect(200);
    expect(await mascot()).toMatchObject({ creature: 'dog', name: 'Dusty', stage: 'baby', familyCoins: 600 });

    // A new creature starts over as an egg, with its own name and nothing to wear (and no shop yet)
    const view = (await swap('cat')).body;
    expect(view.mascotRoster.filter((r: any) => r.status !== 'new')).toEqual([
      { creature: 'dog', status: 'resting', name: 'Dusty', stage: 'baby' },
      { creature: 'cat', status: 'active', name: 'Whiskers', stage: 'egg' },
    ]);
    expect(await mascot()).toMatchObject({ creature: 'cat', name: 'Whiskers', stage: 'egg', familyCoins: 0, outfit: {} });
    expect((await agent.post('/api/mascot/buy').set(auth(admin.token)).send({ itemId: 'bow' })).body.error).toBe('not_hatched');
    earn(100);
    expect((await mascot()).familyCoins).toBe(100);

    // Back to Dusty: exactly where it left off (the cat's coins were the cat's), hat and all
    await swap('dog').expect(200);
    expect(await mascot()).toMatchObject({ creature: 'dog', name: 'Dusty', stage: 'baby', familyCoins: 600, outfit: { head: { id: 'wizardHat' } } });
    earn(1500);
    expect(await mascot()).toMatchObject({ stage: 'kid', familyCoins: 2100 });
    // And the cat waits with its 100
    await swap('cat').expect(200);
    expect(await mascot()).toMatchObject({ creature: 'cat', name: 'Whiskers', familyCoins: 100, stage: 'egg' });
  });
});

