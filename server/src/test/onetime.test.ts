import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { localDateStr } from '../utils/dateHelpers';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const dayFromNow = (n: number) => localDateStr(new Date(Date.now() + n * 86400000));

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const twin = await createUser(agent, admin.token, { username: 'twin', displayName: 'Twin', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Garage', roomType: 'other' })).body.id as number;
  return { admin, kid, twin, room };
}
const dash = async (token: string) => (await agent.get('/api/dashboard').set(auth(token))).body;
const roomTasks = async (token: string, room: number) => ((await agent.get('/api/rooms').set(auth(token))).body as any[]).find((r) => r.id === room)?.tasks ?? [];

describe('One-time chores', () => {
  it('show on the To-do card, not in the chore lists or health, and vanish once done (history stays)', async () => {
    const { admin, kid, room } = await family();
    await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Sweep', effort: 1, frequencyDays: 7, health: 100 });
    const door = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token))
      .send({ name: 'Fix the screen door', effort: 2, oneTime: true, doBy: dayFromNow(3), customCoins: 20, health: 100 })).body.id as number;

    let d = await dash(kid.token);
    expect(d.todoQuests.map((q: any) => [q.name, q.doBy, q.overdue])).toEqual([['Fix the screen door', dayFromNow(3), false]]);
    expect(d.readyToComplete.some((q: any) => q.id === door)).toBe(false);
    expect(d.rooms.find((r: any) => r.id === room).health).toBe(100); // the to-do doesn't pull the room down

    const done = await agent.post(`/api/tasks/${door}/complete`).set(auth(kid.token)).expect(200);
    expect(done.body.coinsEarned).toBe(20);
    expect((await roomTasks(kid.token, room)).map((t: any) => t.name)).toEqual(['Sweep']);
    d = await dash(kid.token);
    expect(d.todoQuests).toEqual([]);
    expect((await agent.post(`/api/tasks/${door}/complete`).set(auth(kid.token))).body.error).toBe('already_done');
    const history = (await agent.get('/api/history').set(auth(admin.token))).body;
    expect(JSON.stringify(history)).toContain('Fix the screen door');

    // Undoing the completion brings it back
    await agent.delete(`/api/completions/${done.body.completionId}`).set(auth(admin.token)).expect(200);
    expect((await dash(kid.token)).todoQuests.map((q: any) => q.id)).toEqual([door]);
  });

  it('under Strict Mode: one completion can wait, approval finishes it, a rejection brings it back', async () => {
    const { admin, kid, twin, room } = await family();
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Return library books', effort: 1, oneTime: true })).body.id as number;
    const first = await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token));
    expect(first.body.pendingApproval).toBe(true);
    expect((await agent.post(`/api/tasks/${task}/complete`).set(auth(twin.token))).body.error).toBe('already_done_by_other');
    await agent.delete(`/api/completions/${first.body.completionId}/reject`).set(auth(admin.token)).expect(200);
    const again = await agent.post(`/api/tasks/${task}/complete`).set(auth(twin.token));
    await agent.post(`/api/completions/${again.body.completionId}/approve`).set(auth(admin.token)).expect(200);
    expect(db.prepare('SELECT archivedAt IS NOT NULL AS done FROM tasks WHERE id = ?').get(task)).toEqual({ done: 1 });
  });

  it('marks a to-do overdue after its do-by day, or a week after it was added', async () => {
    const { admin, kid, room } = await family();
    const late = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Late', effort: 1, oneTime: true, doBy: dayFromNow(-1) })).body.id;
    const old = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Old', effort: 1, oneTime: true })).body.id;
    db.prepare("UPDATE tasks SET createdAt = datetime('now', '-8 days') WHERE id = ?").run(old);
    await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Fresh', effort: 1, oneTime: true });
    const todo = (await dash(kid.token)).todoQuests.map((q: any) => [q.name, q.overdue]);
    expect(todo).toEqual([['Late', true], ['Old', true], ['Fresh', false]]);
    void late;
    expect((await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'X', effort: 1, oneTime: true, doBy: 'Saturday' })).body.error).toBe('invalid_do_by');
  });
});

describe('+ To-do quick add', () => {
  it('files to-dos in one "To-dos" room for exactly the people chosen; parents only', async () => {
    const { admin, kid, twin } = await family();
    const a = (await agent.post('/api/todos').set(auth(admin.token)).send({ name: 'Fix the screen door', doBy: dayFromNow(2), assignedUserIds: [kid.user.id], customCoins: 15 })).body;
    const b = (await agent.post('/api/todos').set(auth(admin.token)).send({ name: 'Call the plumber' })).body;
    expect(a.roomId).toBe(b.roomId);
    expect(a).toMatchObject({ oneTime: 1, doBy: dayFromNow(2), customCoins: 15 });
    expect((db.prepare('SELECT name FROM rooms WHERE id = ?').get(a.roomId) as { name: string }).name).toBe('To-dos');
    expect(db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?').all(a.id)).toEqual([{ userId: kid.user.id }]);
    expect((await agent.post('/api/todos').set(auth(kid.token)).send({ name: 'x' })).status).toBe(403);
    // The room is reused even after it's renamed
    await agent.put(`/api/rooms/${a.roomId}`).set(auth(admin.token)).send({ name: 'Honey-do' });
    expect((await agent.post('/api/todos').set(auth(admin.token)).send({ name: 'Oil the hinges' })).body.roomId).toBe(a.roomId);
    void twin;
  });
});
