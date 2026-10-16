import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { tr } from '../utils/i18n';
import { localDateStr } from '../utils/dateHelpers';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Quests', roomType: 'other' })).body.id as number;
  const quest = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Big job', effort: 1, onDemand: true, customCoins: 60 })).body.id as number;
  return { admin, kid, quest };
}
const badge = async (token: string, id: string) =>
  ((await agent.get('/api/achievements').set(auth(token))).body.me.achievements as any[]).find((a) => a.id === id);

describe('Earned badges stay earned', () => {
  it('keeps Piggy Bank after the coins are spent, with the date it was earned', async () => {
    const { admin, kid, quest } = await family();
    const done = await agent.post(`/api/tasks/${quest}/complete`).set(auth(kid.token)).expect(200);
    expect(done.body.newAchievements).toEqual(expect.arrayContaining(['first_task', 'coins_50']));

    const reward = (await agent.post('/api/rewards').set(auth(admin.token)).send({ title: 'Movie', costCoins: 55 })).body.id as number;
    await agent.post(`/api/rewards/${reward}/redeem`).set(auth(kid.token)).expect(200);
    expect((db.prepare('SELECT coins FROM users WHERE id = ?').get(kid.user.id) as { coins: number }).coins).toBe(5);

    const piggy = await badge(kid.token, 'coins_50');
    expect(piggy).toMatchObject({ unlocked: true, progress: 100 });
    expect(new Date(piggy.unlockedAt).getTime()).toBeGreaterThan(Date.now() - 60000);
  });

  it('counts coins earned (chores and bonuses), not the balance', async () => {
    const { admin, kid } = await family();
    await agent.post(`/api/users/${kid.user.id}/adjust-coins`).set(auth(admin.token)).send({ amount: 80, reason: 'Birthday' });
    await agent.post(`/api/users/${kid.user.id}/adjust-coins`).set(auth(admin.token)).send({ amount: -70, reason: 'Oops' });
    const saver = await badge(kid.token, 'coins_100');
    expect(saver).toMatchObject({ value: 80, unlocked: false, unlockedAt: null });
    expect(await badge(kid.token, 'coins_50')).toMatchObject({ value: 80, unlocked: true });
  });

  it('keeps a streak badge after the streak breaks', async () => {
    const { kid, quest } = await family();
    db.prepare('UPDATE users SET currentStreak = 2, lastActiveDate = ? WHERE id = ?').run(localDateStr(new Date(Date.now() - 86400000)), kid.user.id);
    await agent.post(`/api/tasks/${quest}/complete`).set(auth(kid.token)).expect(200);
    expect(db.prepare('SELECT currentStreak FROM users WHERE id = ?').get(kid.user.id)).toEqual({ currentStreak: 3 });
    db.prepare('UPDATE users SET currentStreak = 0 WHERE id = ?').run(kid.user.id);
    expect(await badge(kid.token, 'streak_3')).toMatchObject({ value: 0, unlocked: true });
  });

  it("doesn't record anything just by viewing the page", async () => {
    const { admin, kid } = await family();
    await agent.post(`/api/users/${kid.user.id}/adjust-coins`).set(auth(admin.token)).send({ amount: 60 });
    expect((await badge(kid.token, 'coins_50')).unlocked).toBe(true); // reached, shown
    expect(db.prepare('SELECT COUNT(*) AS n FROM user_achievement_notifications WHERE userId = ?').get(kid.user.id)).toEqual({ n: 0 });
  });
});

describe('Server translations', () => {
  it("reads the app's language files, with English and key fallbacks", () => {
    expect(tr('en', 'achievements.firstStep')).toBe('First Step');
    expect(tr('fr', 'achievements.firstStep')).not.toBe('First Step');
    expect(tr('xx', 'achievements.firstStep')).toBe('First Step');
    expect(tr('en', 'nope.missing')).toBe('nope.missing');
    expect(tr('en', 'trash.deleted', { name: 'Dishes' })).toBe('Deleted “Dishes”');
  });
});

describe('Theme per person', () => {
  it('saves a theme on the person (it follows them to any device), and rejects unknown ones', async () => {
    const { admin, kid } = await family();
    await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(kid.token)).send({ theme: 'grape' }).expect(200);
    expect((await agent.get('/api/auth/me').set(auth(kid.token))).body.theme).toBe('grape');
    expect((await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(kid.token)).send({ theme: 'neon' })).body.error).toBe('invalid_theme');
    await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(admin.token)).send({ theme: 'ocean' }).expect(200);
    expect(((await agent.get('/api/users').set(auth(admin.token))).body as any[]).find((u) => u.id === kid.user.id).theme).toBe('ocean');
  });
});

describe('Version', () => {
  it('says which version and build is running, without logging in', async () => {
    const res = (await agent.get('/api/version').expect(200)).body;
    expect(res.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(res).toHaveProperty('build');
  });
});
