import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser, homeToday } from './setup';
import { dateStr, wall } from '../utils/clock';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { levelFor, longestWeekRun } from '../utils/badges';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const HOUR = 3600000;

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const twin = await createUser(agent, admin.token, { username: 'twin', displayName: 'Twin', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Pets', roomType: 'other' })).body.id as number;
  const mkTask = async (name: string, extra: object = {}) =>
    (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name, effort: 1, frequencyDays: 1, ...extra })).body.id as number;
  return { admin, kid, twin, room, mkTask };
}
const badgesOf = async (token: string) => (await agent.get('/api/achievements').set(auth(token))).body.me;
const coins = (id: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(id) as { coins: number }).coins;

describe('New built-in badges', () => {
  it('First Purchase, Team Player and Double Trouble', async () => {
    const { admin, kid, mkTask } = await family();
    const feed = await mkTask('Feed', { onDemand: true, customCoins: 50 });
    await agent.post('/api/boosts').set(auth(admin.token)).send({ title: 'Party', multiplier: 2, startAt: new Date(Date.now() - HOUR).toISOString(), endAt: new Date(Date.now() + HOUR).toISOString() });
    const done = (await agent.post(`/api/tasks/${feed}/complete`).set(auth(kid.token))).body;
    expect(done.newAchievements).toContain('double_trouble');
    expect(done.newAchievementInfo.find((b: any) => b.id === 'double_trouble')).toMatchObject({ titleKey: 'achievements.doubleTrouble' });

    const reward = (await agent.post('/api/rewards').set(auth(admin.token)).send({ title: 'Movie', costCoins: 20 })).body.id as number;
    const pot = (await agent.post('/api/rewards').set(auth(admin.token)).send({ title: 'Pool party', costCoins: 500 })).body.id as number;
    await agent.put(`/api/rewards/${pot}/rules`).set(auth(admin.token)).send({ isShared: true });
    await agent.post(`/api/rewards/${reward}/redeem`).set(auth(kid.token)).expect(200);
    await agent.post(`/api/rewards/${pot}/contribute`).set(auth(kid.token)).send({ amount: 10 }).expect(200);
    const mine = (await badgesOf(kid.token)).achievements as any[];
    expect(mine.filter((a) => ['first_reward', 'team_player'].includes(a.id)).map((a) => a.unlocked)).toEqual([true, true]);
  });

  it('Goal Getter for weekly goals reached 4 weeks in a row', async () => {
    const { kid } = await family();
    const monday = (weeksAgo: number) => homeToday(-((wall().weekday + 6) % 7) - 7 * weeksAgo, 12).toISOString();
    for (const w of [6, 4, 3, 2, 1]) {
      db.prepare("INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt, status) VALUES (?, 'Weekly Win', 10, ?, ?, 'completed')").run(kid.user.id, monday(w), monday(w - 1));
    }
    const goal = ((await badgesOf(kid.token)).achievements as any[]).find((a) => a.id === 'goal_streak_4');
    expect(goal).toMatchObject({ value: 4, unlocked: true });
    expect(longestWeekRun(['2026-10-05', '2026-09-28', '2026-10-12', '2026-09-14'])).toBe(3);
  });
});

describe('Secret badges', () => {
  it('stay hidden until earned: Clean Sweep and Birthday Helper', async () => {
    const { admin, kid, mkTask } = await family();
    const ids = [await mkTask('Feed dogs'), await mkTask('Feed cats'), await mkTask('Water bowls')];
    const before = ((await badgesOf(kid.token)).achievements as any[]).find((a) => a.id === 'clean_sweep');
    expect(before).toMatchObject({ secret: true, titleKey: null, descKey: null, icon: '❓', unlocked: false });

    const mmdd = dateStr().slice(5);
    expect((await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(admin.token)).send({ birthday: '13-40' })).status).toBe(400);
    await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(admin.token)).send({ birthday: mmdd }).expect(200);

    let last: any;
    for (const id of ids) last = (await agent.post(`/api/tasks/${id}/complete`).set(auth(kid.token))).body;
    const earned = ((await badgesOf(kid.token)).achievements as any[]).filter((a) => ['clean_sweep', 'birthday_helper'].includes(a.id));
    expect(earned.map((a) => [a.id, a.unlocked, a.titleKey])).toEqual([
      ['clean_sweep', true, 'achievements.cleanSweep'],
      ['birthday_helper', true, 'achievements.birthdayHelper'],
    ]);
    expect(last.newAchievementInfo.map((b: any) => b.id)).toContain('clean_sweep');
  });
});

describe('Parent-made badges', () => {
  it('counts a task for the people chosen, pays the bonus once and records it', async () => {
    const { admin, kid, twin, mkTask } = await family();
    const feed = await mkTask('Feed', { onDemand: true });
    const bad = await agent.post('/api/achievements/custom').set(auth(admin.token)).send({ title: 'Pet Hero', metric: 'task_count', threshold: 2 });
    expect(bad.body.error).toBe('tasks_required');
    expect((await agent.post('/api/achievements/custom').set(auth(kid.token)).send({ title: 'x', metric: 'completions', threshold: 1 })).status).toBe(403);
    const badge = (await agent.post('/api/achievements/custom').set(auth(admin.token))
      .send({ title: 'Pet Hero', icon: '🐶', metric: 'task_count', taskIds: [feed], threshold: 2, bonusCoins: 10, userIds: [kid.user.id] })).body;
    expect(badge).toMatchObject({ title: 'Pet Hero', icon: '🐶', taskIds: [feed], userIds: [kid.user.id], bonusCoins: 10 });

    await agent.post(`/api/tasks/${feed}/complete`).set(auth(kid.token)).expect(200);
    const startCoins = coins(kid.user.id);
    const second = (await agent.post(`/api/tasks/${feed}/complete`).set(auth(kid.token))).body;
    expect(second.newAchievementInfo).toContainEqual({ id: `custom_${badge.id}`, titleKey: null, title: 'Pet Hero', icon: '🐶' });
    expect(coins(kid.user.id) - startCoins).toBe(second.coinsEarned + 10);
    expect(db.prepare('SELECT amount, reason FROM coin_adjustments WHERE userId = ?').all(kid.user.id)).toEqual([{ amount: 10, reason: '🏅 Badge bonus: Pet Hero' }]);
    await agent.post(`/api/tasks/${feed}/complete`).set(auth(kid.token)).expect(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM coin_adjustments WHERE userId = ?').get(kid.user.id)).toEqual({ n: 1 });

    // Not for the twin
    expect(((await badgesOf(twin.token)).achievements as any[]).some((a) => a.id === `custom_${badge.id}`)).toBe(false);
    const list = (await agent.get('/api/achievements/custom').set(auth(admin.token))).body;
    expect(list.badges[0].earnedBy).toBe(1);

    await agent.delete(`/api/achievements/custom/${badge.id}`).set(auth(admin.token)).expect(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM user_achievement_notifications WHERE achievementId = ?').get(`custom_${badge.id}`)).toEqual({ n: 0 });
  });

  it('counts weeks in a row for a task, and pays a bonus for built-in badges when set', async () => {
    const { admin, kid, mkTask } = await family();
    const homework = await mkTask('All homework turned in', { onDemand: true });
    const badge = (await agent.post('/api/achievements/custom').set(auth(admin.token))
      .send({ title: 'Homework Hero', metric: 'task_weeks', taskIds: [homework], threshold: 3 })).body;
    for (const weeksAgo of [1, 2, 3]) {
      db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 1, 'approved')")
        .run(homework, kid.user.id, new Date(Date.now() - weeksAgo * 7 * 86400000).toISOString());
    }
    const hw = ((await badgesOf(kid.token)).achievements as any[]).find((a) => a.id === `custom_${badge.id}`);
    expect(hw).toMatchObject({ value: 3, unlocked: true, custom: true, title: 'Homework Hero' });

    await agent.put('/api/achievements/config').set(auth(admin.token)).send({ builtinBonusCoins: 5 }).expect(200);
    const before = coins(kid.user.id);
    const done = (await agent.post(`/api/tasks/${homework}/complete`).set(auth(kid.token))).body;
    const builtinsEarned = (done.newAchievements as string[]).filter((id) => !id.startsWith('custom_')).length;
    expect(builtinsEarned).toBeGreaterThan(0);
    expect(coins(kid.user.id) - before).toBe(done.coinsEarned + 5 * builtinsEarned);
  });
});

describe('Levels and Next up', () => {
  it('levels from coins earned over all time', () => {
    expect([0, 49, 50, 149, 150, 2250].map((c) => levelFor(c).level)).toEqual([1, 1, 2, 2, 3, 10]);
    expect(levelFor(100)).toMatchObject({ level: 2, titleKey: 'levels.l2', levelStartsAt: 50, nextLevelAt: 150, progress: 50 });
    expect(levelFor(99999).titleKey).toBe('levels.l10');
  });

  it("puts the viewer's level and closest badge on Home", async () => {
    const { kid, mkTask } = await family();
    const t = await mkTask('Feed', { onDemand: true, customCoins: 60 });
    await agent.post(`/api/tasks/${t}/complete`).set(auth(kid.token)).expect(200);
    const dash = (await agent.get('/api/dashboard').set(auth(kid.token))).body;
    expect(dash.myLevel).toMatchObject({ level: 2, coinsEarned: 60 });
    expect(dash.nextBadge).toMatchObject({ unlocked: false, secret: false });
    expect(dash.nextBadge.progress).toBeGreaterThan(0);
  });
});
