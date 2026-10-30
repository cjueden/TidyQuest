import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { uploadDir } from '../hosted/files';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function family() {
  const admin = await createAdmin(agent);
  const kidA = await createUser(agent, admin.token, { username: 'kida', displayName: 'Kid A', password: 'pass123', role: 'child' });
  const kidB = await createUser(agent, admin.token, { username: 'kidb', displayName: 'Kid B', password: 'pass123', role: 'child' });
  await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Room', roomType: 'other' })).body.id as number;
  const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Report card A', effort: 1, onDemand: true, customCoins: 60 })).body.id as number;
  return { admin, kidA, kidB, room, task };
}

const coins = (userId: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number }).coins;

describe('Proof with a completion', () => {
  it('keeps a note and a photo from the kid, and shows them to the parent', async () => {
    const { admin, kidA, kidB, task } = await family();
    const done = await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token)).send({ note: '  Math test, 94%  ' });
    expect(done.body.pendingApproval).toBe(true);
    const id = done.body.completionId as number;

    expect((await agent.post(`/api/completions/${id}/photo`).set(auth(kidB.token)).attach('photo', PNG, { filename: 'a.png', contentType: 'image/png' })).status).toBe(403);
    const up = await agent.post(`/api/completions/${id}/photo`).set(auth(kidA.token)).attach('photo', PNG, { filename: 'card.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.photoUrl).toMatch(/^\/api\/(proofs|files\/[a-z0-9]{16}\/proofs)\/proof-[0-9a-f]{24}\.png$/);
    const saved = path.join(uploadDir('proofs'), path.basename(up.body.photoUrl));
    expect(fs.existsSync(saved)).toBe(true);
    expect((await agent.get(up.body.photoUrl)).status).toBe(200);

    const pending = (await agent.get('/api/completions/pending').set(auth(admin.token))).body.pending;
    expect(pending[0]).toMatchObject({ id, note: 'Math test, 94%', photoUrl: up.body.photoUrl });
    fs.rmSync(saved, { force: true });
  });

  it('refuses a file that is not an image', async () => {
    const { kidA, task } = await family();
    const id = (await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token))).body.completionId;
    const res = await agent.post(`/api/completions/${id}/photo`).set(auth(kidA.token)).attach('photo', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });
});

describe('Proof after approval (ENH-11)', () => {
  const photo = async (token: string, id: number) =>
    (await agent.post(`/api/completions/${id}/photo`).set(auth(token)).attach('photo', PNG, { filename: 'card.png', contentType: 'image/png' })).body.photoUrl as string;
  const fileOf = (url: string) => path.join(uploadDir('proofs'), path.basename(url));

  it('keeps the photo and note in Activity for parents and the kid who did it, not for others', async () => {
    const { admin, kidA, kidB, task } = await family();
    const id = (await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token)).send({ note: 'Math test, 94%' })).body.completionId as number;
    const url = await photo(kidA.token, id);
    await agent.post(`/api/completions/${id}/approve`).set(auth(admin.token)).expect(200);

    const entry = async (token: string) => ((await agent.get('/api/history').set(auth(token))).body.history as any[]).find((h) => h.id === id);
    expect(await entry(admin.token)).toMatchObject({ note: 'Math test, 94%', photoUrl: url });
    expect(await entry(kidA.token)).toMatchObject({ note: 'Math test, 94%', photoUrl: url });
    expect(await entry(kidB.token)).toMatchObject({ note: null, photoUrl: null });
    expect(fs.existsSync(fileOf(url))).toBe(true);
    fs.rmSync(fileOf(url), { force: true });
  });

  it('deletes the photo file when the completion goes (taken back, rejected, replaced, person deleted)', async () => {
    const { admin, kidA, task } = await family();
    const done = async () => (await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token))).body.completionId as number;

    const takenBack = await done();
    const first = await photo(kidA.token, takenBack);
    await agent.delete(`/api/completions/${takenBack}`).set(auth(kidA.token)).expect(200);
    expect(fs.existsSync(fileOf(first))).toBe(false);

    const rejected = await done();
    const second = await photo(kidA.token, rejected);
    await agent.delete(`/api/completions/${rejected}/reject`).set(auth(admin.token)).expect(200);
    expect(fs.existsSync(fileOf(second))).toBe(false);

    const kept = await done();
    const old = await photo(kidA.token, kept);
    const replaced = await photo(kidA.token, kept);
    expect(fs.existsSync(fileOf(old))).toBe(false);
    expect(fs.existsSync(fileOf(replaced))).toBe(true);

    await agent.delete(`/api/users/${kidA.user.id}`).set(auth(admin.token)).expect(200);
    expect(fs.existsSync(fileOf(replaced))).toBe(false);
  });
});

describe('Approving several at once', () => {
  it('approves the chosen ones, pays each, and skips ones already handled', async () => {
    const { admin, kidA, task } = await family();
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) ids.push((await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token))).body.completionId);
    await agent.post(`/api/completions/${ids[0]}/approve`).set(auth(admin.token)).expect(200);
    const before = coins(kidA.user.id);

    const res = await agent.post('/api/completions/approve-batch').set(auth(admin.token)).send({ ids });
    expect(res.body.approved).toEqual([ids[1], ids[2]]);
    expect(res.body.skipped).toEqual([{ id: ids[0], error: 'completion_not_pending' }]);
    expect(coins(kidA.user.id) - before).toBe(120);
  });

  it('rejects several at once, and only parents may do either', async () => {
    const { admin, kidA, task } = await family();
    const ids = [
      (await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token))).body.completionId,
      (await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token))).body.completionId,
    ];
    expect((await agent.post('/api/completions/approve-batch').set(auth(kidA.token)).send({ ids })).status).toBe(403);
    expect((await agent.post('/api/completions/approve-batch').set(auth(admin.token)).send({ ids: [] })).status).toBe(400);
    const res = await agent.post('/api/completions/reject-batch').set(auth(admin.token)).send({ ids });
    expect(res.body.rejected).toEqual(ids);
    expect(db.prepare("SELECT COUNT(*) AS n FROM task_completions WHERE status = 'pending'").get()).toEqual({ n: 0 });
  });
});

describe('Where waiting chores show up', () => {
  it('lists them for parents on Home, tells kids Strict Mode is on, and shows kids their own in Activity', async () => {
    const { admin, kidA, kidB, task } = await family();
    await agent.post(`/api/tasks/${task}/complete`).set(auth(kidA.token)).send({ note: 'B+ on science' });

    const adminDash = (await agent.get('/api/dashboard').set(auth(admin.token))).body;
    expect(adminDash.pendingCompletions).toHaveLength(1);
    expect(adminDash.pendingCompletions[0]).toMatchObject({ displayName: 'Kid A', taskName: 'Report card A', note: 'B+ on science' });

    const kidDash = (await agent.get('/api/dashboard').set(auth(kidA.token))).body;
    expect(kidDash.strictMode).toBe(true);
    expect(kidDash.pendingCompletions).toEqual([]);

    expect((await agent.get('/api/history').set(auth(kidA.token))).body.pending).toHaveLength(1);
    expect((await agent.get('/api/history').set(auth(kidB.token))).body.pending).toHaveLength(0);
  });

  it('has a "chore needs approval" notification type, on by default', async () => {
    const { admin } = await family();
    const cfg = (await agent.get('/api/users/notifications-config').set(auth(admin.token))).body;
    expect(cfg.notificationTypes.choreApproval).toBe(true);
  });
});
