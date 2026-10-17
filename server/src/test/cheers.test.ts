import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { setNotifyTransport, type Delivery } from '../utils/notify';

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
const setting = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
const coins = (userId: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number }).coins;

async function family() {
  const admin = await createAdmin(agent);
  const cecil = await createUser(agent, admin.token, { username: 'cecil', displayName: 'Cecil', password: 'pass123', role: 'child' });
  const cylis = await createUser(agent, admin.token, { username: 'cylis', displayName: 'Cylis', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Bathroom', roomType: 'other' })).body.id as number;
  const chore = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Clean Shower', effort: 1, onDemand: true, customCoins: 12 })).body.id as number;
  return { admin, cecil, cylis, chore };
}

describe('Cheers', () => {
  it("lets others cheer a finished chore once, change or take it back, and tells the person who did it", async () => {
    const { admin, cecil, cylis, chore } = await family();
    for (const [k, v] of [['notificationsEnabled', '1'], ['ntfyEnabled', '1'], ['ntfyTopic', 'family']]) setting(k, v);
    db.prepare("UPDATE users SET ntfyTopic = 'cecil-phone' WHERE id = ?").run(cecil.user.id);
    const completionId = (await agent.post(`/api/tasks/${chore}/complete`).set(auth(cecil.token))).body.completionId as number;
    const cheer = (token: string, emoji: string) => agent.post('/api/cheers').set(auth(token)).send({ completionId, emoji });

    expect((await cheer(cecil.token, '👏')).body.error).toBe('own_chore');
    expect((await cheer(cylis.token, '🍕')).body.error).toBe('invalid_emoji');
    expect((await cheer(cylis.token, '👏')).body.cheers).toEqual({ counts: [{ emoji: '👏', count: 1, names: ['Cylis'] }], mine: '👏' });
    await cheer(admin.token, '👏').expect(200);
    expect((await cheer(cylis.token, '💪')).body.cheers.counts.map((c: any) => [c.emoji, c.count])).toEqual([['👏', 1], ['💪', 1]]);

    // Only the first cheer from each person is a message, and only to Cecil's own phone
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.filter((d) => d.target === 'cecil-phone').map((d) => d.message)).toEqual(['👏 Cylis cheered your “Clean Shower”', '👏 Admin cheered your “Clean Shower”']);
    expect(sent.filter((d) => d.target === 'family')).toHaveLength(0);

    // Shown on Home's "Completed today" and in Activity, with the viewer's own cheer
    const today = (await agent.get('/api/dashboard').set(auth(cylis.token))).body.completedToday;
    expect(today[0]).toMatchObject({ completionId, cheers: { mine: '💪' } });
    const row = (await agent.get('/api/history').set(auth(admin.token))).body.history.find((h: any) => h.type === 'completion' && h.id === completionId);
    expect(row.cheers.mine).toBe('👏');

    // The same emoji again takes it back
    expect((await cheer(cylis.token, '💪')).body.cheers).toMatchObject({ mine: null, counts: [{ emoji: '👏', count: 1 }] });

    // Switched off: no cheers anywhere
    await agent.put('/api/features').set(auth(admin.token)).send({ features: { cheers: false } }).expect(200);
    expect((await cheer(cylis.token, '🎉')).status).toBe(403);
    expect((await agent.get('/api/dashboard').set(auth(cylis.token))).body.completedToday[0].cheers).toBeUndefined();
  });

  it('lets a parent add a note and an "above and beyond" bonus when approving', async () => {
    const { admin, cecil, chore } = await family();
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
    const completionId = (await agent.post(`/api/tasks/${chore}/complete`).set(auth(cecil.token))).body.completionId as number;
    const approve = (body: object) => agent.post(`/api/completions/${completionId}/approve`).set(auth(admin.token)).send(body);
    expect((await approve({ bonus: 3 })).body.error).toBe('invalid_bonus');
    expect((await approve({ note: 'x'.repeat(201) })).body.error).toBe('note_too_long');

    const before = coins(cecil.user.id);
    await approve({ note: 'Sparkling!', bonus: 2 }).expect(200);
    expect(coins(cecil.user.id) - before).toBe(12 + 2);
    const ledger = db.prepare('SELECT amount, reason FROM coin_adjustments WHERE userId = ?').all(cecil.user.id);
    expect(ledger).toEqual([{ amount: 2, reason: '⭐ Above and beyond: Clean Shower' }]);
    const row = (await agent.get('/api/history').set(auth(cecil.token))).body.history.find((h: any) => h.type === 'completion' && h.id === completionId);
    expect(row.approvalNote).toBe('Sparkling!');
  });

  it('earns Team Spirit for giving 25 cheers and Fan Favorite for getting 25', async () => {
    const { admin, cecil, cylis, chore } = await family();
    const ids = [];
    for (let i = 0; i < 25; i++) {
      ids.push(Number(db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 1, 'approved')")
        .run(chore, cecil.user.id, new Date(Date.now() - i * 60000).toISOString()).lastInsertRowid));
    }
    for (const id of ids) db.prepare("INSERT INTO cheers (completionId, fromUserId, emoji) VALUES (?, ?, '👏')").run(id, cylis.user.id);
    const unlocked = async (token: string, id: string) =>
      ((await agent.get('/api/achievements').set(auth(token))).body.me.achievements as any[]).find((a) => a.id === id)?.unlocked;
    expect([await unlocked(cylis.token, 'team_spirit'), await unlocked(cecil.token, 'fan_favorite')]).toEqual([true, true]);
    expect(await unlocked(admin.token, 'team_spirit')).toBe(false);
  });
});
