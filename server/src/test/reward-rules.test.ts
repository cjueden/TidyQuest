import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp } from './setup';
import { generateToken } from '../middleware/auth';
import { isoWeek, rotatingThisWeek } from '../utils/rewardRules';
import { localDateStr } from '../utils/dateHelpers';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Family members straight into the DB with a signed token (keeps clear of the login rate limit). */
function person(displayName: string, role: 'admin' | 'member' | 'child' = 'child', coins = 0) {
  const id = Number(db.prepare("INSERT INTO users (username, displayName, passwordHash, role, coins) VALUES (?, ?, 'x', ?, ?)")
    .run(displayName.toLowerCase(), displayName, role, coins).lastInsertRowid);
  return { id, token: generateToken(id) };
}

function family() {
  return {
    dad: person('Dad', 'admin'),
    wyatt: person('Wyatt', 'member', 1000),
    cecil: person('Cecil', 'child', 2000),
    cylis: person('Cylis', 'child', 2000),
  };
}

const coins = (userId: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number }).coins;

async function reward(adminToken: string, title: string, costCoins: number, rules?: Record<string, unknown>) {
  const id = (await agent.post('/api/rewards').set(auth(adminToken)).send({ title, costCoins })).body.id as number;
  if (rules) {
    const res = await agent.put(`/api/rewards/${id}/rules`).set(auth(adminToken)).send(rules);
    expect(res.status).toBe(200);
  }
  return id;
}

const catalog = async (token: string) => (await agent.get('/api/rewards').set(auth(token))).body.rewards as any[];
const inCatalog = async (token: string, id: number) => (await catalog(token)).find((r) => r.id === id);
const redeem = (token: string, id: number) => agent.post(`/api/rewards/${id}/redeem`).set(auth(token));
const dayOffset = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return localDateStr(d); };
const hoursAgoSql = (h: number) => new Date(Date.now() - h * 3600000).toISOString().slice(0, 19).replace('T', ' ');

describe('Who can see a reward', () => {
  it('shows a reward only to the people picked and refuses to redeem it for anyone else', async () => {
    const { dad, cecil, cylis } = family();
    const ds = await reward(dad.token, 'Nintendo DS Lite', 1250, { visibleTo: [cecil.id] });

    expect(await inCatalog(cecil.token, ds)).toBeTruthy();
    expect(await inCatalog(cylis.token, ds)).toBeUndefined();
    expect((await redeem(cylis.token, ds)).status).toBe(404);
    expect(coins(cylis.id)).toBe(2000);
    expect((await redeem(cecil.token, ds)).status).toBe(200);

    // Back to everyone
    await agent.put(`/api/rewards/${ds}/rules`).set(auth(dad.token)).send({ visibleTo: [] });
    expect(await inCatalog(cylis.token, ds)).toBeTruthy();
    expect((await agent.put(`/api/rewards/${ds}/rules`).set(auth(dad.token)).send({ visibleTo: [9999] })).status).toBe(400);
  });

  it('charges each person their own price', async () => {
    const { dad, wyatt, cecil } = family();
    const phone = await reward(dad.token, 'Cell Service (1 Month)', 50, { prices: { [wyatt.id]: 75 } });

    expect(await inCatalog(wyatt.token, phone)).toMatchObject({ costCoins: 75, regularCostCoins: 50 });
    expect(await inCatalog(cecil.token, phone)).toMatchObject({ costCoins: 50 });

    const res = await redeem(wyatt.token, phone);
    expect(res.body.redemption.costCoins).toBe(75);
    expect(coins(wyatt.id)).toBe(925);
    // Turning it down refunds what was paid
    await agent.put(`/api/rewards/redemptions/${res.body.redemption.id}`).set(auth(dad.token)).send({ status: 'rejected' });
    expect(coins(wyatt.id)).toBe(1000);

    const admin = (await agent.get('/api/rewards/admin').set(auth(dad.token))).body.rewards.find((r: any) => r.id === phone);
    expect(admin).toMatchObject({ prices: { [wyatt.id]: 75 }, visibleTo: [] });

    expect((await agent.put(`/api/rewards/${phone}/rules`).set(auth(dad.token)).send({ prices: { [wyatt.id]: 0 } })).status).toBe(400);
    await agent.put(`/api/rewards/${phone}/rules`).set(auth(dad.token)).send({ prices: { [wyatt.id]: null } });
    expect(await inCatalog(wyatt.token, phone)).toMatchObject({ costCoins: 50 });
  });

  it('keeps reward rules for parents', async () => {
    const { dad, cecil } = family();
    const id = await reward(dad.token, 'Movie Night', 50);
    expect((await agent.put(`/api/rewards/${id}/rules`).set(auth(cecil.token)).send({ isShared: true })).status).toBe(403);
    expect((await agent.put('/api/rewards/rotation-config').set(auth(cecil.token)).send({ rotatingPerWeek: 5 })).status).toBe(403);
    expect((await agent.put('/api/rewards/9999/rules').set(auth(dad.token)).send({})).status).toBe(404);
  });
});

describe('Reward limits', () => {
  it('limits redemptions per person per week; cancelled and rejected ones do not count', async () => {
    const { dad, cecil, cylis } = family();
    const screen = await reward(dad.token, 'Screen Time', 10, { limit: { count: 2, period: 'week', scope: 'person' } });

    const first = await redeem(cecil.token, screen);
    expect((await inCatalog(cecil.token, screen)).availability).toMatchObject({ limit: 2, used: 1, remaining: 1, period: 'week' });
    await agent.post(`/api/rewards/redemptions/${first.body.redemption.id}/cancel`).set(auth(cecil.token));
    expect((await inCatalog(cecil.token, screen)).availability.remaining).toBe(2);

    const a = await redeem(cecil.token, screen);
    expect((await redeem(cecil.token, screen)).status).toBe(200);
    const third = await redeem(cecil.token, screen);
    expect(third.status).toBe(409);
    expect(third.body.error).toBe('limit_reached');
    expect(coins(cecil.id)).toBe(1980);

    // Still listed (it comes back next week), with when it resets: next Monday
    const listed = await inCatalog(cecil.token, screen);
    const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7);
    expect(listed.availability).toMatchObject({ used: 2, remaining: 0, resetsAt: monday.toISOString() });
    // Per person: Cylis has her own two
    expect((await inCatalog(cylis.token, screen)).availability.remaining).toBe(2);

    await agent.put(`/api/rewards/redemptions/${a.body.redemption.id}`).set(auth(dad.token)).send({ status: 'rejected' });
    expect((await inCatalog(cecil.token, screen)).availability.remaining).toBe(1);
  });

  it('counts a limit for everyone together, per month, and forgets last month', async () => {
    const { dad, cecil, cylis } = family();
    const dinner = await reward(dad.token, 'Choose Dinner', 60, { limit: { count: 1, period: 'month', scope: 'everyone' } });
    const res = await redeem(cecil.token, dinner);
    expect((await redeem(cylis.token, dinner)).status).toBe(409);
    expect((await inCatalog(cylis.token, dinner)).availability).toMatchObject({ remaining: 0, scope: 'everyone' });

    db.prepare('UPDATE reward_redemptions SET redeemedAt = ? WHERE id = ?').run(hoursAgoSql(40 * 24), res.body.redemption.id);
    expect((await redeem(cylis.token, dinner)).status).toBe(200);
  });

  it('resets a daily limit at midnight', async () => {
    const { dad, cecil } = family();
    const treat = await reward(dad.token, 'Slushie Run', 35, { limit: { count: 1, period: 'day', scope: 'person' } });
    const res = await redeem(cecil.token, treat);
    expect((await redeem(cecil.token, treat)).status).toBe(409);
    db.prepare('UPDATE reward_redemptions SET redeemedAt = ? WHERE id = ?').run(hoursAgoSql(25), res.body.redemption.id);
    expect((await redeem(cecil.token, treat)).status).toBe(200);
  });

  it('hides a one-time reward once it is used up, and brings it back if a parent turns it down', async () => {
    const { dad, cecil } = family();
    const ds = await reward(dad.token, 'Nintendo DS Lite', 1250, { visibleTo: [cecil.id], limit: { count: 1, period: 'ever', scope: 'everyone' } });
    expect((await inCatalog(cecil.token, ds)).availability).toMatchObject({ remaining: 1, resetsAt: null });
    const res = await redeem(cecil.token, ds);
    expect(await inCatalog(cecil.token, ds)).toBeUndefined();
    expect((await agent.get('/api/rewards/admin').set(auth(dad.token))).body.rewards.some((r: any) => r.id === ds)).toBe(true);

    await agent.put(`/api/rewards/redemptions/${res.body.redemption.id}`).set(auth(dad.token)).send({ status: 'rejected' });
    expect(await inCatalog(cecil.token, ds)).toBeTruthy();
  });

  it('validates limits and clears them', async () => {
    const { dad, cecil } = family();
    const id = await reward(dad.token, 'Board Game', 25);
    const put = (limit: unknown) => agent.put(`/api/rewards/${id}/rules`).set(auth(dad.token)).send({ limit });
    expect((await put({ count: 0, period: 'week', scope: 'person' })).status).toBe(400);
    expect((await put({ count: 1, period: 'year', scope: 'person' })).status).toBe(400);
    expect((await put({ count: 1, period: 'week', scope: 'family' })).status).toBe(400);
    expect((await put({ count: 3, period: 'week', scope: 'person' })).body).toMatchObject({ limitCount: 3, limitPeriod: 'week' });
    expect((await put(null)).body.limitCount).toBe(null);
    expect((await inCatalog(cecil.token, id)).availability).toBe(null);
  });
});

describe('Scheduled and rotating rewards', () => {
  it('only offers a reward inside its date window', async () => {
    const { dad, cecil } = family();
    const id = await reward(dad.token, 'Pool Afternoon', 120, { availableFrom: dayOffset(1) });
    const rules = (body: Record<string, unknown>) => agent.put(`/api/rewards/${id}/rules`).set(auth(dad.token)).send(body);
    expect(await inCatalog(cecil.token, id)).toBeUndefined();
    expect((await redeem(cecil.token, id)).status).toBe(404);

    await rules({ availableFrom: dayOffset(0), availableUntil: dayOffset(0) });
    expect(await inCatalog(cecil.token, id)).toMatchObject({ availableUntil: dayOffset(0) });
    expect((await redeem(cecil.token, id)).status).toBe(200);

    await rules({ availableFrom: null, availableUntil: dayOffset(-1) });
    expect(await inCatalog(cecil.token, id)).toBeUndefined();

    expect((await rules({ availableFrom: dayOffset(3), availableUntil: dayOffset(2) })).status).toBe(400);
    expect((await rules({ availableFrom: '15/10/2026' })).status).toBe(400);
  });

  it('shows the same few rotating rewards all week, and as many as the setting says', async () => {
    const { dad, cecil } = family();
    const plain = await reward(dad.token, 'Ice Cream', 40);
    const dreams: number[] = [];
    for (let i = 0; i < 10; i++) dreams.push(await reward(dad.token, `Dream ${i}`, 1000000 + i, { isRotating: true }));

    const shown = async () => (await catalog(cecil.token)).filter((r) => dreams.includes(r.id)).map((r) => r.id).sort();
    const three = await shown();
    expect(three).toHaveLength(3);
    expect(await shown()).toEqual(three);
    expect((await inCatalog(cecil.token, plain))).toBeTruthy();
    const admin = (await agent.get('/api/rewards/admin').set(auth(dad.token))).body;
    expect(admin.rotatingPerWeek).toBe(3);
    expect([...admin.rotatingThisWeek].sort()).toEqual(three);

    const hidden = dreams.find((id) => !three.includes(id))!;
    expect((await redeem(cecil.token, hidden)).status).toBe(404);

    expect((await agent.put('/api/rewards/rotation-config').set(auth(dad.token)).send({ rotatingPerWeek: 5 })).body.rotatingPerWeek).toBe(5);
    const five = await shown();
    expect(five).toHaveLength(5);
    expect(three.every((id) => five.includes(id))).toBe(true);
    expect((await agent.put('/api/rewards/rotation-config').set(auth(dad.token)).send({ rotatingPerWeek: -1 })).status).toBe(400);
  });

  it('picks rotating rewards by ISO week', () => {
    family();
    const insert = db.prepare('INSERT INTO rewards (title, costCoins, isRotating) VALUES (?, 100, 1)');
    for (let i = 0; i < 10; i++) insert.run(`Dream ${i}`);

    expect(isoWeek(new Date(2026, 0, 1))).toEqual({ year: 2026, week: 1 });
    expect(isoWeek(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(new Date(2026, 9, 15))).toEqual({ year: 2026, week: 42 });

    const ids = (d: Date) => [...rotatingThisWeek(d)].sort().join(',');
    // Monday and Sunday of one week match; the weeks around it differ at least once
    expect(ids(new Date(2026, 9, 12, 0, 30))).toBe(ids(new Date(2026, 9, 18, 23, 30)));
    const weeks = new Set([0, 7, 14, 21, 28].map((d) => ids(new Date(2026, 9, 12 + d))));
    expect(weeks.size).toBeGreaterThan(1);
  });
});
