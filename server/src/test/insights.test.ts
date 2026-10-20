import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { startOfLocalWeek } from '../utils/periods';
import { heatSlot, periodWindow, snapshotOverdueChores } from '../utils/insights';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Kitchen', roomType: 'kitchen' })).body.id as number;
  const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Dishes', effort: 3, frequencyDays: 1 })).body.id as number;
  return { admin, kid, room, task };
}

const done = (taskId: number, userId: number, at: Date, coins: number, status = 'approved') =>
  db.prepare('INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, ?, ?)')
    .run(taskId, userId, at.toISOString(), coins, status);

/** Local time `days` after this week's Monday at `hour`:`minute`. */
const thisWeek = (days: number, hour: number, minute = 0) => {
  const d = startOfLocalWeek();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
};

describe('insights', () => {
  it('is for parents only', async () => {
    const { kid } = await family();
    await agent.get('/api/insights/bars').set(auth(kid.token)).expect(403);
    await agent.get('/api/insights/heatmap').set(auth(kid.token)).expect(403);
  });

  it('groups a week by local day; pending counts as done but pays no coins yet; rejected is left out', async () => {
    const { admin, kid, task } = await family();
    const kidId = kid.user.id as number;
    done(task, kidId, thisWeek(0, 10), 5);
    done(task, kidId, thisWeek(0, 10, 30), 3, 'pending');
    done(task, kidId, thisWeek(1, 9), 5, 'rejected');
    done(task, kidId, thisWeek(-7, 0, 1), 4); // last week's Monday, just after midnight
    done(task, kidId, new Date(Date.now() - 7 * 86400000 + 60000), 2); // a week ago, a minute later than now: not yet

    const res = await agent.get('/api/insights/bars?period=week').set(auth(admin.token)).expect(200);
    expect(res.body.buckets).toHaveLength(7);
    expect(res.body.rows).toEqual([[0, kidId, task, 2, 5, 6]]);
    // This week so far vs last week up to the same moment
    expect(res.body.previousSoFar).toBe(true);
    expect(res.body.previous).toEqual([[kidId, 1, 4, 3]]);
    expect(res.body.tasks).toEqual([expect.objectContaining({ id: task, name: 'Dishes' })]);

    const last = await agent.get('/api/insights/bars?period=week&offset=-1').set(auth(admin.token)).expect(200);
    expect(last.body.previousSoFar).toBe(false);
    // Viewing last week itself counts all of it
    expect(last.body.rows.reduce((n: number, r: number[]) => n + r[3], 0)).toBe(2);
    // Future periods are clamped to the current one
    const future = await agent.get('/api/insights/bars?period=week&offset=3').set(auth(admin.token)).expect(200);
    expect(future.body.offset).toBe(0);
  });

  it('builds day, month and year windows', () => {
    const now = new Date(2026, 2, 15, 12); // 15 March 2026
    expect(periodWindow('day', 0, now).buckets).toHaveLength(24);
    const feb = periodWindow('month', -1, now);
    expect(feb.buckets).toHaveLength(28);
    expect(feb.start.getMonth()).toBe(1);
    const dec = periodWindow('month', -3, now);
    expect([dec.start.getFullYear(), dec.start.getMonth()]).toEqual([2025, 11]);
    expect(periodWindow('year', 0, now).buckets).toHaveLength(12);
  });

  it('puts the heatmap into weekday × time-of-day slots over 4 or 12 weeks', async () => {
    const { admin, kid, task } = await family();
    const kidId = kid.user.id as number;
    const at = (daysAgo: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 30, 0, 0); return d; };
    const afternoon = at(3, 16);
    done(task, kidId, afternoon, 5);
    done(task, kidId, at(3, 2), 5); // 2:30 am lands in the night slot
    done(task, kidId, at(40, 8), 5); // only in the 12-week window

    expect(heatSlot(new Date(2026, 0, 1, 23))).toBe(5);
    expect(heatSlot(new Date(2026, 0, 1, 6))).toBe(0);
    const weekday = (afternoon.getDay() + 6) % 7;
    const four = await agent.get('/api/insights/heatmap').set(auth(admin.token)).expect(200);
    expect(four.body.weeks).toBe(4);
    expect(four.body.rows).toEqual(expect.arrayContaining([[weekday, 3, kidId, 1, 5, 3], [weekday, 5, kidId, 1, 5, 3]]));
    expect(four.body.rows).toHaveLength(2);
    const twelve = await agent.get('/api/insights/heatmap?weeks=12').set(auth(admin.token)).expect(200);
    expect(twelve.body.rows).toHaveLength(3);
  });

  it('records chores left overdue once a day', async () => {
    const { admin, task, room } = await family();
    const fresh = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Wipe table', effort: 1, frequencyDays: 7 })).body.id as number;
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date(Date.now() - 4 * 86400000).toISOString(), task);
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date().toISOString(), fresh);

    expect(snapshotOverdueChores()).toBe(1);
    const rows = db.prepare('SELECT taskId, roomId, daysOverdue FROM chore_overdue_days').all() as Array<{ taskId: number; roomId: number; daysOverdue: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ taskId: task, roomId: room });
    expect(rows[0].daysOverdue).toBeGreaterThanOrEqual(2);
    expect(snapshotOverdueChores()).toBe(0); // already taken today
  });
});
