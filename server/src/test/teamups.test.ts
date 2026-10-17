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
const HOUR = 3600000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

async function family() {
  const admin = await createAdmin(agent);
  const kid = (username: string, displayName: string) => createUser(agent, admin.token, { username, displayName, password: 'pass123', role: 'child' });
  const cecil = await kid('cecil', 'Cecil');
  const cylis = await kid('cylis', 'Cylis');
  const wyatt = await kid('wyatt', 'Wyatt');
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Bathroom', roomType: 'other' })).body.id as number;
  const chore = async (name: string, coins: number) =>
    (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name, effort: 1, onDemand: true, showInDashboard: true, customCoins: coins })).body.id as number;
  return { admin, cecil, cylis, wyatt, room, chore };
}
const earnedBy = (taskId: number) => (db.prepare('SELECT u.displayName AS who, c.coinsEarned AS coins, c.status FROM task_completions c JOIN users u ON u.id = c.userId WHERE c.taskId = ? ORDER BY u.displayName').all(taskId) as any[]);

describe('Team-ups: doing a chore together', () => {
  it('only works on chores worth 6+ coins that aren\'t one person\'s', async () => {
    const { cecil, cylis, admin, chore } = await family();
    const start = (taskId: number) => agent.post('/api/teamups').set(auth(cecil.token)).send({ taskId, partnerId: cylis.user.id });
    expect((await start(await chore('Wipe sink', 5))).body.error).toBe('not_teamable');
    const duty = await chore('Cecil duty', 12);
    db.prepare('INSERT INTO task_assignees (taskId, userId) VALUES (?, ?)').run(duty, cecil.user.id);
    expect((await start(duty)).body.error).toBe('not_teamable');
    const owned = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: "Cecil's Room", roomType: 'other', assignedUserId: cecil.user.id })).body.id;
    const inOwned = (await agent.post(`/api/rooms/${owned}/tasks`).set(auth(admin.token)).send({ name: 'Make bed', effort: 1, onDemand: true, customCoins: 12 })).body.id;
    expect((await start(inOwned)).body.error).toBe('not_teamable');
    expect((await agent.post('/api/teamups').set(auth(cecil.token)).send({ taskId: await chore('Tub', 12), partnerId: cecil.user.id })).body.error).toBe('invalid_partner');
  });

  it('claims the chore for the team and gives everyone a share plus the team bonus', async () => {
    const { admin, cecil, cylis, wyatt, chore } = await family();
    const tub = await chore('Clean Shower & Tub', 12);
    const team = (await agent.post('/api/teamups').set(auth(cecil.token)).send({ taskId: tub, partnerId: cylis.user.id })).body.teamup;
    expect((await agent.post(`/api/teamups/${team.id}/join`).set(auth(wyatt.token))).body.error).toBe('not_invited');
    // Not claimed until someone joins; then Cylis sees it on Home with their share
    const invite = (await agent.get('/api/dashboard').set(auth(cylis.token))).body.teamups;
    expect(invite).toMatchObject([{ id: team.id, taskName: 'Clean Shower & Tub', canJoin: true, mine: false }]);
    await agent.post(`/api/teamups/${team.id}/join`).set(auth(cylis.token)).expect(200);
    const blocked = await agent.post(`/api/tasks/${tub}/complete`).set(auth(wyatt.token));
    expect([blocked.status, blocked.body.error, blocked.body.names]).toEqual([409, 'claimed_by_team', ['Cecil', 'Cylis']]);
    const wyattSees = (await agent.get('/api/dashboard').set(auth(wyatt.token))).body.onDemandQuests.find((q: any) => q.id === tub);
    expect(wyattSees.teamUp.claimedBy).toEqual(['Cecil', 'Cylis']);

    // Either one taps Done: 12 × 1.2 ÷ 2 = 7 each
    const done = (await agent.post(`/api/tasks/${tub}/complete`).set(auth(cylis.token))).body;
    expect([done.team, done.coinsEarned]).toEqual([true, 7]);
    expect(earnedBy(tub)).toEqual([{ who: 'Cecil', coins: 7, status: 'approved' }, { who: 'Cylis', coins: 7, status: 'approved' }]);
    const row = (await agent.get('/api/history').set(auth(admin.token))).body.history.find((h: any) => h.taskId === tub);
    expect(row.participants.map((p: any) => p.displayName).sort()).toEqual(['Cecil', 'Cylis']);
    expect((await agent.get('/api/dashboard').set(auth(cylis.token))).body.teamups).toEqual([]);
  });

  it('lets a parent help a kid (the kid keeps the full coins), and multiplies each share', async () => {
    const { admin, cecil, chore } = await family();
    const tub = await chore('Clean Shower & Tub', 12);
    await agent.post('/api/boosts').set(auth(admin.token)).send({ title: 'Party prep', multiplier: 2, startAt: at(-HOUR), endAt: at(HOUR) });
    const team = (await agent.post('/api/teamups').set(auth(admin.token)).send({ taskId: tub })).body.teamup;
    await agent.post(`/api/teamups/${team.id}/join`).set(auth(cecil.token)).expect(200);
    await agent.post(`/api/tasks/${tub}/complete`).set(auth(cecil.token)).expect(200);
    expect(earnedBy(tub)).toEqual([{ who: 'Admin', coins: 0, status: 'approved' }, { who: 'Cecil', coins: 24, status: 'approved' }]);
  });

  it('under Strict Mode waits for one approval for the team; a rejection gives it back to the team', async () => {
    const { admin, cecil, cylis, chore } = await family();
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
    await agent.put('/api/features').set(auth(admin.token)).send({ teamBonus: 30 }).expect(200);
    const tub = await chore('Clean Shower & Tub', 12);
    const team = (await agent.post('/api/teamups').set(auth(cecil.token)).send({ taskId: tub })).body.teamup;
    await agent.post(`/api/teamups/${team.id}/join`).set(auth(cylis.token)).expect(200);
    expect((await agent.post(`/api/tasks/${tub}/complete`).set(auth(cecil.token))).body.pendingApproval).toBe(true);
    let pending = (await agent.get('/api/completions/pending').set(auth(admin.token))).body.pending;
    expect(pending.map((p: any) => [p.displayName, p.coinsEarned])).toEqual([['Cecil + Cylis', 16]]); // 12 × 1.3 ÷ 2 = 8 each
    const onHome = (await agent.get('/api/dashboard').set(auth(admin.token))).body.pendingCompletions;
    expect(onHome.map((p: any) => p.displayName)).toEqual(['Cecil + Cylis']);

    await agent.delete(`/api/completions/${pending[0].id}/reject`).set(auth(admin.token)).expect(200);
    expect(earnedBy(tub)).toEqual([]);
    expect((db.prepare('SELECT status FROM teamups WHERE id = ?').get(team.id) as any).status).toBe('open');

    await agent.post(`/api/tasks/${tub}/complete`).set(auth(cylis.token)).expect(200);
    pending = (await agent.get('/api/completions/pending').set(auth(admin.token))).body.pending;
    await agent.post(`/api/completions/${pending[0].id}/approve`).set(auth(admin.token)).expect(200);
    expect(earnedBy(tub)).toEqual([{ who: 'Cecil', coins: 8, status: 'approved' }, { who: 'Cylis', coins: 8, status: 'approved' }]);
  });

  it('ends the invite when the chore gets done another way, and counts toward the Teamwork badge', async () => {
    const { cecil, cylis, chore } = await family();
    const tub = await chore('Clean Shower & Tub', 12);
    const team = (await agent.post('/api/teamups').set(auth(cecil.token)).send({ taskId: tub, partnerId: cylis.user.id })).body.teamup;
    await agent.post(`/api/tasks/${tub}/complete`).set(auth(cylis.token)).expect(200);
    expect((db.prepare('SELECT status FROM teamups WHERE id = ?').get(team.id) as any).status).toBe('cancelled');

    for (let i = 0; i < 5; i++) {
      const t = await chore(`Job ${i}`, 10);
      const tu = (await agent.post('/api/teamups').set(auth(cecil.token)).send({ taskId: t })).body.teamup;
      await agent.post(`/api/teamups/${tu.id}/join`).set(auth(cylis.token)).expect(200);
      await agent.post(`/api/tasks/${t}/complete`).set(auth(cecil.token)).expect(200);
    }
    const badge = ((await agent.get('/api/achievements').set(auth(cylis.token))).body.me.achievements as any[]).find((a) => a.id === 'teamwork_5');
    expect(badge.unlocked).toBe(true);
  });
});
