import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { boardRanges, buildBoard } from '../utils/board';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
// Wednesday Oct 14 2026, noon local: this week started Mon Oct 12, last week Mon Oct 5
const NOW = new Date(2026, 9, 14, 12);
const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).toISOString();

async function family() {
  const admin = await createAdmin(agent);
  db.prepare('UPDATE users SET isParticipant = 0 WHERE id = ?').run(admin.user.id); // parents who don't do chores aren't on the board
  const cecil = await createUser(agent, admin.token, { username: 'cecil', displayName: 'Cecil', password: 'pass123', role: 'child' });
  const cylis = await createUser(agent, admin.token, { username: 'cylis', displayName: 'Cylis', password: 'pass123', role: 'child' });
  const mkRoom = async (name: string) => (await agent.post('/api/rooms').set(auth(admin.token)).send({ name, roomType: 'other' })).body.id as number;
  const kitchen = await mkRoom('Kitchen');
  const pets = await mkRoom('Pets');
  const yard = await mkRoom('Yard');
  const mkTask = async (room: number, name: string, onDemand = false) =>
    (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name, effort: 1, frequencyDays: 1, onDemand })).body.id as number;
  const tasks = { dishes: await mkTask(kitchen, 'Dishes'), feed: await mkTask(pets, 'Feed'), rake: await mkTask(yard, 'Rake'), bounty: await mkTask(kitchen, 'Bounty', true) };
  const done = (userId: number, taskId: number, when: string, coins: number) =>
    db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, ?, 'approved')").run(taskId, userId, when, coins);
  return { admin, cecil: cecil.user.id, cylis: cylis.user.id, kitchen, pets, tasks, done, adminToken: admin.token, kidToken: cecil.token };
}

describe('Board periods', () => {
  it('compares this week so far with last week up to the same moment', () => {
    const r = boardRanges('week', NOW);
    expect([r.current.start, r.compare.start, r.compare.end, r.previous.end].map((d) => d.toISOString()))
      .toEqual([at(12, 0), at(5, 0), at(7), at(12, 0)]);
    expect(boardRanges('lastWeek', NOW).current).toEqual({ start: new Date(at(5, 0)), end: new Date(at(12, 0)) });
  });
});

describe('Board ranking', () => {
  it('ranks by coins, by own weekly goal, or by improvement, with only people who take part', async () => {
    const f = await family();
    f.done(f.cecil, f.tasks.dishes, at(13), 60);
    f.done(f.cylis, f.tasks.feed, at(13), 40);
    f.done(f.cylis, f.tasks.feed, at(6), 5);   // last week, before the same moment
    f.done(f.cecil, f.tasks.dishes, at(6), 50);
    const week = { start: at(12, 0), end: at(18, 23) };
    db.prepare('INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt) VALUES (?, ?, ?, ?, ?)').run(f.cecil, 'Weekly Win', 120, week.start, week.end);
    db.prepare('INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt) VALUES (?, ?, ?, ?, ?)').run(f.cylis, 'Weekly Win', 50, week.start, week.end);

    const coins = buildBoard('week', 'coins', NOW);
    expect(coins.people.map((p) => [p.displayName, p.points, p.rank])).toEqual([['Cecil', 60, 1], ['Cylis', 40, 2]]);
    const goal = buildBoard('week', 'goal', NOW);
    expect(goal.people.map((p) => [p.displayName, p.goalPct, p.rank])).toEqual([['Cylis', 80, 1], ['Cecil', 50, 2]]);
    const improved = buildBoard('week', 'improved', NOW);
    expect(improved.people.map((p) => [p.displayName, p.improvement])).toEqual([['Cylis', 35], ['Cecil', 10]]);
    // Last week Cecil won, so Cylis moved up one in goal mode and Cecil down one
    expect(goal.people.map((p) => p.movement)).toEqual([1, -1]);
  });

  it('shows last week as its own period', async () => {
    const f = await family();
    f.done(f.cylis, f.tasks.feed, at(9), 30);
    f.done(f.cecil, f.tasks.feed, at(13), 99);
    expect(buildBoard('lastWeek', 'coins', NOW).people.map((p) => [p.displayName, p.points])).toEqual([['Cylis', 30], ['Cecil', 0]]);
  });
});

describe('Awards and trophies', () => {
  it('gives Early Bird, Bounty Hunter, All-Rounder and room champions, shared on a tie', async () => {
    const f = await family();
    f.done(f.cecil, f.tasks.dishes, at(13, 7), 5);
    f.done(f.cecil, f.tasks.feed, at(14, 6), 5);
    f.done(f.cecil, f.tasks.rake, at(14, 9), 5);
    f.done(f.cylis, f.tasks.bounty, at(13, 10), 5);
    f.done(f.cylis, f.tasks.bounty, at(13, 11), 5);
    f.done(f.cylis, f.tasks.feed, at(13, 15), 5);
    f.done(f.cylis, f.tasks.feed, at(14, 10), 5);
    const awards = buildBoard('week', 'coins', NOW).awards;
    expect(awards.find((a) => a.key === 'earlyBird')).toMatchObject({ userIds: [f.cecil], value: 2 });
    expect(awards.find((a) => a.key === 'bountyHunter')).toMatchObject({ userIds: [f.cylis], value: 2 });
    expect(awards.find((a) => a.key === 'allRounder')).toMatchObject({ userIds: [f.cecil], value: 3 });
    expect(awards.filter((a) => a.key === 'room').map((a) => [a.roomName, a.userIds])).toEqual([['Kitchen', [f.cylis]], ['Pets', [f.cylis]]]);
    // A room that belongs to someone has no champion
    db.prepare('UPDATE rooms SET assignedUserId = ? WHERE id = ?').run(f.cylis, f.pets);
    expect(buildBoard('week', 'coins', NOW).awards.filter((a) => a.key === 'room').map((a) => a.roomName)).toEqual(['Kitchen']);
  });

  it('keeps past weekly winners and counts wins', async () => {
    const f = await family();
    f.done(f.cecil, f.tasks.dishes, at(6), 30);
    f.done(f.cylis, f.tasks.dishes, at(7), 20);
    f.done(f.cylis, f.tasks.dishes, new Date(2026, 8, 29, 12).toISOString(), 25);
    f.done(f.cecil, f.tasks.dishes, at(13), 500); // this week doesn't count yet
    const shelf = buildBoard('week', 'coins', NOW).trophies;
    expect(shelf.weeks).toEqual([
      { weekStart: '2026-10-05', userIds: [f.cecil], coins: 30 },
      { weekStart: '2026-09-28', userIds: [f.cylis], coins: 25 },
    ]);
    expect(shelf.wins).toEqual({ [f.cecil]: 1, [f.cylis]: 1 });
  });
});

describe('Family team goal', () => {
  it('lets a parent set a weekly target and prize that everyone works toward', async () => {
    const f = await family();
    expect((await agent.put('/api/leaderboard/family-goal').set(auth(f.kidToken)).send({ target: 10 })).status).toBe(403);
    await agent.put('/api/leaderboard/family-goal').set(auth(f.adminToken)).send({ target: 100, prize: 'Pizza night 🍕' }).expect(200);
    f.done(f.cecil, f.tasks.dishes, new Date().toISOString(), 30);
    f.done(f.cylis, f.tasks.feed, new Date().toISOString(), 25);
    const board = (await agent.get('/api/leaderboard/board?period=week').set(auth(f.kidToken))).body;
    expect(board.familyGoal).toEqual({ target: 100, prize: 'Pizza night 🍕', total: 55, reached: false });
    await agent.put('/api/leaderboard/family-goal').set(auth(f.adminToken)).send({ target: 0 }).expect(200);
    expect((await agent.get('/api/leaderboard/board').set(auth(f.kidToken))).body.familyGoal).toBeNull();
  });
});
