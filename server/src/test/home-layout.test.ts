import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';

let agent: supertest.Agent;

beforeEach(() => {
  ({ agent } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Home layout per person (ENH-6)', () => {
  it('is saved on the server, follows the person, and can be reset', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'cecil', displayName: 'Cecil', password: 'pass123', role: 'child' });
    const me = async (token: string) => (await agent.get('/api/auth/me').set(auth(token)).expect(200)).body;
    expect((await me(kid.token)).homeLayout).toBeNull();

    const layout = { order: ['todaysQuests', 'mascot', 'focus', 'mascot'], hidden: ['completedToday'] };
    await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(kid.token)).send({ homeLayout: layout }).expect(200);
    // Duplicates are dropped; the kid's layout is theirs alone
    expect((await me(kid.token)).homeLayout).toEqual({ order: ['todaysQuests', 'mascot', 'focus'], hidden: ['completedToday'] });
    expect((await me(admin.token)).homeLayout).toBeNull();
    // Home gets it too (the dashboard's own copy of the person)
    expect((await agent.get('/api/dashboard').set(auth(kid.token)).expect(200)).body.currentUser.homeLayout.hidden).toEqual(['completedToday']);

    for (const bad of ['mascot', { order: 'mascot' }, { order: ['<script>'] }, { hidden: Array.from({ length: 61 }, (_, i) => `c${i}`) }]) {
      const res = await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(kid.token)).send({ homeLayout: bad });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_home_layout');
    }
    // Someone else can't change it (a parent can, like the rest of the profile)
    const twin = await createUser(agent, admin.token, { username: 'cylis', displayName: 'Cylis', password: 'pass123', role: 'child' });
    await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(twin.token)).send({ homeLayout: null }).expect(403);

    await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(kid.token)).send({ homeLayout: null }).expect(200);
    expect((await me(kid.token)).homeLayout).toBeNull();
  });
});
