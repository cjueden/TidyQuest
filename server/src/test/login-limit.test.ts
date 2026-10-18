import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import { trustProxySetting } from '../utils/proxy';
import type supertest from 'supertest';
import type { Express } from 'express';

let agent: supertest.Agent;
let app: Express;
beforeEach(() => {
  ({ agent, app } = createTestApp());
});
const login = (username: string, password: string, forwardedFor?: string) => {
  const req = agent.post('/api/auth/login');
  if (forwardedFor) req.set('X-Forwarded-For', forwardedFor);
  return req.send({ username, password });
};

describe('Login limit', () => {
  it('locks one account after 10 wrong passwords, even when each try fakes a new address', async () => {
    const admin = await createAdmin(agent);
    await createUser(agent, admin.token, { username: 'cecil', displayName: 'Cecil', password: 'pass123', role: 'child' });
    for (let i = 0; i < 10; i++) expect((await login('Cecil', 'nope', `203.0.113.${i}`)).status).toBe(401);
    expect((await login('cecil', 'pass123', '198.51.100.1')).status).toBe(429);
    // Others on the same address can still log in
    expect((await login('admin', 'admin123')).status).toBe(200);
  });

  it('a good login clears that account\'s failed tries', async () => {
    const admin = await createAdmin(agent);
    await createUser(agent, admin.token, { username: 'cecil', displayName: 'Cecil', password: 'pass123', role: 'child' });
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 9; i++) expect((await login('cecil', 'nope')).status).toBe(401);
      expect((await login('cecil', 'pass123')).status).toBe(200);
    }
  });

  it('ignores X-Forwarded-For unless TRUST_PROXY is set: 20 failures from one address block it', async () => {
    await createAdmin(agent);
    for (let i = 0; i < 20; i++) expect((await login(`ghost${i}`, 'nope', `203.0.113.${i}`)).status).toBe(401);
    expect((await login('admin', 'admin123', '198.51.100.1')).status).toBe(429);
  });

  it('behind a trusted proxy, uses the address the proxy adds (not the one the visitor sent)', async () => {
    await createAdmin(agent);
    app.set('trust proxy', 1);
    // Nginx keeps what the visitor sent and appends the real address
    for (let i = 0; i < 20; i++) expect((await login(`ghost${i}`, 'nope', `10.9.9.${i}, 203.0.113.5`)).status).toBe(401);
    expect((await login('admin', 'admin123', '1.2.3.4, 203.0.113.5')).status).toBe(429);
    expect((await login('admin', 'admin123', '198.51.100.7')).status).toBe(200);
  });

  it('reads TRUST_PROXY', () => {
    expect([undefined, '', 'false', '0', 'true', '1', '2', 'loopback, 172.16.0.0/12'].map((v) => trustProxySetting(v)))
      .toEqual([false, false, false, false, 1, 1, 2, 'loopback, 172.16.0.0/12']);
  });
});
