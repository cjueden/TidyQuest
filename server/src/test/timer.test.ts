import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { parseCsv } from '../utils/csv';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setup() {
  const admin = await createAdmin(agent);
  const roomId = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Bedroom', roomType: 'other' })).body.id as number;
  const mkTask = (body: object) => agent.post(`/api/rooms/${roomId}/tasks`).set(auth(admin.token)).send({ effort: 1, frequencyDays: 7, ...body });
  const timerOf = (id: number) => (db.prepare('SELECT timerMinutes FROM tasks WHERE id = ?').get(id) as { timerMinutes: number | null }).timerMinutes;
  return { admin, roomId, mkTask, timerOf };
}

describe('Chore timer setting (NEW-1)', () => {
  it('is off by default, set and cleared in the editor, and checked', async () => {
    const { admin, mkTask, timerOf } = await setup();
    const plain = (await mkTask({ name: 'Make the bed' })).body.id;
    expect(timerOf(plain)).toBeNull();

    // The name doesn't matter: a "10-Minute" chore has no timer unless it's set
    const rescue = (await mkTask({ name: '10-Minute Room Rescue' })).body.id;
    expect(timerOf(rescue)).toBeNull();
    await agent.put(`/api/tasks/${rescue}`).set(auth(admin.token)).send({ timerMinutes: 10 }).expect(200);
    expect(timerOf(rescue)).toBe(10);

    // Other edits leave it alone (the plan's sync never sends it)
    await agent.put(`/api/tasks/${rescue}`).set(auth(admin.token)).send({ effort: 2 }).expect(200);
    expect(timerOf(rescue)).toBe(10);

    const bad = await agent.put(`/api/tasks/${rescue}`).set(auth(admin.token)).send({ timerMinutes: 500 });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid_timer');
    expect((await agent.put(`/api/tasks/${rescue}`).set(auth(admin.token)).send({ timerMinutes: 2.5 })).status).toBe(400);

    await agent.put(`/api/tasks/${rescue}`).set(auth(admin.token)).send({ timerMinutes: 0 }).expect(200);
    expect(timerOf(rescue)).toBeNull();

    const timed = (await mkTask({ name: 'Read', timerMinutes: 20 })).body.id;
    expect(timerOf(timed)).toBe(20);
  });

  it("is sent with its room's chores and kept by duplicate", async () => {
    const { admin, roomId, mkTask } = await setup();
    const id = (await mkTask({ name: 'Practice piano', timerMinutes: 15 })).body.id;
    const rooms = (await agent.get('/api/rooms').set(auth(admin.token)).expect(200)).body;
    expect(rooms.find((r: any) => r.id === roomId).tasks.find((t: any) => t.id === id).timerMinutes).toBe(15);
    const copy = (await agent.post(`/api/tasks/${id}/duplicate`).set(auth(admin.token)).expect(201)).body;
    expect(copy.timerMinutes).toBe(15);
  });

  it('goes through CSV export and import', async () => {
    const { admin, mkTask, timerOf } = await setup();
    const id = (await mkTask({ name: 'Practice piano', timerMinutes: 15 })).body.id;
    const lines = parseCsv((await agent.get('/api/csv/tasks').set(auth(admin.token)).expect(200)).text).map((r) => r.cells);
    const col = lines[0].indexOf('timer_minutes');
    expect(lines[1][col]).toBe('15');

    const csv = 'Room,Task,Timer\nBedroom,Practice piano,25\nBedroom,Stretch,5\nBedroom,Nap,lots\n';
    const preview = (await agent.post('/api/csv/tasks/import').set(auth(admin.token)).send({ csv, dryRun: true }).expect(200)).body;
    expect(preview.rows.map((r: any) => r.action)).toEqual(['update', 'add', 'error']);
    expect(preview.rows[2].error.code).toBe('bad_timer');
    await agent.post('/api/csv/tasks/import').set(auth(admin.token)).send({ csv: csv.split('\n').slice(0, 3).join('\n'), dryRun: false }).expect(200);
    expect(timerOf(id)).toBe(25);
    const stretch = db.prepare("SELECT timerMinutes FROM tasks WHERE name = 'Stretch'").get() as { timerMinutes: number };
    expect(stretch.timerMinutes).toBe(5);
  });
});
