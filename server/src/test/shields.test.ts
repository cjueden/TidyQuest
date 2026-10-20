import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { localDateStr } from '../utils/dateHelpers';
import { setNotifyTransport, type Delivery } from '../utils/notify';
import { nextStreak, settleStreak } from '../utils/streaks';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;
let sent: Delivery[];

beforeEach(() => {
  ({ agent, db } = createTestApp());
  sent = [];
  setNotifyTransport(async (d) => { sent.push(d); return { ok: true }; });
});
afterEach(() => setNotifyTransport());

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return localDateStr(d); };
const kidRow = (id: number) => db.prepare('SELECT coins, currentStreak, lastActiveDate, streakShields FROM users WHERE id = ?').get(id) as
  { coins: number; currentStreak: number; lastActiveDate: string; streakShields: number };
const setKid = (id: number, f: { streak?: number; last?: string; shields?: number; coins?: number }) =>
  db.prepare('UPDATE users SET currentStreak = COALESCE(?, currentStreak), lastActiveDate = COALESCE(?, lastActiveDate), streakShields = COALESCE(?, streakShields), coins = COALESCE(?, coins) WHERE id = ?')
    .run(f.streak ?? null, f.last ?? null, f.shields ?? null, f.coins ?? null, id);
const events = (userId: number) => db.prepare('SELECT kind, count, coins, streak FROM streak_shield_events WHERE userId = ? ORDER BY id').all(userId);

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Quests', roomType: 'other' })).body.id as number;
  const quest = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Any job', effort: 1, onDemand: true, customCoins: 5 })).body.id as number;
  // A daily chore nobody has done for days, so every recent day had something due
  const daily = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Bins out', effort: 1, frequencyDays: 1 })).body.id as number;
  db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date(Date.now() - 6 * 86400000).toISOString(), daily);
  return { admin, kid, quest };
}
const complete = (token: string, taskId: number) => agent.post(`/api/tasks/${taskId}/complete`).set(auth(token)).expect(200);

describe('Streak shields', () => {
  it('earns one at every 7th day of a streak, up to 2', async () => {
    const { kid, quest } = await family();
    setKid(kid.user.id, { streak: 6, last: daysAgo(1) });
    await complete(kid.token, quest);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 7, streakShields: 1 });

    setKid(kid.user.id, { streak: 13, last: daysAgo(1) });
    await complete(kid.token, quest);
    setKid(kid.user.id, { streak: 20, last: daysAgo(1) });
    await complete(kid.token, quest);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 21, streakShields: 2 });
    expect(events(kid.user.id)).toEqual([
      { kind: 'earned', count: 1, coins: 0, streak: 7 },
      { kind: 'earned', count: 1, coins: 0, streak: 14 },
    ]);
  });

  it('uses a shield for a missed day: the streak carries on without counting it', async () => {
    const { kid, quest } = await family();
    setKid(kid.user.id, { streak: 12, last: daysAgo(2), shields: 1 });
    expect(settleStreak(kid.user.id)).toBe(1);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 12, lastActiveDate: daysAgo(1), streakShields: 0 });
    expect(events(kid.user.id)).toEqual([{ kind: 'used', count: 1, coins: 0, streak: 12 }]);

    await complete(kid.token, quest);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 13, streakShields: 0 });
  });

  it('tells the person when a shield saves the streak', async () => {
    const { kid } = await family();
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('notificationsEnabled', '1'), ('ntfyEnabled', '1'), ('ntfyTopic', 'family')").run();
    db.prepare("UPDATE users SET ntfyTopic = 'kid-topic' WHERE id = ?").run(kid.user.id);
    setKid(kid.user.id, { streak: 12, last: daysAgo(2), shields: 1 });
    settleStreak(kid.user.id);
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.map((d) => [d.target, d.message])).toEqual([['kid-topic', '🛡️ Your shield saved your 12-day streak!']]);
  });

  it('needs a shield for each missed day', async () => {
    const { kid, quest } = await family();
    setKid(kid.user.id, { streak: 12, last: daysAgo(3), shields: 2 });
    expect(settleStreak(kid.user.id)).toBe(2);
    await complete(kid.token, quest);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 13, streakShields: 0 });
  });

  it('keeps the shield when there are too few to save the streak', async () => {
    const { kid, quest } = await family();
    setKid(kid.user.id, { streak: 12, last: daysAgo(3), shields: 1 });
    expect(settleStreak(kid.user.id)).toBe(0);
    await complete(kid.token, quest);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 1, streakShields: 1 });
    expect(events(kid.user.id)).toEqual([]);
  });

  it('counts a chore waiting for approval as done that day', async () => {
    const { kid, quest } = await family();
    setKid(kid.user.id, { streak: 12, last: daysAgo(2), shields: 1 });
    const yesterdayNoon = new Date(`${daysAgo(1)}T12:00:00`).toISOString();
    db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 5, 'pending')").run(quest, kid.user.id, yesterdayNoon);
    expect(settleStreak(kid.user.id)).toBe(0);
    expect(nextStreak(kid.user.id, 12, daysAgo(2), daysAgo(0))).toBe(13);
    expect(kidRow(kid.user.id).streakShields).toBe(1);
  });

  it('buys a shield with coins, at the price set in Features, up to 2', async () => {
    const { admin, kid } = await family();
    setKid(kid.user.id, { coins: 60, streak: 3, last: daysAgo(0) });
    const bought = await agent.post('/api/shields/buy').set(auth(kid.token)).expect(200);
    expect(bought.body).toEqual({ shields: 1, coins: 35 });

    await agent.put('/api/features').set(auth(admin.token)).send({ shieldPrice: 10 }).expect(200);
    expect((await agent.post('/api/shields/buy').set(auth(kid.token)).expect(200)).body).toEqual({ shields: 2, coins: 25 });
    expect((await agent.post('/api/shields/buy').set(auth(kid.token)).expect(400)).body.error).toBe('shields_full');
    expect(events(kid.user.id)).toEqual([
      { kind: 'bought', count: 1, coins: 25, streak: 3 },
      { kind: 'bought', count: 1, coins: 10, streak: 3 },
    ]);
    await agent.put('/api/features').set(auth(admin.token)).send({ shieldPrice: 0 }).expect(400);
  });

  it("won't buy without enough coins", async () => {
    const { kid } = await family();
    setKid(kid.user.id, { coins: 20 });
    expect((await agent.post('/api/shields/buy').set(auth(kid.token)).expect(400)).body.error).toBe('not_enough_coins');
    expect(kidRow(kid.user.id)).toMatchObject({ coins: 20, streakShields: 0 });
  });

  it('a shield bought after a missed day covers it', async () => {
    const { kid } = await family();
    setKid(kid.user.id, { coins: 30, streak: 9, last: daysAgo(2) });
    await agent.post('/api/shields/buy').set(auth(kid.token)).expect(200);
    expect(kidRow(kid.user.id)).toMatchObject({ coins: 5, currentStreak: 9, lastActiveDate: daysAgo(1), streakShields: 0 });
  });

  it('parents can give one; kids cannot', async () => {
    const { admin, kid } = await family();
    expect((await agent.post('/api/shields/give').set(auth(admin.token)).send({ userId: kid.user.id }).expect(200)).body.shields).toBe(1);
    await agent.post('/api/shields/give').set(auth(kid.token)).send({ userId: kid.user.id }).expect(403);
    await agent.post('/api/shields/give').set(auth(admin.token)).send({ userId: kid.user.id }).expect(200);
    expect((await agent.post('/api/shields/give').set(auth(admin.token)).send({ userId: kid.user.id }).expect(400)).body.error).toBe('shields_full');
    expect(db.prepare("SELECT COUNT(*) AS n FROM streak_shield_events WHERE kind = 'given' AND byUserId = ?").get(admin.user.id)).toEqual({ n: 2 });
  });

  it('shows in Activity to the person and parents only', async () => {
    const { admin, kid } = await family();
    const other = await createUser(agent, admin.token, { username: 'kid2', displayName: 'Kid Two', password: 'pass123', role: 'child' });
    await agent.post('/api/shields/give').set(auth(admin.token)).send({ userId: kid.user.id }).expect(200);
    const shieldsIn = async (token: string) => ((await agent.get('/api/history').set(auth(token))).body.history as any[]).filter((h) => h.type === 'shield');
    const mine = await shieldsIn(kid.token);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ shieldKind: 'given', shieldCount: 1 });
    expect(mine[0].createdByName).toBeTruthy();
    expect(mine[0].coinsEarned === 0).toBe(true);
    expect(await shieldsIn(admin.token)).toHaveLength(1);
    expect(await shieldsIn(other.token)).toHaveLength(0);
  });

  it('does nothing when switched off', async () => {
    const { admin, kid, quest } = await family();
    await agent.put('/api/features').set(auth(admin.token)).send({ features: { shields: false } }).expect(200);
    setKid(kid.user.id, { coins: 100, streak: 6, last: daysAgo(1) });
    await complete(kid.token, quest);
    expect(kidRow(kid.user.id)).toMatchObject({ currentStreak: 7, streakShields: 0 });
    expect((await agent.post('/api/shields/buy').set(auth(kid.token)).expect(400)).body.error).toBe('shields_off');
    expect((await agent.get('/api/dashboard').set(auth(kid.token))).body.shields).toBeNull();
  });
});
