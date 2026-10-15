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
  const kidA = await createUser(agent, admin.token, { username: 'kida', displayName: 'Kid A', password: 'pass123', role: 'child' });
  const kidB = await createUser(agent, admin.token, { username: 'kidb', displayName: 'Kid B', password: 'pass123', role: 'child' });
  await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Room', roomType: 'other' })).body.id as number;
  return { admin, kidA, kidB, room };
}

async function pendingFor(token: string, taskId: number) {
  const res = await agent.get('/api/completions/pending').set(auth(token));
  return (res.body.pending as Array<{ id: number; taskId: number }>).filter((p) => p.taskId === taskId);
}

describe('Rotation under Strict Mode', () => {
  it('passes the turn to the next person once the parent approves', async () => {
    const { admin, kidA, kidB, room } = await family();
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token))
      .send({ name: 'Trash', effort: 1, frequencyDays: 1, assignedUserIds: [kidA.user.id, kidB.user.id], assignmentMode: 'rotating' })).body.id as number;
    const turn = () => (db.prepare('SELECT rotationCurrentUserId AS u FROM tasks WHERE id = ?').get(task) as { u: number }).u;
    expect(turn()).toBe(kidA.user.id);

    const done = await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token));
    expect(done.body.pendingApproval).toBe(true);
    expect(turn()).toBe(kidA.user.id); // not yet: still waiting for the parent

    const [pending] = await pendingFor(admin.token, task);
    await agent.post(`/api/completions/${pending.id}/approve`).set(auth(admin.token)).expect(200);
    expect(turn()).toBe(kidB.user.id);
  });
});

describe('Completing on a child\'s behalf (Home Assistant, upstream #142)', () => {
  it('waits for approval when the integration says the child is acting', async () => {
    const { admin, kidA, room } = await family();
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Bed', effort: 1, frequencyDays: 1 })).body.id as number;
    const res = await agent.post(`/api/tasks/${task}/complete`).set(auth(admin.token))
      .send({ onBehalfOfUserId: kidA.user.id, requireApproval: true });
    expect(res.body.pendingApproval).toBe(true);
    expect((await pendingFor(admin.token, task))).toHaveLength(1);
  });

  it('still pays out instantly when a parent picks the child in the app', async () => {
    const { admin, kidA, room } = await family();
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Bed', effort: 1, frequencyDays: 1 })).body.id as number;
    const res = await agent.post(`/api/tasks/${task}/complete`).set(auth(admin.token)).send({ onBehalfOfUserId: kidA.user.id });
    expect(res.body.pendingApproval).toBe(false);
  });
});

describe('Waiting-for-approval counts', () => {
  it('tells each person how many of their own taps are waiting, on Home and the rooms list', async () => {
    const { admin, kidA, kidB, room } = await family();
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Report card A', effort: 1, onDemand: true })).body.id as number;
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token));
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token));

    const countIn = (rooms: any[]) => rooms.flatMap((r) => r.tasks).find((t: any) => t.id === task).myPendingCount;
    expect(countIn((await agent.get('/api/rooms').set(auth(kidA.token))).body)).toBe(2);
    expect(countIn((await agent.get('/api/rooms').set(auth(kidB.token))).body)).toBe(0);

    await agent.put(`/api/tasks/${task}`).set(auth(admin.token)).send({ showInDashboard: true });
    const dash = (await agent.get('/api/dashboard').set(auth(kidA.token))).body;
    expect(dash.onDemandQuests.find((q: any) => q.id === task).myPendingCount).toBe(2);
  });

  it("counts a room's owner as the task's person on Home, like the rooms list does", async () => {
    const { admin, kidA } = await family();
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: "Kid A's Quests", roomType: 'other', assignedUserId: kidA.user.id })).body.id as number;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Check in', effort: 1, onDemand: true, showInDashboard: true })).body.id as number;
    const dash = (await agent.get('/api/dashboard').set(auth(admin.token))).body;
    expect(dash.onDemandQuests.find((q: any) => q.id === task).effectiveAssignedUserIds).toEqual([kidA.user.id]);
  });
});
