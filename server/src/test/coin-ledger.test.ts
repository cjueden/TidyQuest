import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp } from './setup';
import { generateToken } from '../middleware/auth';
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

const coins = (userId: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number }).coins;
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

describe('Coin ledger', () => {
  it('records the reason and the amount actually applied (the balance stops at 0)', async () => {
    const dad = person('Dad', 'admin');
    const cecil = person('Cecil', 'child', 30);

    let res = await agent.post(`/api/users/${cecil.id}/adjust-coins`).set(auth(dad.token)).send({ amount: 50, reason: '  Party prep  ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ coins: 80, applied: 50 });

    res = await agent.post(`/api/users/${cecil.id}/adjust-coins`).set(auth(dad.token)).send({ amount: -200, reason: 'Broken window' });
    expect(res.body).toMatchObject({ coins: 0, applied: -80 });

    // Nothing left to take: no ledger entry
    res = await agent.post(`/api/users/${cecil.id}/adjust-coins`).set(auth(dad.token)).send({ amount: -5 });
    expect(res.body).toMatchObject({ coins: 0, applied: 0 });

    const list = await agent.get(`/api/users/${cecil.id}/coin-adjustments`).set(auth(dad.token));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(2);
    expect(list.body.adjustments.map((a: any) => [a.amount, a.reason, a.createdByName])).toEqual([
      [-80, 'Broken window', 'Dad'],
      [50, 'Party prep', 'Dad'],
    ]);
  });

  it('keeps an adjustment without a reason, and refuses reasons over 200 characters', async () => {
    const dad = person('Dad', 'admin');
    const cecil = person('Cecil');
    expect((await agent.post(`/api/users/${cecil.id}/adjust-coins`).set(auth(dad.token)).send({ amount: 5, reason: 'x'.repeat(201) })).status).toBe(400);
    expect((await agent.post(`/api/users/${cecil.id}/adjust-coins`).set(auth(dad.token)).send({ amount: 5, reason: 42 })).status).toBe(400);
    expect(coins(cecil.id)).toBe(0);
    expect((await agent.post(`/api/users/${cecil.id}/adjust-coins`).set(auth(dad.token)).send({ amount: 5, reason: 'x'.repeat(200) })).status).toBe(200);
    expect((await agent.post(`/api/users/${cecil.id}/adjust-coins`).set(auth(dad.token)).send({ amount: 7 })).status).toBe(200);
    const rows = db.prepare('SELECT amount, reason, createdBy FROM coin_adjustments WHERE userId = ? ORDER BY id').all(cecil.id);
    expect(rows).toEqual([{ amount: 5, reason: 'x'.repeat(200), createdBy: dad.id }, { amount: 7, reason: null, createdBy: dad.id }]);
  });

  it('only lets parents adjust coins', async () => {
    const cecil = person('Cecil');
    const wyatt = person('Wyatt', 'member');
    expect((await agent.post(`/api/users/${cecil.id}/adjust-coins`).set(auth(wyatt.token)).send({ amount: 50 })).status).toBe(403);
    expect((await agent.post(`/api/users/${cecil.id}/adjust-coins`).set(auth(cecil.token)).send({ amount: 50 })).status).toBe(403);
    expect(coins(cecil.id)).toBe(0);
  });

  it('shows the ledger to parents and to that person only', async () => {
    const dad = person('Dad', 'admin');
    const cecil = person('Cecil');
    const cylis = person('Cylis');
    const wyatt = person('Wyatt', 'member');
    await agent.post(`/api/users/${cecil.id}/adjust-coins`).set(auth(dad.token)).send({ amount: 10, reason: 'Birthday' });

    expect((await agent.get(`/api/users/${cecil.id}/coin-adjustments`).set(auth(cecil.token))).body.total).toBe(1);
    expect((await agent.get(`/api/users/${cecil.id}/coin-adjustments`).set(auth(cylis.token))).status).toBe(403);
    expect((await agent.get(`/api/users/${cecil.id}/coin-adjustments`).set(auth(wyatt.token))).status).toBe(403);
    expect((await agent.get('/api/users/9999/coin-adjustments').set(auth(dad.token))).status).toBe(404);
  });
});

describe('Coin adjustments in Activity', () => {
  /** Two completions and two adjustments on different days, newest first: cylis adj, cylis done, cecil adj, cecil done */
  function seed() {
    const dad = person('Dad', 'admin');
    const cecil = person('Cecil');
    const cylis = person('Cylis');
    const room = Number(db.prepare("INSERT INTO rooms (name, roomType) VALUES ('Kitchen', 'kitchen')").run().lastInsertRowid);
    const task = Number(db.prepare("INSERT INTO tasks (roomId, name, effort) VALUES (?, 'Wash Dishes', 1)").run(room).lastInsertRowid);
    const done = db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, ?, 'approved')");
    done.run(task, cecil.id, daysAgo(3), 10);
    done.run(task, cylis.id, daysAgo(1), 5);
    const adj = db.prepare('INSERT INTO coin_adjustments (userId, amount, reason, createdBy, createdAt) VALUES (?, ?, ?, ?, ?)');
    adj.run(cecil.id, 50, 'Party prep', dad.id, daysAgo(2));
    adj.run(cylis.id, -10, 'Lost the remote', dad.id, daysAgo(0.01));
    return { dad, cecil, cylis, room };
  }

  const get = (token: string, query = '') => agent.get(`/api/history${query}`).set(auth(token));

  it('merges adjustments with completions by date and keeps totals and pages right', async () => {
    const { dad, cecil, cylis } = seed();
    const all = await get(dad.token);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(4);
    expect(all.body.history.map((h: any) => [h.type, h.userId, h.coinsEarned])).toEqual([
      ['adjustment', cylis.id, -10],
      ['completion', cylis.id, 5],
      ['adjustment', cecil.id, 50],
      ['completion', cecil.id, 10],
    ]);
    expect(all.body.history[2]).toMatchObject({ reason: 'Party prep', createdByName: 'Dad', displayName: 'Cecil' });

    const page1 = await get(dad.token, '?limit=2&offset=0');
    const page2 = await get(dad.token, '?limit=2&offset=2');
    expect(page1.body.total).toBe(4);
    expect(page2.body.total).toBe(4);
    expect([...page1.body.history, ...page2.body.history].map((h: any) => `${h.type}:${h.id}`))
      .toEqual(all.body.history.map((h: any) => `${h.type}:${h.id}`));
  });

  it('applies the person, date and search filters to adjustments and leaves them out for a room', async () => {
    const { dad, cecil, room } = seed();
    const mine = await get(dad.token, `?userId=${cecil.id}`);
    expect(mine.body.history.map((h: any) => h.type)).toEqual(['adjustment', 'completion']);

    const range = await get(dad.token, `?from=${encodeURIComponent(daysAgo(2.5))}&to=${encodeURIComponent(daysAgo(0.5))}`);
    expect(range.body.total).toBe(2);
    expect(range.body.history.map((h: any) => [h.type, h.displayName])).toEqual([['completion', 'Cylis'], ['adjustment', 'Cecil']]);

    const party = await get(dad.token, '?q=party');
    expect(party.body.history.map((h: any) => [h.type, h.reason])).toEqual([['adjustment', 'Party prep']]);
    expect((await get(dad.token, '?q=dish')).body.history.every((h: any) => h.type === 'completion')).toBe(true);

    const inRoom = await get(dad.token, `?roomId=${room}`);
    expect(inRoom.body.total).toBe(2);
    expect(inRoom.body.history.every((h: any) => h.type === 'completion')).toBe(true);
  });

  it("shows a kid their own adjustments but not their sibling's", async () => {
    const { cecil, cylis } = seed();
    const res = await get(cecil.token);
    expect(res.body.total).toBe(3);
    expect(res.body.history.filter((h: any) => h.type === 'adjustment').map((h: any) => h.userId)).toEqual([cecil.id]);
    expect((await get(cecil.token, `?userId=${cylis.id}`)).body.history.map((h: any) => h.type)).toEqual(['completion']);
  });
});
