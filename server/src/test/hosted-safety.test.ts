import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import supertest from 'supertest';
import type Database from 'better-sqlite3';
import db from '../database';
import { createApp } from '../index';
import { currentFamily, runInFamily } from '../hosted/context';
import { familyDir, openFamily } from '../hosted/families';
import { forEachFamily } from '../hosted/jobs';
import { mainDb } from '../hosted/mainDb';
import { sendNtfyMessageDetailed } from '../utils/notifications';
import { getPeople, personalChannels } from '../utils/notify';
import { addTestFamily, createAdmin, createTestApp, createUser, familyField } from './setup';

// Hosted step 6 (NEW-12): notification addresses, limits, throttling in main.db, security headers,
// family status and proof photos. ADMIN_RESET_PASSWORD is in hosted.test.ts (NEW-9).
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const MB = 1024 * 1024;

let agent: supertest.Agent;
let A: string;
let B: string;
let dbA: InstanceType<typeof Database>;
let adminA: { user: any; token: string };
let adminB: { user: any; token: string };

beforeEach(async () => {
  const t = createTestApp({ hosted: true });
  agent = t.agent;
  A = t.familyId!;
  dbA = t.db;
  ({ familyId: B } = addTestFamily());
  adminA = await createAdmin(agent, 'admin', 'admin123', 'Admin A', A);
  adminB = await createAdmin(agent, 'admin', 'admin123', 'Admin B', B);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const inA = <T>(fn: () => T) => runInFamily(openFamily(A)!, fn);

/** A chore done by this parent, for a photo to go with. */
async function completion(token: string): Promise<number> {
  const room = (await agent.post('/api/rooms').set(auth(token)).send({ name: 'Room', roomType: 'other' })).body.id;
  const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(token)).send({ name: 'Homework', effort: 1, onDemand: true })).body.id;
  return (await agent.post(`/api/tasks/${task}/complete`).set(auth(token)).send({})).body.completionId;
}
const uploadPhoto = (token: string, id: number, file: Buffer = PNG) =>
  agent.post(`/api/completions/${id}/photo`).set(auth(token)).attach('photo', file, { filename: 'card.png', contentType: 'image/png' });
const proofFiles = (familyId: string) => fs.readdirSync(path.join(familyDir(familyId), 'proofs'));

describe('Hosted safety: notification addresses', () => {
  it('refuses a custom ntfy server and Home Assistant when saved', async () => {
    const config = (body: object) => agent.put('/api/users/notifications-config').set(auth(adminA.token)).send(body);
    expect((await config({ ntfyServerUrl: 'http://192.168.1.10:8080' })).body.code).toBe('ntfy-sh-only');
    expect((await config({ ntfyServerUrl: 'https://ntfy.sh.evil.example' })).status).toBe(400);
    expect((await config({ ntfyServerUrl: 'https://ntfy.sh:8443' })).status).toBe(400);
    expect((await config({ ntfyServerUrl: 'https://ntfy.sh/', ntfyTopic: 'okafor-chores' })).status).toBe(200);

    const ha = await agent.put('/api/notify/settings').set(auth(adminA.token)).send({ haUrl: 'http://10.0.0.5:8123', haToken: 'secret' });
    expect(ha.body.error).toBe('ha_off');
    expect((await agent.put('/api/notify/settings').set(auth(adminA.token)).send({ quietStart: '21:00', quietEnd: '07:00', haUrl: '' })).status).toBe(200);
    expect((await agent.put(`/api/notify/people/${adminA.user.id}`).set(auth(adminA.token)).send({ haNotifyService: 'notify.phone' })).body.error).toBe('ha_off');
    expect((await agent.put(`/api/notify/people/${adminA.user.id}`).set(auth(adminA.token)).send({ ntfyTopic: 'dad', haNotifyService: '' })).status).toBe(200);
  });

  it('refuses them when sent, even if they got into the database', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    const test = await agent.post('/api/users/notifications-test').set(auth(adminA.token))
      .send({ provider: 'ntfy', ntfyServerUrl: 'http://127.0.0.1:9', ntfyTopic: 'x' });
    expect(test.status).toBe(400);
    expect(test.body.error).toMatch(/ntfy\.sh/);

    inA(() => {
      const set = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
      set.run('ntfyServerUrl', 'http://10.0.0.5');
      set.run('haUrl', 'http://10.0.0.5:8123');
      set.run('haToken', 'secret');
      db.prepare("UPDATE users SET haNotifyService = 'notify.phone'").run();
      // Home Assistant isn't one of anyone's channels, so nothing is ever sent to it
      expect(personalChannels(getPeople()[0])).toEqual([]);
    });
    const sent = await inA(() => sendNtfyMessageDetailed('Hi', { ignoreEnabled: true, topic: 'family' }));
    expect(sent).toEqual({ ok: false, error: 'Only ntfy.sh can be used on this server.' });
    expect(fetch).not.toHaveBeenCalled();
    expect((await agent.post(`/api/notify/people/${adminA.user.id}/test`).set(auth(adminA.token))).body.error).toBe('no_channels');

    // ntfy.sh itself is fine
    inA(() => db.prepare("UPDATE app_settings SET value = 'https://ntfy.sh' WHERE key = 'ntfyServerUrl'").run());
    expect(await inA(() => sendNtfyMessageDetailed('Hi', { ignoreEnabled: true, topic: 'family' }))).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('https://ntfy.sh/family', expect.anything());
  });

  it("drops them from an import, with the custom server's topics", async () => {
    const backup = (await agent.get('/api/export').set(auth(adminA.token))).body;
    const setting = (key: string, value: string) => {
      backup.settings = backup.settings.filter((s: any) => s.key !== key).concat({ key, value });
    };
    setting('haUrl', 'http://homeassistant.local:8123');
    setting('haToken', 'secret');
    setting('ntfyServerUrl', 'https://ntfy.home.example');
    setting('ntfyTopic', 'chores');
    setting('ntfyEnabled', '1');
    backup.users[0] = { ...backup.users[0], haNotifyService: 'notify.phone', ntfyTopic: 'dad' };
    expect((await agent.post('/api/import').set(auth(adminA.token)).send(backup)).status).toBe(200);

    inA(() => {
      const get = (key: string) => (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string }).value;
      expect([get('haUrl'), get('haToken'), get('ntfyServerUrl'), get('ntfyTopic'), get('ntfyEnabled')]).toEqual(['', '', 'https://ntfy.sh', '', '0']);
      expect(db.prepare('SELECT haNotifyService, ntfyTopic FROM users').get()).toEqual({ haNotifyService: null, ntfyTopic: null });
    });
  });
});

describe('Hosted safety: limits', () => {
  it('has up to 15 people in a family (MAX_PEOPLE), counting imports', async () => {
    vi.stubEnv('MAX_PEOPLE', '3');
    for (const name of ['kid1', 'kid2']) await createUser(agent, adminA.token, { username: name, displayName: name, password: 'pass123', familyId: A });
    const fourth = await agent.post('/api/users').set(auth(adminA.token)).send({ username: 'kid3', displayName: 'Kid 3', password: 'pass123', role: 'child' });
    expect(fourth.status).toBe(403);
    expect(fourth.body).toMatchObject({ code: 'people-limit', limit: 3 });
    // Family B has its own count
    expect((await agent.post('/api/users').set(auth(adminB.token)).send({ username: 'kid1', displayName: 'Kid', password: 'pass123', role: 'child' })).status).toBe(201);

    const backup = (await agent.get('/api/export').set(auth(adminA.token))).body;
    backup.users.push({ ...backup.users[1], id: 99, username: 'extra' });
    expect((await agent.post('/api/import').set(auth(adminA.token)).send(backup)).body.code).toBe('people-limit');
    vi.unstubAllEnvs();
    expect((await agent.post('/api/users').set(auth(adminA.token)).send({ username: 'kid3', displayName: 'Kid 3', password: 'pass123', role: 'child' })).status).toBe(201);
  });

  it('takes imports up to 5 MB (MAX_IMPORT_MB), and says so beyond', async () => {
    const big = { users: [], rooms: [], tasks: [], completions: [], padding: 'x'.repeat(5.2 * MB) };
    const res = await agent.post('/api/import').set(auth(adminA.token)).send(big);
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ code: 'too-large', limit: 5 });
  });

  it('takes photos up to 5 MB (MAX_PHOTO_MB) and keeps none that are refused', async () => {
    const id = await completion(adminA.token);
    const big = Buffer.concat([PNG, Buffer.alloc(5.2 * MB)]);
    const res = await uploadPhoto(adminA.token, id, big);
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ code: 'too-large', limit: 5 });
    expect(proofFiles(A)).toEqual([]);
  });

  it("counts each family's files against its own space (MAX_FILES_MB, 200)", async () => {
    vi.stubEnv('MAX_FILES_MB', String(100 / MB)); // room for one tiny photo
    const id = await completion(adminA.token);
    expect((await uploadPhoto(adminA.token, id)).status).toBe(200);
    const full = await uploadPhoto(adminA.token, id);
    expect(full.status).toBe(413);
    expect(full.body).toMatchObject({ code: 'storage-full' });
    expect(proofFiles(A)).toHaveLength(1);
    const avatar = await agent.post(`/api/users/${adminA.user.id}/avatar-upload`).set(auth(adminA.token))
      .attach('avatar', PNG, { filename: 'me.png', contentType: 'image/png' });
    expect(avatar.body.code).toBe('storage-full');
    expect(fs.readdirSync(path.join(familyDir(A), 'avatars'))).toEqual([]);

    // Family B's space is its own
    runInFamily(openFamily(B)!, () => db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('features', '{\"proofPhotos\":true}')").run());
    expect((await uploadPhoto(adminB.token, await completion(adminB.token))).status).toBe(200);
  });
});

describe('Hosted safety: throttling in main.db', () => {
  it('counts failed logins per name and per address in main.db, so a restart changes nothing', async () => {
    const login = (app: supertest.Agent, password: string) => app.post('/api/auth/login').send({ username: 'admin', password, ...familyField(A) });
    for (let i = 0; i < 10; i++) expect((await login(agent, 'wrong')).status).toBe(401);
    expect((await login(agent, 'admin123')).status).toBe(429);

    const rows = mainDb().prepare("SELECT key, count FROM throttle WHERE key LIKE 'fail:%' ORDER BY key").all() as { key: string; count: number }[];
    expect(rows.map((r) => r.key.replace(/ip:.*/, 'ip:…'))).toEqual(['fail:ip:…', expect.stringMatching(/^fail:user:[a-z0-9]+\/admin$/)]);
    expect(rows.every((r) => r.count === 10)).toBe(true);

    // A new server on the same main.db still says no
    const restarted = supertest.agent(createApp());
    expect((await login(restarted, 'admin123')).status).toBe(429);
    // The same username in family B isn't blocked
    expect((await restarted.post('/api/auth/login').send({ username: 'admin', password: 'admin123', ...familyField(B) })).status).toBe(200);
  });

  it('counts sign-ups per address in main.db too', async () => {
    for (let i = 0; i < 6; i++) await agent.post('/api/hosted/signup').send({ familyName: 'X', parentName: 'Y', email: `p${i}@example.com`, password: 'longpassword', timeZone: 'UTC' });
    expect(mainDb().prepare("SELECT count FROM throttle WHERE key LIKE 'try:signup:%'").get()).toEqual({ count: 5 });
  });
});

describe('Hosted safety: security headers and CORS', () => {
  it('sends security headers, and CORS answers no other site', async () => {
    const res = await agent.get('/api/version').set('Origin', 'https://evil.example');
    expect(res.headers['content-security-policy']).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('on https, also HSTS, and CORS for the app itself', async () => {
    vi.stubEnv('PUBLIC_URL', 'https://app.tidyquest.org/');
    const app = supertest(createApp());
    const own = await app.get('/api/version').set('Origin', 'https://app.tidyquest.org');
    expect(own.headers['access-control-allow-origin']).toBe('https://app.tidyquest.org');
    expect(own.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(own.headers['content-security-policy']).toContain('upgrade-insecure-requests');
    // Another site is only ever told the app's own address, so its browser refuses the answer
    expect((await app.get('/api/version').set('Origin', 'https://evil.example')).headers['access-control-allow-origin']).toBe('https://app.tidyquest.org');
  });
});

describe('Hosted safety: family status', () => {
  const setFamily = (fields: string, ...values: unknown[]) => mainDb().prepare(`UPDATE families SET ${fields} WHERE id = ?`).run(...values, A);

  it('lets a suspended family sign in, see why, and export; nothing else', async () => {
    setFamily("status = 'suspended'");
    const dashboard = await agent.get('/api/dashboard').set(auth(adminA.token));
    expect(dashboard.status).toBe(403);
    expect(dashboard.body.code).toBe('suspended');
    expect((await agent.get('/api/export').set(auth(adminA.token))).status).toBe(200);
    expect((await agent.get('/api/hosted/account').set(auth(adminA.token))).body.status).toBe('suspended');
    expect((await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123', ...familyField(A) })).status).toBe(200);
    expect((await agent.get('/api/dashboard').set(auth(adminB.token))).status).toBe(200);
  });

  it('counts an ended trial as expired only with billing on (decision 11)', async () => {
    setFamily('trialEndsAt = ?', new Date(Date.now() - 1000).toISOString());
    expect((await agent.get('/api/dashboard').set(auth(adminA.token))).status).toBe(200);
    expect((await agent.get('/api/hosted/account').set(auth(adminA.token))).body.status).toBe('trial');

    vi.stubEnv('PAYMENT_KEY', 'test');
    const dashboard = await agent.get('/api/dashboard').set(auth(adminA.token));
    expect(dashboard.status).toBe(403);
    expect(dashboard.body.code).toBe('expired');
    expect((await agent.get('/api/hosted/account').set(auth(adminA.token))).body.status).toBe('expired');
    expect((await agent.get('/api/export').set(auth(adminA.token))).status).toBe(200);

    // A family on a plan gets in
    setFamily("status = 'active', plan = 'family'");
    expect((await agent.get('/api/dashboard').set(auth(adminA.token))).status).toBe(200);
  });

  it("skips suspended and expired families' background jobs", async () => {
    vi.stubEnv('PAYMENT_KEY', 'test');
    const ran = async () => {
      const ids: string[] = [];
      await forEachFamily(() => { ids.push(currentFamily()!.familyId); });
      return ids.sort();
    };
    expect(await ran()).toEqual([A, B].sort());
    setFamily('trialEndsAt = ?', new Date(Date.now() - 1000).toISOString());
    expect(await ran()).toEqual([B]);
    mainDb().prepare("UPDATE families SET status = 'suspended' WHERE id = ?").run(B);
    expect(await ran()).toEqual([]);
  });
});

describe('Hosted safety: proof photos', () => {
  it('start off in hosted mode; a parent can turn them on', async () => {
    dbA.prepare("DELETE FROM app_settings WHERE key = 'features'").run();
    const features = (await agent.get('/api/features').set(auth(adminA.token))).body.features;
    expect(features).toMatchObject({ proofPhotos: false, rescue: true });
    const id = await completion(adminA.token);
    const off = await uploadPhoto(adminA.token, id);
    expect(off.status).toBe(403);
    expect(off.body.code).toBe('proof-photos-off');
    expect(proofFiles(A)).toEqual([]);

    const kid = await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid', password: 'pass123', familyId: A });
    expect((await agent.put('/api/features').set(auth(kid.token)).send({ features: { proofPhotos: true } })).status).toBe(403);
    await agent.put('/api/features').set(auth(adminA.token)).send({ features: { proofPhotos: true } }).expect(200);
    expect(JSON.parse((dbA.prepare("SELECT value FROM app_settings WHERE key = 'features'").get() as { value: string }).value)).toEqual({ proofPhotos: true });
    expect((await uploadPhoto(adminA.token, id)).status).toBe(200);
    expect((await agent.get('/api/dashboard').set(auth(adminA.token))).body.features.proofPhotos).toBe(true);
  });
});
