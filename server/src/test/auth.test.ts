import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, familyField, HOSTED_RUN } from './setup';
import type supertest from 'supertest';

let agent: supertest.Agent;

beforeEach(() => {
  ({ agent } = createTestApp());
});

describe('Auth routes', () => {
  it('POST /api/auth/login — valid credentials → 200 + JWT', async () => {
    await createAdmin(agent, 'admin', 'admin123', 'Admin');

    const res = await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123', ...familyField() });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.role).toBe('admin');
  });

  it('POST /api/auth/login — invalid credentials → 401', async () => {
    await createAdmin(agent, 'admin', 'admin123', 'Admin');

    const res = await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong-password', ...familyField() });

    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me — with valid token → user profile', async () => {
    const { token } = await createAdmin(agent, 'admin', 'admin123', 'Admin');

    const res = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('username', 'admin');
    expect(res.body).toHaveProperty('displayName', 'Admin');
    expect(res.body).toHaveProperty('role', 'admin');
    expect(res.body).toHaveProperty('coins');
  });

  it('GET /api/auth/me — no token → 401', async () => {
    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  // Hosted mode has no /register: families start on the sign-up page (NEW-10)
  it.skipIf(HOSTED_RUN)('POST /api/auth/register — when registration disabled → 403', async () => {
    const { token } = await createAdmin(agent, 'admin', 'admin123', 'Admin');

    // Disable registration
    await agent
      .put('/api/users/registration-config')
      .set('Authorization', `Bearer ${token}`)
      .send({ registrationEnabled: false });

    // Attempt to register a new user
    const res = await agent
      .post('/api/auth/register')
      .send({ username: 'newuser', password: 'pass123', displayName: 'New User' });

    expect(res.status).toBe(403);
  });
});
