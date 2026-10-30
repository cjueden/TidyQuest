import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type Database from 'better-sqlite3';
import type supertest from 'supertest';
import { initDatabase } from '../database';
import { createTestApp, createAdmin, createUser, loginAs, tokenFamily, HOSTED_RUN } from './setup';

// NEW-8: log out everywhere
let agent: supertest.Agent;
let db: Database.Database;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const me = (token: string) => agent.get('/api/auth/me').set(auth(token));

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

describe('Log out everywhere', () => {
  it('"Log out everywhere else" cuts off other devices and keeps this one signed in', async () => {
    const admin = await createAdmin(agent);
    const phone = await loginAs(agent, 'admin', 'admin123');
    expect((await me(phone)).status).toBe(200);

    const res = await agent.post('/api/auth/logout-others').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    expect((await me(phone)).status).toBe(401);
    expect((await me(admin.token)).status).toBe(401);
    expect((await me(res.body.token)).status).toBe(200);
    // A fresh login works as usual
    expect((await me(await loginAs(agent, 'admin', 'admin123'))).status).toBe(200);
  });

  it('a parent logs someone out of all devices; nobody else is affected', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });
    const other = await createUser(agent, admin.token, { username: 'sis', displayName: 'Sis', password: 'sis1' });

    expect((await agent.post(`/api/users/${kid.user.id}/logout-all`).set(auth(admin.token))).status).toBe(200);
    expect((await me(kid.token)).status).toBe(401);
    expect((await me(other.token)).status).toBe(200);
    expect((await me(admin.token)).status).toBe(200);
  });

  it('only a parent can log someone else out, and not themselves this way', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });
    const member = await createUser(agent, admin.token, { username: 'mom', displayName: 'Mom', password: 'mom1', role: 'member' });

    expect((await agent.post(`/api/users/${admin.user.id}/logout-all`).set(auth(kid.token))).status).toBe(403);
    expect((await agent.post(`/api/users/${kid.user.id}/logout-all`).set(auth(member.token))).status).toBe(403);
    expect((await agent.post(`/api/users/${admin.user.id}/logout-all`).set(auth(admin.token))).status).toBe(400);
    expect((await agent.post('/api/users/9999/logout-all').set(auth(admin.token))).status).toBe(404);
    expect((await me(admin.token)).status).toBe(200);
  });

  it('changing your own password logs out other devices but not this one', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });
    const tablet = await loginAs(agent, 'kid', 'kid1');

    const res = await agent.put(`/api/users/${kid.user.id}/password`).set(auth(kid.token))
      .send({ currentPassword: 'kid1', newPassword: 'kid2' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect((await me(tablet)).status).toBe(401);
    expect((await me(kid.token)).status).toBe(401);
    expect((await me(res.body.token)).status).toBe(200);
  });

  it('a wrong current password is refused without signing the person out', async () => {
    const admin = await createAdmin(agent);
    const res = await agent.put(`/api/users/${admin.user.id}/password`).set(auth(admin.token))
      .send({ currentPassword: 'nope', newPassword: 'admin456' });
    expect(res.status).toBe(403);
    expect((await me(admin.token)).status).toBe(200);
  });

  it("a parent resetting a kid's password logs the kid out everywhere", async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });

    const res = await agent.put(`/api/users/${kid.user.id}/password`).set(auth(admin.token)).send({ newPassword: 'kid2' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect((await me(kid.token)).status).toBe(401);
    expect((await me(admin.token)).status).toBe(200);
    expect((await me(await loginAs(agent, 'kid', 'kid2'))).status).toBe(200);
  });

  // BUG-12. Hosted mode ignores ADMIN_RESET_PASSWORD (hosted.test.ts)
  it.skipIf(HOSTED_RUN)('the server-side password reset (ADMIN_RESET_PASSWORD) logs the first parent out everywhere', async () => {
    const admin = await createAdmin(agent);
    const mom = await createUser(agent, admin.token, { username: 'mom', displayName: 'Mom', password: 'mom1', role: 'admin' });
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });
    const versions = () => db.prepare('SELECT id, tokenVersion FROM users ORDER BY id').all() as { id: number; tokenVersion: number }[];
    const before = versions();

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.ADMIN_RESET_PASSWORD = 'reset1234';
    initDatabase();
    log.mockRestore();

    expect(process.env.ADMIN_RESET_PASSWORD).toBeUndefined();
    expect(versions()).toEqual(before.map(u => ({ ...u, tokenVersion: u.tokenVersion + (u.id === admin.user.id ? 1 : 0) })));
    expect((await me(admin.token)).status).toBe(401);
    expect((await me(mom.token)).status).toBe(200);
    expect((await me(kid.token)).status).toBe(200);
    expect((await me(await loginAs(agent, 'admin', 'reset1234'))).status).toBe(200);
  });

  it("a removed person's login stops working", async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });
    expect((await agent.delete(`/api/users/${kid.user.id}`).set(auth(admin.token))).status).toBe(200);
    expect((await agent.get('/api/dashboard').set(auth(kid.token))).status).toBe(401);
  });

  it('logins made before this version (no token version) keep working until someone logs out everywhere', async () => {
    const admin = await createAdmin(agent);
    const { userId } = jwt.decode(admin.token) as { userId: number };
    // Re-signed with the tests' secret (setup.ts), without a version
    const old = jwt.sign({ userId, ...tokenFamily() }, process.env.JWT_SECRET!, { expiresIn: '30d' });
    expect((await me(old)).status).toBe(200);
    await agent.post('/api/auth/logout-others').set(auth(admin.token));
    expect((await me(old)).status).toBe(401);
  });

  it('a backup neither carries token versions nor brings back logins that were cut off', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'kid1' });
    const backup = (await agent.get('/api/export').set(auth(admin.token))).body;
    expect(backup.users.every((u: any) => !('tokenVersion' in u))).toBe(true);

    await agent.post(`/api/users/${kid.user.id}/logout-all`).set(auth(admin.token));
    const version = (db.prepare('SELECT tokenVersion FROM users WHERE id = ?').get(kid.user.id) as any).tokenVersion;
    expect(version).toBe(1);

    // Even a backup edited to hold an old version can't roll it back
    backup.users = backup.users.map((u: any) => ({ ...u, tokenVersion: 0 }));
    expect((await agent.post('/api/import').set(auth(admin.token)).send(backup)).status).toBe(200);
    expect((await me(kid.token)).status).toBe(401);
    expect((await me(admin.token)).status).toBe(200);
  });
});
