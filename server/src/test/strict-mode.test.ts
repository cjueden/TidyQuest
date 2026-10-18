import { describe, it, expect } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';

describe('Strict mode', () => {
  function setupAll(agent: supertest.Agent, adminToken: string) {
    return {
      enableStrict: () =>
        agent
          .put('/api/users/strict-mode-config')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ strictMode: true }),
      disableStrict: () =>
        agent
          .put('/api/users/strict-mode-config')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ strictMode: false }),
      createRoomAndTask: async () => {
        const roomRes = await agent
          .post('/api/rooms')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Test Room', roomType: 'other', tasks: [] });
        const taskRes = await agent
          .post(`/api/rooms/${roomRes.body.id}/tasks`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Test Task', effort: 2, frequencyDays: 1 });
        return { roomId: roomRes.body.id, taskId: taskRes.body.id };
      },
    };
  }

  it('Strict mode ON: child completion is pending with coins=0', async () => {
    const { agent } = createTestApp();
    const { token: adminToken } = await createAdmin(agent);
    const helpers = setupAll(agent, adminToken);

    await helpers.enableStrict();

    const { token: childToken } = await createUser(agent, adminToken, {
      username: 'child1',
      displayName: 'Child',
      password: 'pass123',
    });

    const { taskId } = await helpers.createRoomAndTask();

    const completeRes = await agent
      .post(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${childToken}`);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.pendingApproval).toBe(true);
    expect(completeRes.body.coinsEarned).toBe(0);

    // Verify child coins unchanged
    const meRes = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${childToken}`);

    expect(meRes.body.coins).toBe(0);
  });

  it('Admin approve: coins awarded to child', async () => {
    const { agent } = createTestApp();
    const { token: adminToken } = await createAdmin(agent);
    const helpers = setupAll(agent, adminToken);

    await helpers.enableStrict();

    const { token: childToken, user: child } = await createUser(agent, adminToken, {
      username: 'child1',
      displayName: 'Child',
      password: 'pass123',
    });

    const { taskId } = await helpers.createRoomAndTask();

    // Child completes task
    await agent
      .post(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${childToken}`);

    // Admin gets pending completions
    const pendingRes = await agent
      .get('/api/completions/pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.pending.length).toBeGreaterThanOrEqual(1);

    const completionId = pendingRes.body.pending[0].id;

    // Admin approves
    const approveRes = await agent
      .post(`/api/completions/${completionId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(approveRes.status).toBe(200);

    // Verify child coins increased
    const usersRes = await agent
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    const updatedChild = usersRes.body.find((u: any) => u.id === child.id);
    expect(updatedChild.coins).toBeGreaterThan(0);
  });

  it('Admin reject: no coins, completion deleted', async () => {
    const { agent } = createTestApp();
    const { token: adminToken } = await createAdmin(agent);
    const helpers = setupAll(agent, adminToken);

    await helpers.enableStrict();

    const { token: childToken, user: child } = await createUser(agent, adminToken, {
      username: 'child1',
      displayName: 'Child',
      password: 'pass123',
    });

    const { taskId } = await helpers.createRoomAndTask();

    // Child completes task
    await agent
      .post(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${childToken}`);

    // Get the pending completion
    const pendingRes = await agent
      .get('/api/completions/pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(pendingRes.body.pending.length).toBeGreaterThanOrEqual(1);
    const completionId = pendingRes.body.pending[0].id;

    // Admin rejects
    const rejectRes = await agent
      .delete(`/api/completions/${completionId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(rejectRes.status).toBe(200);

    // Verify child still has 0 coins
    const usersRes = await agent
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    const updatedChild = usersRes.body.find((u: any) => u.id === child.id);
    expect(updatedChild.coins).toBe(0);

    // Verify completion is gone from pending list
    const pendingAfter = await agent
      .get('/api/completions/pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(pendingAfter.body.pending).toHaveLength(0);
  });

  it('Strict mode OFF: completion approved immediately with coins', async () => {
    const { agent } = createTestApp();
    const { token: adminToken } = await createAdmin(agent);
    const helpers = setupAll(agent, adminToken);

    await helpers.disableStrict();

    const { token: childToken } = await createUser(agent, adminToken, {
      username: 'child1',
      displayName: 'Child',
      password: 'pass123',
    });

    const { taskId } = await helpers.createRoomAndTask();

    const completeRes = await agent
      .post(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${childToken}`);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.pendingApproval).toBe(false);
    expect(completeRes.body.coinsEarned).toBeGreaterThan(0);

    // Verify child coins increased
    const meRes = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${childToken}`);

    expect(meRes.body.coins).toBeGreaterThan(0);
  });

  it('GET /api/completions/pending: admin only → member gets 403', async () => {
    const { agent } = createTestApp();
    const { token: adminToken } = await createAdmin(agent);
    const { token: memberToken } = await createUser(agent, adminToken, {
      username: 'member1',
      displayName: 'Member',
      password: 'pass123',
      role: 'member',
    });

    const res = await agent
      .get('/api/completions/pending')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });

  it('lets the kid take back a Done that waits for approval, but not someone else\'s or an approved one', async () => {
    const { agent } = createTestApp();
    const { token: adminToken } = await createAdmin(agent);
    const helpers = setupAll(agent, adminToken);
    await helpers.enableStrict();
    const { token: childToken } = await createUser(agent, adminToken, { username: 'child1', displayName: 'Child', password: 'pass123' });
    const { token: otherToken } = await createUser(agent, adminToken, { username: 'child2', displayName: 'Other', password: 'pass123' });
    const { taskId } = await helpers.createRoomAndTask();
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const myQuest = async () => {
      const rooms = (await agent.get('/api/rooms').set(auth(childToken))).body as any[];
      return rooms.flatMap((r) => r.tasks).find((q: any) => q.id === taskId);
    };

    await agent.post(`/api/tasks/${taskId}/complete`).set(auth(childToken)).expect(200);
    const quest = await myQuest();
    expect(quest.myPendingCount).toBe(1);
    expect(typeof quest.myPendingId).toBe('number');
    await agent.delete(`/api/completions/${quest.myPendingId}`).set(auth(otherToken)).expect(403);
    const res = await agent.delete(`/api/completions/${quest.myPendingId}`).set(auth(childToken)).expect(200);
    expect(res.body.coinsDeducted).toBe(0);
    expect((await myQuest()).myPendingCount).toBe(0);
    expect((await agent.get('/api/completions/pending').set(auth(adminToken))).body.pending).toEqual([]);

    // Once a parent approves it, only a parent can undo it
    await agent.post(`/api/tasks/${taskId}/complete`).set(auth(childToken)).expect(200);
    const id = (await myQuest()).myPendingId;
    await agent.post(`/api/completions/${id}/approve`).set(auth(adminToken)).expect(200);
    await agent.delete(`/api/completions/${id}`).set(auth(childToken)).expect(409);
  });
});
