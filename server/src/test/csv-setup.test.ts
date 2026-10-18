import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { parseCsv, toCsv } from '../utils/csv';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'cecil', displayName: 'Cecil', password: 'pass123', role: 'child' });
  const twin = await createUser(agent, admin.token, { username: 'cylis', displayName: 'Cylis', password: 'pass123', role: 'child' });
  const mkRoom = async (name: string, body: object = {}) => (await agent.post('/api/rooms').set(auth(admin.token)).send({ name, roomType: 'other', ...body })).body.id as number;
  const mkTask = async (roomId: number, body: object) => (await agent.post(`/api/rooms/${roomId}/tasks`).set(auth(admin.token)).send({ effort: 1, frequencyDays: 7, ...body })).body.id as number;
  return { admin, kid, twin, mkRoom, mkTask };
}

describe('CSV reader/writer', () => {
  it('round-trips commas, quotes, line breaks and emoji', () => {
    const rows = [['Kitchen', 'Wipe, then dry', 'Say "please"\nthen go'], ['Yard', '🌿 Weeds', '']];
    const parsed = parseCsv(toCsv(['room', 'task', 'notes'], rows));
    expect(parsed.map((r) => r.cells)).toEqual([['room', 'task', 'notes'], ...rows]);
    expect(parsed[2].line).toBe(4); // the quoted line break moves the next record down
  });
});

describe('Tasks CSV', () => {
  it('exports every task, previews an import without changing anything, then applies it', async () => {
    const { admin, kid, twin, mkRoom, mkTask } = await family();
    const kitchen = await mkRoom('Kitchen');
    const dishes = await mkTask(kitchen, { name: 'Dishes', notes: 'Hot water, please', customCoins: 5, assignedUserIds: [kid.user.id] });
    await mkTask(kitchen, { name: 'Sweep' });

    const exported = await agent.get('/api/csv/tasks').set(auth(admin.token)).expect(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    const lines = parseCsv(exported.text).map((r) => r.cells);
    expect(lines[0]).toEqual(['room', 'task', 'notes', 'every_days', 'effort', 'coins', 'on_demand', 'show_on_home', 'early', 'assignees', 'icon', 'timer_minutes', 'steps']);
    expect(lines[1].slice(0, 6)).toEqual(['Kitchen', 'Dishes', 'Hot water, please', '7', '1', '5']);
    expect(lines[1][9]).toBe('cecil');

    const csv = [
      'Room,Task,Every days,Coins,Assignees,Colour',
      'kitchen,DISHES,7,8,Cecil+Cylis,blue', // update: coins and people (names match without case)
      'Kitchen,Sweep,7,,,',                  // unchanged
      'Garage,Bins to the curb,3.5,,cylis,', // add, with a new room
      'Garage,Oil the hinges,soon,,,',       // error
      'Nowhere,Ghost,7,,Bob,',               // error: unknown person
    ].join('\n');
    const preview = (await agent.post('/api/csv/tasks/import').set(auth(admin.token)).send({ csv }).expect(200)).body;
    expect(preview).toMatchObject({ dryRun: true, applied: false, summary: { add: 1, update: 1, unchanged: 1, error: 2 }, roomsToCreate: ['Garage'], unknownColumns: ['Colour'] });
    expect(preview.rows[0].changes).toEqual([{ field: 'coins', from: '5', to: '8' }, { field: 'assignees', from: 'cecil', to: 'cecil+cylis' }]);
    expect(preview.rows[3].error).toMatchObject({ code: 'bad_number', field: 'every_days' });
    expect(preview.rows[4].error).toMatchObject({ code: 'unknown_person', value: 'Bob' });
    expect(db.prepare('SELECT customCoins FROM tasks WHERE id = ?').get(dishes)).toEqual({ customCoins: 5 });
    expect(db.prepare("SELECT 1 FROM rooms WHERE name = 'Garage'").get()).toBeUndefined();

    const applied = (await agent.post('/api/csv/tasks/import').set(auth(admin.token)).send({ csv, dryRun: false }).expect(200)).body;
    expect(applied.applied).toBe(true);
    expect(db.prepare('SELECT customCoins FROM tasks WHERE id = ?').get(dishes)).toEqual({ customCoins: 8 });
    expect(db.prepare('SELECT userId FROM task_assignees WHERE taskId = ? ORDER BY userId').all(dishes)).toEqual([{ userId: kid.user.id }, { userId: twin.user.id }]);
    const bins = db.prepare("SELECT t.id, t.frequencyDays FROM tasks t JOIN rooms r ON r.id = t.roomId WHERE r.name = 'Garage' AND t.name = 'Bins to the curb'").get() as any;
    expect(bins.frequencyDays).toBe(3.5);
    expect(db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?').all(bins.id)).toEqual([{ userId: twin.user.id }]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE name IN ('Oil the hinges', 'Ghost')").get()).toEqual({ n: 0 });
  });

  it('rejects files without the needed columns, and kids', async () => {
    const { admin, kid } = await family();
    const res = await agent.post('/api/csv/tasks/import').set(auth(admin.token)).send({ csv: 'task,notes\nDishes,x' });
    expect([res.status, res.body.error, res.body.columns]).toEqual([400, 'missing_columns', ['room']]);
    expect((await agent.post('/api/csv/tasks/import').set(auth(admin.token)).send({ csv: '' })).body.error).toBe('empty_file');
    expect((await agent.get('/api/csv/tasks').set(auth(kid.token))).status).toBe(403);
  });
});

describe('Rewards CSV, categories and order', () => {
  it('imports rewards with categories, and keeps the parents\' order', async () => {
    const { admin, kid } = await family();
    const ds = (await agent.post('/api/rewards').set(auth(admin.token)).send({ title: 'Nintendo DS Lite', costCoins: 1250 })).body.id as number;
    const csv = 'title,cost,category,active\nNintendo DS Lite,1300,Big goals,yes\nIce cream trip,40,Treats,\nZebra,,Dream big,1';
    const preview = (await agent.post('/api/csv/rewards/import').set(auth(admin.token)).send({ csv })).body;
    expect(preview.summary).toEqual({ add: 1, update: 1, unchanged: 0, error: 1 });
    expect(preview.rows[2].error.code).toBe('bad_cost');
    await agent.post('/api/csv/rewards/import').set(auth(admin.token)).send({ csv, dryRun: false }).expect(200);
    const ice = (db.prepare("SELECT id FROM rewards WHERE title = 'Ice cream trip'").get() as { id: number }).id;

    await agent.put(`/api/rewards/${ice}/category`).set(auth(admin.token)).send({ category: '  Treats & outings ' }).expect(200);
    await agent.post('/api/rewards/order').set(auth(admin.token)).send({ ids: [ice, ds] }).expect(200);
    expect((await agent.post('/api/rewards/order').set(auth(admin.token)).send({ ids: [] })).status).toBe(400);
    expect((await agent.put(`/api/rewards/${ice}/category`).set(auth(kid.token)).send({ category: 'x' })).status).toBe(403);

    const catalog = (await agent.get('/api/rewards').set(auth(kid.token))).body.rewards;
    expect(catalog.map((r: any) => [r.title, r.costCoins, r.category, r.sortOrder])).toEqual([
      ['Ice cream trip', 40, 'Treats & outings', 1],
      ['Nintendo DS Lite', 1300, 'Big goals', 2],
    ]);
    const exported = parseCsv((await agent.get('/api/csv/rewards').set(auth(admin.token))).text).map((r) => r.cells);
    expect(exported).toContainEqual(['Nintendo DS Lite', '', '1300', '1', 'Big goals']);
  });
});

describe('Duplicate a room', () => {
  it("copies the tasks and their settings for another kid, without history", async () => {
    const { admin, kid, twin, mkRoom, mkTask } = await family();
    const quests = await mkRoom("Cecil's Quests", { assignedUserId: kid.user.id });
    await mkTask(quests, { name: 'Homework all turned in', onDemand: true, repeatLimit: 1, repeatPeriod: 'week', customCoins: 30, assignedUserIds: [kid.user.id] });
    const bins = await mkTask(quests, { name: 'Bins', scheduleWeekdays: [3], seasonStartMonth: 3, seasonEndMonth: 11 });
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date().toISOString(), bins);

    const res = await agent.post(`/api/rooms/${quests}/duplicate`).set(auth(admin.token)).send({ name: "Cylis's Quests", ownerUserId: twin.user.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Cylis's Quests", assignedUserId: twin.user.id });
    const copies = res.body.tasks as any[];
    expect(copies.map((t) => t.name).sort()).toEqual(['Bins', 'Homework all turned in']);
    const hw = copies.find((t) => t.name === 'Homework all turned in');
    expect([hw.repeatLimit, hw.repeatPeriod, hw.customCoins, hw.onDemand]).toEqual([1, 'week', 30, 1]);
    const binsCopy = copies.find((t) => t.name === 'Bins');
    expect([binsCopy.scheduleWeekdays, binsCopy.seasonStartMonth, binsCopy.seasonEndMonth, binsCopy.lastCompletedAt]).toEqual([8, 3, 11, null]);
    // Cecil's assignments go to Cylis
    expect(db.prepare('SELECT DISTINCT userId FROM task_assignees WHERE taskId IN (?, ?)').all(hw.id, binsCopy.id)).toEqual([{ userId: twin.user.id }]);
    expect((await agent.post(`/api/rooms/${quests}/duplicate`).set(auth(admin.token)).send({ name: ' ' })).status).toBe(400);
  });
});
