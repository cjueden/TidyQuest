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

describe('Backup export and import', () => {
  it('round-trips every task setting, zones, room zones and participation', async () => {
    const { admin, kidA } = await family();
    const zone = (await agent.post('/api/zones').set(auth(admin.token)).send({ name: 'Outside' })).body.id as number;
    const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Yard', roomType: 'other' })).body.id as number;
    await agent.put(`/api/rooms/${room}`).set(auth(admin.token)).send({ zoneId: zone });
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({
      name: 'Mow', effort: 4, frequencyDays: 7, onDemand: true, showInDashboard: true, customCoins: 30, allowEarlyCompletion: true,
    })).body.id as number;
    await agent.put(`/api/users/${kidA.user.id}/participant`).set(auth(admin.token)).send({ isParticipant: false });

    const backup = (await agent.get('/api/export').set(auth(admin.token))).body;
    expect(backup.users.every((u: any) => u.passwordHash === undefined)).toBe(true);
    await agent.post('/api/import').set(auth(admin.token)).send(backup).expect(200);

    const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task) as any;
    expect([t.onDemand, t.showInDashboard, t.customCoins, t.allowEarlyCompletion]).toEqual([1, 1, 30, 1]);
    expect((db.prepare('SELECT zoneId FROM rooms WHERE id = ?').get(room) as any).zoneId).toBe(zone);
    expect((db.prepare('SELECT name FROM zones WHERE id = ?').get(zone) as any).name).toBe('Outside');
    expect((db.prepare('SELECT isParticipant FROM users WHERE id = ?').get(kidA.user.id) as any).isParticipant).toBe(0);
  });

  it('keeps existing passwords; new people get a random one', async () => {
    const { admin } = await family();
    // Compare stored hashes rather than logging in (auth has a 20-per-15-minutes rate limit)
    const hash = (username: string) => (db.prepare('SELECT passwordHash AS h FROM users WHERE username = ?').get(username) as { h: string } | undefined)?.h;
    const before = { admin: hash('admin'), kida: hash('kida'), kidb: hash('kidb') };
    const backup = (await agent.get('/api/export').set(auth(admin.token))).body;
    backup.users.push({ ...backup.users.find((u: any) => u.username === 'kidb'), id: 99, username: 'newkid', displayName: 'New' });
    await agent.post('/api/import').set(auth(admin.token)).send(backup).expect(200);

    expect(hash('admin')).toBe(before.admin);
    expect(hash('kida')).toBe(before.kida);
    expect(hash('newkid')).toBeTruthy();
    expect(hash('newkid')).not.toBe(before.kidb);
  });

  it('still imports an older backup that has no zones', async () => {
    const { admin } = await family();
    const zone = (await agent.post('/api/zones').set(auth(admin.token)).send({ name: 'Keep me' })).body.id as number;
    const backup = (await agent.get('/api/export').set(auth(admin.token))).body;
    delete backup.zones;
    await agent.post('/api/import').set(auth(admin.token)).send(backup).expect(200);
    expect(db.prepare('SELECT id FROM zones WHERE id = ?').get(zone)).toBeTruthy();
  });
});
