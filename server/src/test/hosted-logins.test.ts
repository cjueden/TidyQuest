import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type supertest from 'supertest';
import { runInFamily } from '../hosted/context';
import { deleteFamily, openFamily } from '../hosted/families';
import { mainDb } from '../hosted/mainDb';
import { setEmailTransport, type Email } from '../hosted/email';
import { setCaptchaCheck } from '../hosted/signup';
import db from '../database';
import { addTestFamily, createAdmin, createTestApp, createUser, familyCodeOf } from './setup';

// Hosted mode (NEW-10): parents sign in with their email, everyone with the family code; sign-up,
// confirming the email, forgot password and changing the email.
const DAY = 24 * 60 * 60 * 1000;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let agent: supertest.Agent;
let A: string;
let B: string;
let adminA: { user: any; token: string };
let sent: Email[];

const linkToken = (email: Email) => /token=([\w-]+)/.exec(email.text)?.[1];
const lastTo = (to: string) => [...sent].reverse().find((e) => e.to === to)!;

beforeEach(async () => {
  const t = createTestApp({ hosted: true });
  agent = t.agent;
  A = t.familyId!;
  ({ familyId: B } = addTestFamily());
  adminA = await createAdmin(agent, 'admin', 'admin123', 'Admin A', A);
  await createAdmin(agent, 'admin', 'admin123', 'Admin B', B);
  sent = [];
  setEmailTransport((e) => { sent.push(e); });
});

afterEach(() => {
  setEmailTransport();
  setCaptchaCheck();
  vi.useRealTimers();
});

const signup = (extra: object = {}) => agent.post('/api/hosted/signup').send({
  familyName: 'The Okafors', parentName: 'Zoë Okafor', email: 'Zoe@Example.com', password: 'longpassword',
  timeZone: 'Pacific/Auckland', language: 'fr', ...extra,
});

describe('Hosted sign-up', () => {
  it('makes the family, its first parent and code, sends the confirmation and signs the parent in', async () => {
    const res = await signup();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'zoeokafor', displayName: 'Zoë Okafor', role: 'admin', language: 'fr' });
    expect(res.body.user.passwordHash).toBeUndefined();
    const { fid } = jwt.decode(res.body.token) as { fid: string };
    const family = mainDb().prepare('SELECT name, status, code, trialEndsAt, createdAt FROM families WHERE id = ?').get(fid) as any;
    expect(family).toMatchObject({ name: 'The Okafors', status: 'trial' });
    expect(family.code).toMatch(/^[a-z]+-[a-z]+-\d\d$/);
    expect(new Date(family.trialEndsAt).getTime() - new Date(family.createdAt).getTime()).toBe(30 * DAY);
    expect(mainDb().prepare('SELECT email, emailConfirmedAt FROM accounts WHERE familyId = ?').get(fid))
      .toEqual({ email: 'zoe@example.com', emailConfirmedAt: null });
    runInFamily(openFamily(fid)!, () => {
      expect(db.prepare("SELECT value FROM app_settings WHERE key = 'timeZone'").get()).toEqual({ value: 'Pacific/Auckland' });
    });
    // The confirmation email, in the parent's language, with a link
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('zoe@example.com');
    expect(sent[0].subject).toBe('Confirmez votre e-mail pour TidyQuest');
    expect(sent[0].text).toContain('/confirm-email?token=');
    const me = await agent.get('/api/hosted/account').set(auth(res.body.token));
    expect(me.body).toMatchObject({ familyName: 'The Okafors', familyCode: family.code, email: 'zoe@example.com', emailConfirmed: false, locked: false, isParent: true });
    expect(me.body.familyLink).toMatch(new RegExp(`/${family.code}$`));
  });

  it('turns away a used email, a short password, a bad email and a failed CAPTCHA', async () => {
    expect((await signup()).status).toBe(201);
    const again = await signup({ familyName: 'Another' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('email-taken');
    expect((await signup({ email: 'new@example.com', password: 'short' })).body.code).toBe('short-password');
    expect((await signup({ email: 'not-an-email' })).body.code).toBe('bad-email');
    setCaptchaCheck(async (token) => token === 'good');
    expect((await signup({ email: 'bot@example.com', captchaToken: 'bad' })).body.code).toBe('captcha');
    expect((await signup({ email: 'human@example.com', captchaToken: 'good' })).status).toBe(201);
    // Nothing half-made: one family per successful sign-up, plus A and B
    expect((mainDb().prepare('SELECT COUNT(*) AS n FROM families').get() as { n: number }).n).toBe(4);
  });

  it('asks to agree to the terms once there are terms', async () => {
    process.env.TERMS_URL = 'https://tidyquest.org/terms';
    try {
      expect((await agent.get('/api/hosted/config')).body.termsUrl).toBe('https://tidyquest.org/terms');
      expect((await signup()).status).toBe(400);
      expect((await signup({ acceptTerms: true })).status).toBe(201);
    } finally {
      delete process.env.TERMS_URL;
    }
  });
});

describe('Hosted logins', () => {
  it('signs a parent in with their email, in any capitals', async () => {
    const res = await agent.post('/api/auth/login').send({ email: ' ADMIN@' + A.toUpperCase() + '.EXAMPLE ', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Admin A');
    expect((jwt.decode(res.body.token) as { fid: string }).fid).toBe(A);
    expect((await agent.post('/api/auth/login').send({ email: `admin@${A}.example`, password: 'wrong' })).status).toBe(401);
    expect((await agent.post('/api/auth/login').send({ email: 'nobody@example.com', password: 'admin123' })).status).toBe(401);
  });

  it('logs the same username in to each family by its code', async () => {
    const kidA = await createUser(agent, adminA.token, { username: 'sam', displayName: 'Sam A', password: 'pass123', role: 'child', familyId: A });
    const adminB = await agent.post('/api/auth/login').send({ email: `admin@${B}.example`, password: 'admin123' });
    const kidB = await createUser(agent, adminB.body.token, { username: 'sam', displayName: 'Sam B', password: 'other456', role: 'child', familyId: B });
    expect(kidA.user.displayName).toBe('Sam A');
    expect(kidB.user.displayName).toBe('Sam B');
    // Each password works only in its own family
    const code = familyCodeOf(A);
    expect((await agent.post('/api/auth/login').send({ familyCode: code, username: 'sam', password: 'other456' })).status).toBe(401);
    // Capitals, spaces and dashes in the code don't matter
    const typed = code.toUpperCase().replace(/-/g, ' ');
    expect((await agent.post('/api/auth/login').send({ familyCode: typed, username: 'SAM', password: 'pass123' })).status).toBe(200);
    expect((await agent.post('/api/auth/login').send({ familyCode: code.replace(/-/g, ''), username: 'sam', password: 'pass123' })).status).toBe(200);
  });

  it('answers a wrong family code like a wrong password, and keeps kids off email sign-in', async () => {
    const wrong = await agent.post('/api/auth/login').send({ familyCode: 'nosuch-family-00', username: 'admin', password: 'admin123' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe('Invalid credentials');
    // The code alone shows nobody
    expect((await agent.get(`/api/auth/avatars?familyCode=${familyCodeOf(A)}`)).body).toEqual([]);
    // A parent demoted to member keeps the code login but not the email one
    runInFamily(openFamily(A)!, () => db.prepare("UPDATE users SET role = 'member' WHERE username = 'admin'").run());
    expect((await agent.post('/api/auth/login').send({ email: `admin@${A}.example`, password: 'admin123' })).status).toBe(401);
    expect((await agent.post('/api/auth/login').send({ familyCode: familyCodeOf(A), username: 'admin', password: 'admin123' })).status).toBe(200);
  });

  it('gives a new code: the old one stops working, and only parents can do it', async () => {
    const old = familyCodeOf(A);
    const kid = await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child', familyId: A });
    expect((await agent.post('/api/hosted/family-code').set(auth(kid.token))).status).toBe(403);
    const res = await agent.post('/api/hosted/family-code').set(auth(adminA.token));
    expect(res.body.familyCode).not.toBe(old);
    expect(res.body.familyLink).toMatch(new RegExp(`/${res.body.familyCode}$`));
    expect((await agent.post('/api/auth/login').send({ familyCode: old, username: 'kid', password: 'pass123' })).status).toBe(401);
    expect((await agent.post('/api/auth/login').send({ familyCode: res.body.familyCode, username: 'kid', password: 'pass123' })).status).toBe(200);
    // Signed-in devices stay signed in
    expect((await agent.get('/api/auth/me').set(auth(kid.token))).status).toBe(200);
  });

  it("signs out a deleted family's people and frees their email", async () => {
    deleteFamily(A);
    expect((await agent.get('/api/auth/me').set(auth(adminA.token))).status).toBe(401);
    expect((await agent.post('/api/auth/login').send({ email: `admin@${A}.example`, password: 'admin123' })).status).toBe(401);
    expect((await signup({ email: `admin@${A}.example` })).status).toBe(201);
  });
});

describe('Hosted: confirming the email', () => {
  it('confirms with the link, once', async () => {
    const res = await signup();
    const token = linkToken(sent[0]);
    expect((await agent.post('/api/hosted/confirm-email').send({ token })).body).toEqual({ ok: true, email: 'zoe@example.com' });
    expect((await agent.post('/api/hosted/confirm-email').send({ token })).body.code).toBe('link-expired');
    const me = await agent.get('/api/hosted/account').set(auth(res.body.token));
    expect(me.body).toMatchObject({ emailConfirmed: true, confirmBy: null });
  });

  it('locks the family 30 days after sign-up until a parent confirms; confirming and export still work', async () => {
    const res = await signup();
    const { fid } = jwt.decode(res.body.token) as { fid: string };
    const kid = await createUser(agent, res.body.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child', familyId: fid });
    expect((await agent.get('/api/dashboard').set(auth(kid.token))).status).toBe(200);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 30 * DAY + 60_000);
    // Signing in still works (logins last 30 days, so these are new), so a parent can confirm or export
    const parent = (await agent.post('/api/auth/login').send({ email: 'zoe@example.com', password: 'longpassword' })).body.token;
    const kidToken = (await agent.post('/api/auth/login').send({ familyCode: familyCodeOf(fid), username: 'kid', password: 'pass123' })).body.token;
    const blocked = await agent.get('/api/dashboard').set(auth(kidToken));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('confirm-email');
    expect((await agent.get('/api/hosted/account').set(auth(kidToken))).body.locked).toBe(true);
    expect((await agent.get('/api/auth/me').set(auth(kidToken))).status).toBe(200);
    expect((await agent.get('/api/export').set(auth(parent))).status).toBe(200);

    // The first link has expired by now; a new one works
    expect((await agent.post('/api/hosted/confirm-email').send({ token: linkToken(sent[0]) })).status).toBe(400);
    expect((await agent.post('/api/hosted/resend-confirmation').set(auth(parent))).status).toBe(200);
    expect((await agent.post('/api/hosted/confirm-email').send({ token: linkToken(lastTo('zoe@example.com')) })).status).toBe(200);
    expect((await agent.get('/api/dashboard').set(auth(kidToken))).status).toBe(200);
  });

  it("doesn't lock A for B's unconfirmed email, or a family that confirmed", async () => {
    mainDb().prepare('UPDATE accounts SET emailConfirmedAt = ? WHERE familyId = ?').run(new Date().toISOString(), A);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31 * DAY);
    const token = (await agent.post('/api/auth/login').send({ email: `admin@${A}.example`, password: 'admin123' })).body.token;
    expect((await agent.get('/api/dashboard').set(auth(token))).status).toBe(200);
    const tokenB = (await agent.post('/api/auth/login').send({ email: `admin@${B}.example`, password: 'admin123' })).body.token;
    expect((await agent.get('/api/dashboard').set(auth(tokenB))).status).toBe(403);
  });
});

describe('Hosted: forgot password', () => {
  it('answers the same for any email, and sends a link only to an account', async () => {
    const unknown = await agent.post('/api/hosted/forgot-password').send({ email: 'nobody@example.com' });
    const known = await agent.post('/api/hosted/forgot-password').send({ email: `admin@${A}.example` });
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(sent.map((e) => e.to)).toEqual([`admin@${A}.example`]);
    expect(sent[0].text).toContain('/reset-password?token=');
  });

  it('sets a new password once, signs out every other device and confirms the email', async () => {
    await agent.post('/api/hosted/forgot-password').send({ email: `admin@${A}.example` });
    const token = linkToken(sent[0]);
    // Too short: refused without using up the link
    expect((await agent.post('/api/hosted/reset-password').send({ token, password: 'short' })).body.code).toBe('short-password');
    const res = await agent.post('/api/hosted/reset-password').send({ token, password: 'brand-new-pass' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Admin A');
    // The token version went up: the old login is signed out, the new one works
    expect((await agent.get('/api/auth/me').set(auth(adminA.token))).status).toBe(401);
    expect((await agent.get('/api/auth/me').set(auth(res.body.token))).status).toBe(200);
    expect((await agent.post('/api/auth/login').send({ email: `admin@${A}.example`, password: 'brand-new-pass' })).status).toBe(200);
    expect((mainDb().prepare('SELECT emailConfirmedAt FROM accounts WHERE familyId = ?').get(A) as any).emailConfirmedAt).not.toBeNull();
    // Used twice
    expect((await agent.post('/api/hosted/reset-password').send({ token, password: 'another-pass' })).body.code).toBe('link-expired');
  });

  it('refuses a link after an hour, and an earlier link once a newer one is sent', async () => {
    await agent.post('/api/hosted/forgot-password').send({ email: `admin@${A}.example` });
    const first = linkToken(sent[0]);
    await agent.post('/api/hosted/forgot-password').send({ email: `admin@${A}.example` });
    const second = linkToken(sent[1]);
    expect((await agent.post('/api/hosted/reset-password').send({ token: first, password: 'brand-new-pass' })).status).toBe(400);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    expect((await agent.post('/api/hosted/reset-password').send({ token: second, password: 'brand-new-pass' })).status).toBe(400);
  });
});

describe('Hosted: changing the email', () => {
  it('moves the sign-in to the new address once its link is opened, and tells the old one', async () => {
    const wrong = await agent.post('/api/hosted/change-email').set(auth(adminA.token)).send({ email: 'new@example.com', password: 'nope' });
    expect(wrong.body.code).toBe('wrong-password');
    const taken = await agent.post('/api/hosted/change-email').set(auth(adminA.token)).send({ email: `admin@${B}.example`, password: 'admin123' });
    expect(taken.status).toBe(409);
    const res = await agent.post('/api/hosted/change-email').set(auth(adminA.token)).send({ email: 'New@Example.com', password: 'admin123' });
    expect(res.body).toEqual({ ok: true, email: 'new@example.com' });
    expect(lastTo(`admin@${A}.example`).text).toContain('new@example.com');
    // Nothing changes until the link is opened
    expect((await agent.post('/api/auth/login').send({ email: 'new@example.com', password: 'admin123' })).status).toBe(401);
    expect((await agent.post('/api/hosted/confirm-email').send({ token: linkToken(lastTo('new@example.com')) })).status).toBe(200);
    expect((await agent.post('/api/auth/login').send({ email: 'new@example.com', password: 'admin123' })).status).toBe(200);
    expect((await agent.post('/api/auth/login').send({ email: `admin@${A}.example`, password: 'admin123' })).status).toBe(401);
    expect((await agent.get('/api/hosted/account').set(auth(adminA.token))).body).toMatchObject({ email: 'new@example.com', emailConfirmed: true });
  });

  it('lets a second parent add an email; kids have none', async () => {
    const mom = await createUser(agent, adminA.token, { username: 'mom', displayName: 'Mom', password: 'pass1234', role: 'admin', familyId: A });
    expect((await agent.get('/api/hosted/account').set(auth(mom.token))).body.email).toBeNull();
    await agent.post('/api/hosted/change-email').set(auth(mom.token)).send({ email: 'mom@example.com', password: 'pass1234' });
    expect((await agent.post('/api/hosted/confirm-email').send({ token: linkToken(lastTo('mom@example.com')) })).status).toBe(200);
    expect((await agent.post('/api/auth/login').send({ email: 'mom@example.com', password: 'pass1234' })).body.user.displayName).toBe('Mom');
    const kid = await createUser(agent, adminA.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child', familyId: A });
    expect((await agent.post('/api/hosted/change-email').set(auth(kid.token)).send({ email: 'kid@example.com', password: 'pass123' })).status).toBe(403);
    // Removing a parent frees their email
    await agent.delete(`/api/users/${mom.user.id}`).set(auth(adminA.token));
    expect(mainDb().prepare("SELECT 1 FROM accounts WHERE email = 'mom@example.com'").get()).toBeUndefined();
  });

  it('keeps parents\' emails with them through an import', async () => {
    const backup = (await agent.get('/api/export').set(auth(adminA.token))).body;
    // The file lists the parent under another id
    backup.users = backup.users.map((u: any) => ({ ...u, id: u.id + 100 }));
    backup.completions = [];
    expect((await agent.post('/api/import').set(auth(adminA.token)).send(backup)).status).toBe(200);
    const login = await agent.post('/api/auth/login').send({ email: `admin@${A}.example`, password: 'admin123' });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(adminA.user.id + 100);
  });
});
