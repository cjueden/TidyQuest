import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import supertest from 'supertest';
import { setHosted } from '../hosted/context';
import { setEmailTransport, type Email } from '../hosted/email';
import { dataDir, mainDb } from '../hosted/mainDb';
import { operatorFromEnv } from '../hosted/operator';
import { HOSTED_RUN, addTestFamily, createAdmin, createTestApp, createUser } from './setup';

// Hosted step 7 (NEW-13): the operator page's accounts, its own tokens, the family list and its actions.
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const OP_EMAIL = 'op@tidyquest.example';
const OP_PASSWORD = 'operator-password-1';

let agent: supertest.Agent;
let A: string;
let B: string;
let adminA: { user: any; token: string };
let sent: Email[];

function makeOperator(email = OP_EMAIL, password = OP_PASSWORD) {
  vi.stubEnv('OPERATOR_EMAIL', email);
  vi.stubEnv('OPERATOR_PASSWORD', password);
  operatorFromEnv();
  vi.unstubAllEnvs();
}

async function operatorToken(email = OP_EMAIL, password = OP_PASSWORD): Promise<string> {
  const res = await agent.post('/api/operator/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

const families = async (token: string, query = '') => (await agent.get(`/api/operator/families${query}`).set(auth(token))).body;
const familyOf = async (token: string, id: string, query = '') => (await families(token, query)).families.find((f: any) => f.id === id);

beforeEach(async () => {
  const t = createTestApp({ hosted: true });
  agent = t.agent;
  A = t.familyId!;
  ({ familyId: B } = addTestFamily('The Bakers'));
  adminA = await createAdmin(agent, 'admin', 'admin123', 'Admin A', A);
  await createAdmin(agent, 'admin', 'admin123', 'Admin B', B);
  sent = [];
  setEmailTransport((e) => { sent.push(e); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setEmailTransport();
});

describe('Operator accounts from the compose file', () => {
  it('makes the account once, and a changed password signs it out everywhere', async () => {
    makeOperator();
    expect(mainDb().prepare('SELECT COUNT(*) AS n FROM operators').get()).toEqual({ n: 1 });
    const token = await operatorToken();
    makeOperator(); // the same password: nothing changes
    expect((await agent.get('/api/operator/me').set(auth(token))).body.email).toBe(OP_EMAIL);

    makeOperator(OP_EMAIL, 'a-brand-new-password');
    expect(mainDb().prepare('SELECT COUNT(*) AS n FROM operators').get()).toEqual({ n: 1 });
    expect((await agent.get('/api/operator/me').set(auth(token))).status).toBe(401);
    expect((await agent.post('/api/operator/login').send({ email: OP_EMAIL, password: OP_PASSWORD })).status).toBe(401);
    await operatorToken(OP_EMAIL, 'a-brand-new-password');
  });

  it('refuses a short password or a bad email, and does nothing when unset', () => {
    makeOperator(OP_EMAIL, 'short');
    makeOperator('not an email', OP_PASSWORD);
    operatorFromEnv();
    expect(mainDb().prepare('SELECT COUNT(*) AS n FROM operators').get()).toEqual({ n: 0 });
  });
});

describe('Operator login and tokens', () => {
  beforeEach(() => makeOperator());

  it('turns away a wrong password and an unknown email alike, then throttles', async () => {
    const wrong = await agent.post('/api/operator/login').send({ email: OP_EMAIL, password: 'nope' });
    const unknown = await agent.post('/api/operator/login').send({ email: 'who@example.com', password: OP_PASSWORD });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body.error).toBe(unknown.body.error);
    for (let i = 0; i < 9; i++) await agent.post('/api/operator/login').send({ email: OP_EMAIL, password: 'nope' });
    expect((await agent.post('/api/operator/login').send({ email: OP_EMAIL, password: OP_PASSWORD })).status).toBe(429);
  });

  it("a family's token can't open the operator page, and an operator's token can't open a family", async () => {
    const op = await operatorToken();
    expect((await agent.get('/api/operator/families').set(auth(adminA.token))).status).toBe(401);
    expect((await agent.post(`/api/operator/families/${B}/suspend`).set(auth(adminA.token))).status).toBe(401);
    expect((await agent.get('/api/operator/families')).status).toBe(401);
    for (const url of ['/api/auth/me', '/api/hosted/account', '/api/dashboard', '/api/export']) {
      expect((await agent.get(url).set(auth(op))).status).toBe(401);
    }
  });

  it('Sign out ends every operator session; a new password keeps only this one', async () => {
    const one = await operatorToken();
    const two = await operatorToken();
    expect((await agent.post('/api/operator/password').set(auth(one)).send({ current: 'wrong', password: 'another-long-password' })).status).toBe(400);
    expect((await agent.post('/api/operator/password').set(auth(one)).send({ current: OP_PASSWORD, password: 'short' })).status).toBe(400);
    const changed = await agent.post('/api/operator/password').set(auth(one)).send({ current: OP_PASSWORD, password: 'another-long-password' });
    expect(changed.status).toBe(200);
    expect((await agent.get('/api/operator/me').set(auth(two))).status).toBe(401);
    const three = changed.body.token;
    expect((await agent.get('/api/operator/me').set(auth(three))).status).toBe(200);
    await agent.post('/api/operator/logout').set(auth(three));
    expect((await agent.get('/api/operator/me').set(auth(three))).status).toBe(401);
  });
});

describe('The family list', () => {
  let op: string;
  beforeEach(async () => {
    makeOperator();
    op = await operatorToken();
  });

  it('shows each family with people, storage, status, plan and parents, nothing from inside', async () => {
    await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid A', password: 'kid12345', role: 'child', familyId: A });
    fs.writeFileSync(path.join(dataDir(), 'families', A, 'proofs', 'photo.png'), Buffer.alloc(2048));
    const list = await families(op);
    expect(list.totals).toMatchObject({ trial: 2, active: 0, suspended: 0, expired: 0, deleted: 0, newThisWeek: 2 });
    expect(list.found).toBe(2);
    const a = list.families.find((f: any) => f.id === A);
    expect(a).toMatchObject({ name: 'Family A', status: 'trial', plan: null, people: 2, filesBytes: 2048 });
    expect(a.parents).toEqual([{ email: `admin@${A}.example`, confirmed: false }]);
    expect(JSON.stringify(list)).not.toMatch(/Kid A|Admin A|passwordHash/);
  });

  it('finds a family by name, family code or parent email, and pages', async () => {
    const code = (mainDb().prepare('SELECT code FROM families WHERE id = ?').get(B) as { code: string }).code;
    for (const q of ['bakers', code.toUpperCase(), `admin@${B}`]) {
      const list = await families(op, `?q=${encodeURIComponent(q)}`);
      expect(list.families.map((f: any) => f.id)).toEqual([B]);
    }
    expect((await families(op, '?q=nobody-like-this')).found).toBe(0);
    expect((await families(op, '?offset=50')).families).toEqual([]);
    expect((await families(op, '?limit=1')).families).toHaveLength(1);
  });

  it('suspends and resumes: the family sees the paused page, then gets back in', async () => {
    expect((await agent.post(`/api/operator/families/${A}/suspend`).set(auth(op))).status).toBe(200);
    expect((await agent.get('/api/dashboard').set(auth(adminA.token))).body.code).toBe('suspended');
    expect((await agent.get('/api/export').set(auth(adminA.token))).status).toBe(200);
    expect((await families(op, '?status=suspended')).families.map((f: any) => f.id)).toEqual([A]);
    expect((await agent.post(`/api/operator/families/${A}/suspend`).set(auth(op))).status).toBe(400);

    expect((await agent.post(`/api/operator/families/${A}/resume`).set(auth(op))).status).toBe(200);
    expect((await agent.get('/api/dashboard').set(auth(adminA.token))).status).toBe(200);
    expect((await familyOf(op, A)).status).toBe('trial');
    expect((await agent.post(`/api/operator/families/${A}/resume`).set(auth(op))).status).toBe(400);
  });

  it('resumes a family with a plan as active', async () => {
    mainDb().prepare("UPDATE families SET plan = 'family' WHERE id = ?").run(B);
    await agent.post(`/api/operator/families/${B}/suspend`).set(auth(op));
    await agent.post(`/api/operator/families/${B}/resume`).set(auth(op));
    expect((await familyOf(op, B)).status).toBe('active');
  });

  it('deletes only with the family name typed again, to deleted/', async () => {
    expect((await agent.post(`/api/operator/families/${A}/delete`).set(auth(op)).send({ name: 'Family' })).status).toBe(400);
    expect((await agent.post(`/api/operator/families/${A}/delete`).set(auth(op)).send({ name: ' family a ' })).status).toBe(200);
    expect(fs.readdirSync(path.join(dataDir(), 'deleted')).some((name) => name.startsWith(`${A}-`))).toBe(true);
    expect((await agent.get('/api/auth/me').set(auth(adminA.token))).status).toBe(401);
    const list = await families(op);
    expect(list.families.map((f: any) => f.id)).toEqual([B]);
    expect(list.totals.deleted).toBe(1);
    expect((await familyOf(op, A, '?status=deleted'))).toMatchObject({ status: 'deleted', people: null, parents: [] });
    expect((await agent.post(`/api/operator/families/${A}/suspend`).set(auth(op))).status).toBe(404);
  });

  it("resends the confirmation email to a parent who hasn't confirmed, only in that family", async () => {
    const email = `admin@${A}.example`;
    const res = await agent.post(`/api/operator/families/${A}/resend-confirmation`).set(auth(op)).send({ email });
    expect(res.status).toBe(200);
    expect(sent.map((e) => e.to)).toEqual([email]);
    expect(sent[0].text).toContain('/confirm-email?token=');
    expect((await agent.post(`/api/operator/families/${B}/resend-confirmation`).set(auth(op)).send({ email })).status).toBe(404);

    mainDb().prepare("UPDATE accounts SET emailConfirmedAt = '2026-10-29T00:00:00Z' WHERE email = ?").run(email);
    expect((await agent.post(`/api/operator/families/${A}/resend-confirmation`).set(auth(op)).send({ email })).status).toBe(400);
    expect(sent).toHaveLength(1);
  });
});

describe.skipIf(HOSTED_RUN)('Self-hosted', () => {
  it('has no operator page', async () => {
    setHosted(false); // the beforeEach above made a hosted server
    const t = createTestApp();
    // It answers like any path the server doesn't have
    const unknown = (await t.agent.post('/api/no-such-page').send({})).status;
    const login = await t.agent.post('/api/operator/login').send({ email: OP_EMAIL, password: OP_PASSWORD });
    expect(login.status).toBe(unknown);
    expect(login.body.token).toBeUndefined();
  });
});
