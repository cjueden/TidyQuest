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

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const mkRoom = async (name: string) => (await agent.post('/api/rooms').set(auth(admin.token)).send({ name, roomType: 'other' })).body.id as number;
  const mkTask = async (roomId: number, body: object) => (await agent.post(`/api/rooms/${roomId}/tasks`).set(auth(admin.token)).send({ effort: 1, frequencyDays: 7, ...body })).body.id as number;
  return { admin, kid, mkRoom, mkTask };
}
const coins = (userId: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number }).coins;

describe('Trash', () => {
  it('keeps a deleted task with its history and puts it back without paying again', async () => {
    const { admin, kid, mkRoom, mkTask } = await family();
    const room = await mkRoom('Kitchen');
    const task = await mkTask(room, { name: 'Dishes', onDemand: true, scheduleWeekdays: [1, 4], assignedUserIds: [kid.user.id] });
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).expect(200);
    const balance = coins(kid.user.id);

    const del = await agent.delete(`/api/tasks/${task}`).set(auth(admin.token)).expect(200);
    // The row stays (hidden) so Activity keeps the completion under the chore's name
    expect(db.prepare('SELECT deletedAt IS NOT NULL AS gone FROM tasks WHERE id = ?').get(task)).toEqual({ gone: 1 });
    expect((await agent.get(`/api/rooms/${room}/tasks`).set(auth(admin.token))).body.map((t: any) => t.id)).not.toContain(task);
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).expect(404);
    const history = (await agent.get('/api/history').set(auth(admin.token))).body.history;
    expect(history.find((h: any) => h.type === 'completion')).toMatchObject({ taskName: 'Dishes', roomName: 'Kitchen' });
    expect(coins(kid.user.id)).toBe(balance);
    const trash = (await agent.get('/api/trash').set(auth(admin.token))).body;
    expect(trash.items[0]).toMatchObject({ id: del.body.trashId, kind: 'task', title: 'Dishes', roomName: 'Kitchen', roomExists: true, historyCount: 1 });
    expect((await agent.get('/api/trash').set(auth(kid.token))).status).toBe(403);

    const restored = (await agent.post(`/api/trash/${del.body.trashId}/restore`).set(auth(admin.token)).expect(200)).body;
    expect(restored).toMatchObject({ kind: 'task', id: task, roomId: room });
    expect(db.prepare('SELECT scheduleWeekdays FROM tasks WHERE id = ?').get(task)).toEqual({ scheduleWeekdays: 0b10010 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_completions WHERE taskId = ?').get(task)).toEqual({ n: 1 });
    expect(db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?').all(task)).toEqual([{ userId: kid.user.id }]);
    expect(coins(kid.user.id)).toBe(balance);
    expect((await agent.get('/api/trash').set(auth(admin.token))).body.items).toHaveLength(0);
  });

  it("asks for another room when the task's room is gone", async () => {
    const { admin, mkRoom, mkTask } = await family();
    const room = await mkRoom('Attic');
    const other = await mkRoom('Garage');
    const task = await mkTask(room, { name: 'Check for leaks' });
    const trashId = (await agent.delete(`/api/tasks/${task}`).set(auth(admin.token))).body.trashId;
    await agent.delete(`/api/rooms/${room}`).set(auth(admin.token)).expect(200);

    const blocked = await agent.post(`/api/trash/${trashId}/restore`).set(auth(admin.token));
    expect([blocked.status, blocked.body.error, blocked.body.roomName]).toEqual([409, 'room_missing', 'Attic']);
    const ok = await agent.post(`/api/trash/${trashId}/restore`).set(auth(admin.token)).send({ roomId: other });
    expect(ok.body).toMatchObject({ kind: 'task', roomId: other });
  });

  it('deleting a room hides it and its chores but keeps their history', async () => {
    const { admin, kid, mkRoom, mkTask } = await family();
    const room = await mkRoom('Kitchen');
    const task = await mkTask(room, { name: 'Wipe counters', assignedUserIds: [kid.user.id] });
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).expect(200);
    const balance = coins(kid.user.id);

    await agent.delete(`/api/rooms/${room}`).set(auth(admin.token)).expect(200);
    expect((await agent.get('/api/rooms').set(auth(admin.token))).body.map((r: any) => r.id)).not.toContain(room);
    await agent.delete(`/api/rooms/${room}`).set(auth(admin.token)).expect(404);
    await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'x', effort: 1, frequencyDays: 1 }).expect(404);
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).expect(404);
    const history = (await agent.get('/api/history').set(auth(admin.token))).body.history;
    expect(history.find((h: any) => h.type === 'completion')).toMatchObject({ taskName: 'Wipe counters', roomName: 'Kitchen' });
    expect(coins(kid.user.id)).toBe(balance);
  });

  it('delete forever only takes it off the list; older trash entries still restore from their copy', async () => {
    const { admin, kid, mkRoom, mkTask } = await family();
    const room = await mkRoom('Hall');
    const task = await mkTask(room, { name: 'Sweep', assignedUserIds: [kid.user.id] });
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).expect(200);
    const trashId = (await agent.delete(`/api/tasks/${task}`).set(auth(admin.token))).body.trashId;
    await agent.delete(`/api/trash/${trashId}`).set(auth(admin.token)).expect(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_completions WHERE taskId = ?').get(task)).toEqual({ n: 1 });

    // An entry from before soft-delete: the row is gone and the snapshot has no soft flag
    const old = await mkTask(room, { name: 'Dust' });
    const oldTrash = (await agent.delete(`/api/tasks/${old}`).set(auth(admin.token))).body.trashId;
    const snap = JSON.parse((db.prepare('SELECT snapshot FROM trash WHERE id = ?').get(oldTrash) as { snapshot: string }).snapshot);
    delete snap.soft;
    db.prepare('UPDATE trash SET snapshot = ? WHERE id = ?').run(JSON.stringify(snap), oldTrash);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(old);
    const restored = (await agent.post(`/api/trash/${oldTrash}/restore`).set(auth(admin.token)).expect(200)).body;
    expect(db.prepare('SELECT name, deletedAt FROM tasks WHERE id = ?').get(restored.id)).toEqual({ name: 'Dust', deletedAt: null });
  });

  it('keeps a reward with its rules and redemptions, and refunds an open shared pot', async () => {
    const { admin, kid } = await family();
    await agent.post(`/api/users/${kid.user.id}/adjust-coins`).set(auth(admin.token)).send({ amount: 100 });
    const reward = (await agent.post('/api/rewards').set(auth(admin.token)).send({ title: 'Movie night', costCoins: 50 })).body.id as number;
    const other = (await agent.post('/api/rewards').set(auth(admin.token)).send({ title: 'Family pot', costCoins: 500 })).body.id as number;
    await agent.put(`/api/rewards/${reward}/rules`).set(auth(admin.token)).send({ visibleTo: [kid.user.id], prices: { [kid.user.id]: 40 } }).expect(200);
    await agent.post(`/api/rewards/${reward}/redeem`).set(auth(kid.token)).expect(200);
    await agent.put(`/api/rewards/${other}/rules`).set(auth(admin.token)).send({ isShared: true }).expect(200);
    await agent.post(`/api/rewards/${other}/contribute`).set(auth(kid.token)).send({ amount: 30 }).expect(200);
    expect(coins(kid.user.id)).toBe(30);

    // The pot goes back to the kid; the redeemed reward's history stays in the snapshot
    await agent.delete(`/api/rewards/${other}`).set(auth(admin.token)).expect(200);
    expect(coins(kid.user.id)).toBe(60);
    const trashId = (await agent.delete(`/api/rewards/${reward}`).set(auth(admin.token)).expect(200)).body.trashId;
    expect(db.prepare('SELECT COUNT(*) AS n FROM reward_redemptions WHERE rewardId = ?').get(reward)).toEqual({ n: 0 });
    await agent.post(`/api/trash/${trashId}/restore`).set(auth(admin.token)).expect(200);
    const admin2 = (await agent.get('/api/rewards/admin').set(auth(admin.token))).body;
    expect(admin2.rewards.find((r: any) => r.id === reward)).toMatchObject({ visibleTo: [kid.user.id], prices: { [kid.user.id]: 40 } });
    expect(db.prepare('SELECT COUNT(*) AS n FROM reward_redemptions WHERE rewardId = ?').get(reward)).toEqual({ n: 1 });
    expect(coins(kid.user.id)).toBe(60);
  });

  it('empties items older than 30 days, and can delete one for good', async () => {
    const { admin, mkRoom, mkTask } = await family();
    const room = await mkRoom('Hall');
    const a = (await agent.delete(`/api/tasks/${await mkTask(room, { name: 'Old' })}`).set(auth(admin.token))).body.trashId;
    const b = (await agent.delete(`/api/tasks/${await mkTask(room, { name: 'New' })}`).set(auth(admin.token))).body.trashId;
    db.prepare("UPDATE trash SET deletedAt = datetime('now', '-31 days') WHERE id = ?").run(a);
    expect((await agent.get('/api/trash').set(auth(admin.token))).body.items.map((i: any) => i.title)).toEqual(['New']);
    await agent.delete(`/api/trash/${b}`).set(auth(admin.token)).expect(200);
    expect((await agent.get('/api/trash').set(auth(admin.token))).body.items).toHaveLength(0);
  });
});

describe('Bulk edit', () => {
  it('applies one change to many tasks, all or nothing', async () => {
    const { admin, kid, mkRoom, mkTask } = await family();
    const room = await mkRoom('Kitchen');
    const yard = await mkRoom('Yard');
    const a = await mkTask(room, { name: 'Wipe counters' });
    const b = await mkTask(room, { name: 'Sweep' });
    const batch = (body: object) => agent.post('/api/tasks/batch').set(auth(admin.token)).send(body);

    const ok = await batch({ ids: [a, b], changes: { effort: 3, customCoins: 12, assignedUserIds: [kid.user.id], roomId: yard } });
    expect(ok.body.updated).toBe(2);
    const rows = db.prepare('SELECT effort, customCoins, roomId FROM tasks WHERE id IN (?, ?)').all(a, b);
    expect(rows).toEqual([{ effort: 3, customCoins: 12, roomId: yard }, { effort: 3, customCoins: 12, roomId: yard }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM task_assignees WHERE userId = ?').get(kid.user.id)).toEqual({ n: 2 });

    expect((await batch({ ids: [a, 99999], changes: { effort: 5 } })).status).toBe(404);
    expect((await batch({ ids: [a], changes: { name: 'x' } })).body.error).toBe('unsupported_fields');
    expect((await batch({ ids: [a, b], changes: { roomId: 99999 } })).status).toBe(404);
    expect(db.prepare('SELECT effort, roomId FROM tasks WHERE id = ?').get(a)).toEqual({ effort: 3, roomId: yard });
    expect((await agent.post('/api/tasks/batch').set(auth(kid.token)).send({ ids: [a], changes: { effort: 1 } })).status).toBe(403);
  });

  it('deletes many tasks into the trash', async () => {
    const { admin, mkRoom, mkTask } = await family();
    const room = await mkRoom('Kitchen');
    const ids = [await mkTask(room, { name: 'A' }), await mkTask(room, { name: 'B' })];
    const res = await agent.post('/api/tasks/batch-delete').set(auth(admin.token)).send({ ids });
    expect(res.body.deleted).toBe(2);
    expect((await agent.get('/api/trash').set(auth(admin.token))).body.items.map((i: any) => i.title).sort()).toEqual(['A', 'B']);
  });
});
