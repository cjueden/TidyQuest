import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import type { Express } from 'express';
import path from 'path';
import jwt from 'jsonwebtoken';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import db, { initDatabase } from '../database';
import { runInFamily } from '../hosted/context';
import { closeIdleFamilies, createFamily, deleteFamily, familyDir, openFamily, purgeDeletedFamilies } from '../hosted/families';
import { dataDir, mainDb } from '../hosted/mainDb';
import { generateToken } from '../middleware/auth';
import { addTestFamily, createAdmin, createTestApp, createUser } from './setup';

// Hosted mode (NEW-9): many families on one server, each with its own database and folder.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const HOUR = 60 * 60 * 1000;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let agent: supertest.Agent;
let app: Express;
let A: string;
let B: string;
let dbB: InstanceType<typeof Database>;
let adminA: { user: any; token: string };
let adminB: { user: any; token: string };

beforeEach(async () => {
  const t = createTestApp({ hosted: true });
  agent = t.agent;
  app = t.app;
  A = t.familyId!;
  ({ familyId: B, db: dbB } = addTestFamily());
  // The same username in both families
  adminA = await createAdmin(agent, 'admin', 'admin123', 'Admin A', A);
  adminB = await createAdmin(agent, 'admin', 'admin123', 'Admin B', B);
});

describe('Hosted mode: which family a request belongs to', () => {
  it('fails closed: the database outside a family throws', () => {
    expect(() => db.prepare('SELECT 1 FROM users')).toThrow(/No family/);
    expect(() => generateToken(adminA.user.id)).toThrow(/No family/);
  });

  it('logs the same username in to each family, and the token names the family', async () => {
    expect(adminA.user.displayName).toBe('Admin A');
    expect(adminB.user.displayName).toBe('Admin B');
    expect((jwt.decode(adminB.token) as { fid: string }).fid).toBe(B);
    expect((await agent.get('/api/auth/me').set(auth(adminB.token))).body.displayName).toBe('Admin B');
  });

  it('needs a family that exists to log in, and has no registration', async () => {
    const login = (extra: object) => agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123', ...extra });
    expect((await login({})).status).toBe(404);
    expect((await login({ familyId: 'zzzzzzzzzzzzzzzz' })).status).toBe(404);
    expect((await login({ familyId: '../families' })).status).toBe(404);
    expect((await login({ familyId: A })).status).toBe(200);
    const register = await agent.post('/api/auth/register').send({ username: 'new', password: 'pass123', displayName: 'New', familyId: A });
    expect(register.status).toBe(404);
  });

  it('shows the login page only the family asked for', async () => {
    expect((await agent.get('/api/auth/avatars')).status).toBe(404);
    const list = await agent.get(`/api/auth/avatars?family=${A}`);
    expect(list.body.map((u: { displayName: string }) => u.displayName)).toEqual(['Admin A']);
    expect((await agent.get(`/api/auth/registration-status?family=${B}`)).status).toBe(200);
  });

  it('turns away a token with no family, an unknown one, or a deleted one', async () => {
    const { userId } = jwt.decode(adminA.token) as { userId: number };
    const sign = (extra: object) => jwt.sign({ userId, v: 0, ...extra }, process.env.JWT_SECRET!);
    expect((await agent.get('/api/auth/me').set(auth(sign({})))).status).toBe(401);
    expect((await agent.get('/api/auth/me').set(auth(sign({ fid: 'zzzzzzzzzzzzzzzz' })))).status).toBe(401);
    deleteFamily(B);
    expect((await agent.get('/api/auth/me').set(auth(adminB.token))).status).toBe(401);
    expect((await agent.get('/api/auth/me').set(auth(adminA.token))).status).toBe(200);
  });

  it('says it is hosted in /api/version', async () => {
    expect((await agent.get('/api/version')).body.hosted).toBe(true);
  });
});

describe("Hosted mode: one family never reaches another's data", () => {
  it("keeps B's people, rooms and chores out of A's pages, and A's changes out of B", async () => {
    await createUser(agent, adminB.token, { username: 'kid', displayName: 'MARKER-B kid', password: 'pass123', familyId: B });
    const roomB = (await agent.post('/api/rooms').set(auth(adminB.token)).send({ name: 'MARKER-B room', roomType: 'other' })).body.id;
    await agent.post(`/api/rooms/${roomB}/tasks`).set(auth(adminB.token)).send({ name: 'MARKER-B chore', effort: 1 });
    await agent.post('/api/rewards').set(auth(adminB.token)).send({ title: 'MARKER-B reward', costCoins: 5 });

    for (const page of ['/api/users', '/api/rooms', '/api/dashboard', '/api/leaderboard', '/api/history', '/api/rewards', `/api/auth/avatars?family=${A}`]) {
      const res = await agent.get(page).set(auth(adminA.token));
      expect(res.status, page).toBe(200);
      expect(JSON.stringify(res.body), page).not.toContain('MARKER-B');
    }
    // A works on its own database: B's room is untouched whatever A does with that id
    await agent.put(`/api/rooms/${roomB}`).set(auth(adminA.token)).send({ name: 'Renamed by A' });
    await agent.delete(`/api/rooms/${roomB}`).set(auth(adminA.token));
    expect(dbB.prepare('SELECT name FROM rooms WHERE id = ?').get(roomB)).toEqual({ name: 'MARKER-B room' });
  });
});

describe('Hosted mode: avatars and proof photos', () => {
  it("saves an avatar in the family's folder and serves it only from the family's link", async () => {
    const up = await agent.post(`/api/users/${adminA.user.id}/avatar-upload`).set(auth(adminA.token))
      .attach('avatar', PNG, { filename: 'me.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.avatarPhotoUrl).toMatch(new RegExp(`^/api/files/${A}/avatars/user-\\d+-\\d+\\.png$`));
    const name = path.basename(up.body.avatarPhotoUrl);
    expect(fs.existsSync(path.join(familyDir(A), 'avatars', name))).toBe(true);

    const got = await agent.get(up.body.avatarPhotoUrl);
    expect(got.status).toBe(200);
    expect(got.headers['cache-control']).toContain('private');
    expect(got.headers['x-robots-tag']).toBe('noindex');
    expect((await agent.get(`/api/files/${B}/avatars/${name}`)).status).toBe(404);
    expect((await agent.get(`/api/files/${A}/proofs/${name}`)).status).toBe(404);
    expect((await agent.get(`/api/files/${A}/avatars/..%2F..%2F${A}%2Ftidyquest.db`)).status).toBe(404);
    expect((await agent.get(`/api/avatars/${name}`)).status).not.toBe(200);
  });

  it('keeps the family through an upload that arrives slowly', async () => {
    // Body chunks that come later arrive from the connection, outside the request's family (keepFamily)
    const server = app.listen(0);
    const boundary = 'tidyquest-boundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="me.png"\r\nContent-Type: image/png\r\n\r\n`),
      PNG,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({
        port: (server.address() as AddressInfo).port, method: 'POST', path: `/api/users/${adminA.user.id}/avatar-upload`,
        headers: { ...auth(adminA.token), 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      }, (res) => { res.resume(); resolve(res.statusCode!); });
      req.on('error', reject);
      req.flushHeaders();
      setTimeout(() => req.write(body.subarray(0, 40)), 30);
      setTimeout(() => req.end(body.subarray(40)), 60);
    });
    server.close();
    expect(status).toBe(200);
  });

  it("saves a proof photo in the family's folder", async () => {
    const kid = await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid', password: 'pass123', familyId: A });
    await agent.put('/api/users/strict-mode-config').set(auth(adminA.token)).send({ strictMode: true });
    const room = (await agent.post('/api/rooms').set(auth(adminA.token)).send({ name: 'Room', roomType: 'other' })).body.id;
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(adminA.token)).send({ name: 'Homework', effort: 1, onDemand: true })).body.id;
    const done = await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).send({});
    expect(done.body.pendingApproval).toBe(true);
    const up = await agent.post(`/api/completions/${done.body.completionId}/photo`).set(auth(kid.token))
      .attach('photo', PNG, { filename: 'card.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.photoUrl).toMatch(new RegExp(`^/api/files/${A}/proofs/proof-[0-9a-f]+\\.png$`));
    expect(fs.existsSync(path.join(familyDir(A), 'proofs', path.basename(up.body.photoUrl)))).toBe(true);
    expect((await agent.get(up.body.photoUrl)).status).toBe(200);
  });
});

describe('Hosted mode: family folders and open databases', () => {
  it('opens a family database on first use, closes it after an hour unused, and reopens it', () => {
    const id = createFamily('Folder family');
    expect(fs.existsSync(path.join(familyDir(id), 'tidyquest.db'))).toBe(true);
    const first = openFamily(id)!;
    runInFamily(first, () => db.prepare("INSERT INTO app_settings (key, value) VALUES ('marker', 'kept')").run());
    expect(openFamily(id)!.db).toBe(first.db);

    const later = Date.now() + 2 * HOUR;
    openFamily(A, later);
    openFamily(B, later);
    expect(closeIdleFamilies(later)).toBe(1);
    expect(first.db.open).toBe(false);
    const again = openFamily(id)!;
    expect(again.db).not.toBe(first.db);
    expect(runInFamily(again, () => db.prepare("SELECT value FROM app_settings WHERE key = 'marker'").get())).toEqual({ value: 'kept' });
  });

  it('moves a deleted family to deleted/ for 30 days, then removes it', () => {
    const id = createFamily('Leaving family');
    const when = new Date('2027-02-01T12:00:00Z');
    mainDb().prepare("INSERT INTO accounts (email, familyId, userId, createdAt) VALUES ('parent@example.com', ?, 1, ?)").run(id, when.toISOString());
    expect(deleteFamily(id, when)).toBe(true);
    expect(openFamily(id)).toBeNull();
    expect(fs.existsSync(familyDir(id))).toBe(false);
    const kept = path.join(dataDir(), 'deleted', `${id}-2027-02-01`);
    expect(fs.existsSync(path.join(kept, 'tidyquest.db'))).toBe(true);
    expect(mainDb().prepare('SELECT 1 FROM accounts WHERE familyId = ?').get(id)).toBeUndefined();

    expect(purgeDeletedFamilies(new Date('2027-02-20T12:00:00Z'))).toBe(0);
    expect(fs.existsSync(kept)).toBe(true);
    expect(purgeDeletedFamilies(new Date('2027-03-04T12:00:00Z'))).toBe(1);
    expect(fs.existsSync(kept)).toBe(false);
    expect(mainDb().prepare('SELECT 1 FROM families WHERE id = ?').get(id)).toBeUndefined();
  });

  it('ignores ADMIN_RESET_PASSWORD, which would reset some family\'s first parent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const family = openFamily(createFamily('Reset family'))!;
    runInFamily(family, () => db.prepare("INSERT INTO users (username, displayName, passwordHash, role) VALUES ('parent', 'Parent', 'old-hash', 'admin')").run());
    process.env.ADMIN_RESET_PASSWORD = 'reset1234';
    runInFamily(family, () => initDatabase());
    expect(family.db.prepare("SELECT passwordHash FROM users WHERE username = 'parent'").get()).toEqual({ passwordHash: 'old-hash' });
    expect(process.env.ADMIN_RESET_PASSWORD).toBeUndefined();
    warn.mockRestore();
  });
});
