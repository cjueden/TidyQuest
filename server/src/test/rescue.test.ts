import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { setNotifyTransport, type Delivery } from '../utils/notify';
import { runScheduledNotifications } from '../utils/notifySchedule';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;
let sent: Delivery[];

beforeEach(() => {
  ({ agent, db } = createTestApp());
  db.prepare("DELETE FROM app_settings WHERE key = 'features'").run(); // on, as in a real install
  sent = [];
  setNotifyTransport(async (d) => { sent.push(d); return { ok: true }; });
});
afterEach(() => setNotifyTransport());

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 86400000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const twin = await createUser(agent, admin.token, { username: 'twin', displayName: 'Twin', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'House', roomType: 'other' })).body.id as number;
  const mk = async (name: string, body: object, lastDone: number) => {
    const id = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name, effort: 1, customCoins: 10, ...body })).body.id as number;
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(ago(lastDone), id);
    return id;
  };
  return { admin, kid, twin, room, mk };
}
const mission = async (token: string) => (await agent.get('/api/dashboard').set(auth(token))).body.rescueMission;

describe('Rescue Mission', () => {
  it('picks the most-forgotten chore and pays the first person who does it double', async () => {
    const { admin, kid, twin, mk } = await family();
    await mk('Clean the fridge', { frequencyDays: 7 }, 28); // 3 weeks behind
    const counters = await mk('Wipe counters', { frequencyDays: 1 }, 5); // 4 days behind
    await mk('Sweep', { frequencyDays: 7 }, 3); // not due yet
    expect(await mission(kid.token)).toMatchObject({ taskId: counters, multiplier: 2, completedBy: null, taskName: 'Wipe counters' });
    expect((await agent.get('/api/dashboard').set(auth(kid.token))).body.forgottenQuests.some((q: any) => q.id === counters)).toBe(false);

    const done = (await agent.post(`/api/tasks/${counters}/complete`).set(auth(kid.token)).expect(200)).body;
    expect([done.coinsEarned, done.rescued]).toEqual([20, true]);
    expect(await mission(twin.token)).toMatchObject({ completedBy: kid.user.id, completedByName: 'Kid' });
    // Already rescued: it stays (the bonus is paid)
    expect((await agent.post('/api/rescue/reroll').set(auth(admin.token))).body.error).toBe('already_rescued');
  });

  it("doesn't stack with a double coins event (the bigger one wins)", async () => {
    const { admin, kid, mk } = await family();
    const t = await mk('Wipe counters', { frequencyDays: 1 }, 5);
    await agent.post('/api/boosts').set(auth(admin.token)).send({ title: 'Party', multiplier: 3, startAt: ago(0.1), endAt: new Date(Date.now() + 3600000).toISOString() });
    expect((await agent.post(`/api/tasks/${t}/complete`).set(auth(kid.token))).body.coinsEarned).toBe(30);
  });

  it('under Strict Mode a rejected completion gives the mission back', async () => {
    const { admin, kid, twin, mk } = await family();
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
    const t = await mk('Clean the fridge', { frequencyDays: 7 }, 28);
    const first = (await agent.post(`/api/tasks/${t}/complete`).set(auth(kid.token))).body;
    expect(first.rescued).toBe(true);
    expect((db.prepare('SELECT coinsEarned FROM task_completions WHERE id = ?').get(first.completionId) as { coinsEarned: number }).coinsEarned).toBe(20);
    await agent.delete(`/api/completions/${first.completionId}/reject`).set(auth(admin.token)).expect(200);
    expect((await mission(twin.token)).completedBy).toBeNull();
    const second = (await agent.post(`/api/tasks/${t}/complete`).set(auth(twin.token))).body;
    expect(second.rescued).toBe(true);
  });

  it('shows an assigned chore only to its people (and parents)', async () => {
    const { admin, kid, twin, mk } = await family();
    const t = await mk('Clean your room', { frequencyDays: 7, assignedUserIds: [kid.user.id] }, 28);
    expect((await mission(kid.token)).taskId).toBe(t);
    expect((await mission(admin.token)).taskId).toBe(t);
    expect(await mission(twin.token)).toBeNull();
  });

  it('lets parents pick another, choose one, or skip today; and it can be switched off', async () => {
    const { admin, kid, mk } = await family();
    const a = await mk('Wipe counters', { frequencyDays: 1 }, 5);
    const b = await mk('Clean the fridge', { frequencyDays: 7 }, 28);
    const choices = (await agent.get('/api/dashboard').set(auth(admin.token))).body.rescueChoices.map((c: any) => c.id);
    expect(choices).toEqual([a, b]);
    expect((await agent.post('/api/rescue/reroll').set(auth(kid.token))).status).toBe(403);
    expect((await agent.post('/api/rescue/reroll').set(auth(admin.token))).body.taskId).toBe(b);
    expect((await agent.put('/api/rescue').set(auth(admin.token)).send({ taskId: a })).body.taskId).toBe(a);
    await agent.delete('/api/rescue').set(auth(admin.token)).expect(200);
    expect(await mission(kid.token)).toBeNull();
    // Switched off in Settings → Features
    db.prepare("DELETE FROM rescue_missions").run();
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('features', ?)").run(JSON.stringify({ rescue: false }));
    expect(await mission(kid.token)).toBeNull();
  });

  it('is announced in the morning to the people who can do it', async () => {
    const { kid, mk } = await family();
    await mk('Wipe counters', { frequencyDays: 1 }, 5);
    for (const [k, v] of [['notificationsEnabled', '1']]) db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(k, v);
    db.prepare("UPDATE users SET ntfyTopic = 'kid-topic' WHERE id = ?").run(kid.user.id);
    const morning = new Date(); morning.setHours(7, 5, 0, 0);
    await runScheduledNotifications(morning);
    expect(sent.filter((d) => d.target === 'kid-topic').map((d) => d.message))
      .toContain('⚡ Rescue Mission: “Wipe counters” pays 2× coins today. First one to do it wins!');
  });
});
