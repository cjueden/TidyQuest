import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';

let agent: supertest.Agent;

beforeEach(() => {
  ({ agent } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function family() {
  const admin = await createAdmin(agent);
  const kidA = await createUser(agent, admin.token, { username: 'kida', displayName: 'Kid A', password: 'pass123', role: 'child' });
  const kidB = await createUser(agent, admin.token, { username: 'kidb', displayName: 'Kid B', password: 'pass123', role: 'child' });
  const mkRoom = async (name: string, assignedUserId?: number) =>
    (await agent.post('/api/rooms').set(auth(admin.token)).send({ name, roomType: 'other', ...(assignedUserId ? { assignedUserId } : {}) })).body.id as number;
  const shared = await mkRoom('Kitchen');
  const aRoom = await mkRoom("Kid A's Quests", kidA.user.id);
  const bRoom = await mkRoom("Kid B's Quests", kidB.user.id);
  const momRoom = await mkRoom("Mom's Quests", admin.user.id);
  for (const room of [shared, aRoom, bRoom, momRoom]) {
    await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: `Task in ${room}`, effort: 1, onDemand: true, showInDashboard: true });
  }
  return { admin, kidA, kidB, shared, aRoom, bRoom, momRoom };
}

const roomIds = async (token: string) => ((await agent.get('/api/rooms').set(auth(token))).body as Array<{ id: number }>).map((r) => r.id).sort();
const dashRoomIds = async (token: string) => {
  const dash = (await agent.get('/api/dashboard').set(auth(token))).body;
  return [...new Set((dash.onDemandQuests as Array<{ roomId: number }>).map((q) => q.roomId))].sort();
};

describe('Per-person task view and Kid mode', () => {
  it('lets a parent set them, shows them to the person, and refuses kids', async () => {
    const { admin, kidA } = await family();
    const res = await agent.put(`/api/users/${kidA.user.id}/view`).set(auth(admin.token)).send({ taskView: 'mineOnly', kidMode: true });
    expect(res.status).toBe(200);
    expect([res.body.taskView, res.body.kidMode]).toEqual(['mineOnly', 1]);

    const me = (await agent.get('/api/auth/me').set(auth(kidA.token))).body;
    expect([me.taskView, me.kidMode]).toEqual(['mineOnly', 1]);
    const dash = (await agent.get('/api/dashboard').set(auth(kidA.token))).body;
    expect([dash.currentUser.taskView, dash.currentUser.kidMode]).toEqual(['mineOnly', 1]);

    // A kid can't unlock themselves
    expect((await agent.put(`/api/users/${kidA.user.id}/view`).set(auth(kidA.token)).send({ taskView: 'all' })).status).toBe(403);
    expect((await agent.put(`/api/users/${kidA.user.id}/view`).set(auth(admin.token)).send({ taskView: 'everything' })).status).toBe(400);
  });
});

describe("Other people's private rooms", () => {
  it('are hidden from kids on the rooms list and Home, but not from parents or the owner', async () => {
    const { admin, kidA, shared, aRoom, bRoom, momRoom } = await family();
    expect(await roomIds(kidA.token)).toEqual([shared, aRoom].sort());
    expect(await dashRoomIds(kidA.token)).toEqual([shared, aRoom].sort());
    expect(await roomIds(admin.token)).toEqual([shared, aRoom, bRoom, momRoom].sort());
  });

  it('show again when a parent turns the setting off', async () => {
    const { admin, kidA, shared, aRoom, bRoom, momRoom } = await family();
    expect((await agent.get('/api/users/kids-config').set(auth(admin.token))).body).toEqual({ hidePrivateRooms: true });
    await agent.put('/api/users/kids-config').set(auth(admin.token)).send({ hidePrivateRooms: false }).expect(200);
    expect(await roomIds(kidA.token)).toEqual([shared, aRoom, bRoom, momRoom].sort());
    expect((await agent.put('/api/users/kids-config').set(auth(kidA.token)).send({ hidePrivateRooms: true })).status).toBe(403);
  });
});
