import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { parseCsv } from '../utils/csv';

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
  const roomId = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'House', roomType: 'other' })).body.id as number;
  // health 0 = overdue (due now); 100 = just done
  const mkTask = async (name: string, body: object = {}) => (await agent.post(`/api/rooms/${roomId}/tasks`).set(auth(admin.token))
    .send({ name, effort: 1, frequencyDays: 7, health: 0, ...body }).expect(201)).body.id as number;
  const focus = async (token: string) => (await agent.get('/api/dashboard').set(auth(token)).expect(200)).body.focus;
  return { admin, kid, twin, roomId, mkTask, focus };
}

describe('Chore steps (NEW-2)', () => {
  it('are set in the editor as a list or one per line, and checked', async () => {
    const { admin, mkTask } = await family();
    const stepsOf = (id: number) => (db.prepare('SELECT steps FROM tasks WHERE id = ?').get(id) as { steps: string | null }).steps;
    const id = await mkTask('Make the bed', { steps: ['Pillow up', ' Sheet flat ', ''] });
    expect(JSON.parse(stepsOf(id)!)).toEqual(['Pillow up', 'Sheet flat']);
    await agent.put(`/api/tasks/${id}`).set(auth(admin.token)).send({ steps: 'One\nTwo\n\nThree' }).expect(200);
    expect(JSON.parse(stepsOf(id)!)).toEqual(['One', 'Two', 'Three']);
    await agent.put(`/api/tasks/${id}`).set(auth(admin.token)).send({ effort: 2 }).expect(200);
    expect(JSON.parse(stepsOf(id)!)).toEqual(['One', 'Two', 'Three']);
    const tooMany = await agent.put(`/api/tasks/${id}`).set(auth(admin.token)).send({ steps: Array.from({ length: 13 }, (_, i) => `Step ${i}`) });
    expect(tooMany.body.error).toBe('invalid_steps');
    expect((await agent.put(`/api/tasks/${id}`).set(auth(admin.token)).send({ steps: ['x'.repeat(121)] })).status).toBe(400);
    await agent.put(`/api/tasks/${id}`).set(auth(admin.token)).send({ steps: [] }).expect(200);
    expect(stepsOf(id)).toBeNull();
  });

  it('go through CSV, one per line in the cell', async () => {
    const { admin, mkTask } = await family();
    await mkTask('Make the bed', { steps: ['Pillow up', 'Sheet flat'] });
    const lines = parseCsv((await agent.get('/api/csv/tasks').set(auth(admin.token)).expect(200)).text).map((r) => r.cells);
    expect(lines[1][lines[0].indexOf('steps')]).toBe('Pillow up\nSheet flat');
    const csv = 'Room,Task,Steps\nHouse,Make the bed,"Pillow up\nSheet flat\nBlanket on"\nHouse,Feed the dog,"Scoop\nWater"\n';
    const applied = (await agent.post('/api/csv/tasks/import').set(auth(admin.token)).send({ csv, dryRun: false }).expect(200)).body;
    expect(applied.rows.map((r: any) => r.action)).toEqual(['update', 'add']);
    const steps = (name: string) => JSON.parse((db.prepare('SELECT steps FROM tasks WHERE name = ?').get(name) as { steps: string }).steps);
    expect(steps('Make the bed')).toEqual(['Pillow up', 'Sheet flat', 'Blanket on']);
    expect(steps('Feed the dog')).toEqual(['Scoop', 'Water']);
  });
});

describe('One thing at a time (NEW-2)', () => {
  it('is a button for kids by default, off for parents, and set per person by a parent', async () => {
    const { admin, kid, focus } = await family();
    expect(await focus(admin.token)).toBeNull();
    expect((await focus(kid.token)).mode).toBe('button');

    await agent.put(`/api/users/${kid.user.id}/view`).set(auth(admin.token)).send({ focusMode: 'home' }).expect(200);
    expect((await focus(kid.token)).mode).toBe('home');
    await agent.put(`/api/users/${kid.user.id}/view`).set(auth(kid.token)).send({ focusMode: 'off' }).expect(403);
    expect((await agent.put(`/api/users/${kid.user.id}/view`).set(auth(admin.token)).send({ focusMode: 'big' })).status).toBe(400);
    await agent.put(`/api/users/${kid.user.id}/view`).set(auth(admin.token)).send({ focusMode: 'off' }).expect(200);
    expect(await focus(kid.token)).toBeNull();
    await agent.put(`/api/users/${admin.user.id}/view`).set(auth(admin.token)).send({ focusMode: 'button' }).expect(200);
    expect((await focus(admin.token)).mode).toBe('button');

    // Settings → Features can switch it off for the whole house
    await agent.put(`/api/users/${kid.user.id}/view`).set(auth(admin.token)).send({ focusMode: null }).expect(200);
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('features', ?)").run(JSON.stringify({ rescue: false, focus: false }));
    expect(await focus(kid.token)).toBeNull();
  });

  it('lines up your own due chores first, then open ones (3 a day), and counts what you did', async () => {
    const { kid, twin, mkTask, focus } = await family();
    const mineLate = await mkTask('Feed the cat', { assignedUserIds: [kid.user.id], health: 0 });
    const mineSoon = await mkTask('Make the bed', { assignedUserIds: [kid.user.id], health: 0, frequencyDays: 1 });
    await mkTask('Not due yet', { assignedUserIds: [kid.user.id], health: 100 });
    await mkTask('Twin chore', { assignedUserIds: [twin.user.id] });
    await mkTask('Anytime', { onDemand: true });
    const open = [];
    for (let i = 0; i < 5; i++) open.push(await mkTask(`Open ${i}`));

    let f = await focus(kid.token);
    expect(f.line.map((t: any) => t.id)).toEqual([mineLate, mineSoon, open[0], open[1], open[2]]);
    expect(f.done).toBe(0);
    expect(f.line[0].name).toBe('Feed the cat');

    await agent.post(`/api/tasks/${mineLate}/complete`).set(auth(kid.token)).expect(200);
    await agent.post(`/api/tasks/${open[0]}/complete`).set(auth(kid.token)).expect(200);
    f = await focus(kid.token);
    expect(f.line.map((t: any) => t.id)).toEqual([mineSoon, open[1], open[2]]);
    expect(f.done).toBe(2);

    // Someone else took an open one: it leaves your line and the next one comes in
    await agent.post(`/api/tasks/${open[1]}/complete`).set(auth(twin.token)).expect(200);
    f = await focus(kid.token);
    expect(f.line.map((t: any) => t.id)).toEqual([mineSoon, open[2], open[3]]);

    await agent.post(`/api/tasks/${open[2]}/complete`).set(auth(kid.token)).expect(200);
    await agent.post(`/api/tasks/${open[3]}/complete`).set(auth(kid.token)).expect(200);
    await agent.post(`/api/tasks/${mineSoon}/complete`).set(auth(kid.token)).expect(200);
    f = await focus(kid.token);
    // Three open chores a day: the line is done
    expect(f.line).toEqual([]);
    expect(f.done).toBe(5);
  });

  it('puts the Rescue Mission after your own chores', async () => {
    const { admin, kid, mkTask, focus } = await family();
    const mine = await mkTask('Feed the cat', { assignedUserIds: [kid.user.id] });
    const open = await mkTask('Open chore');
    const forgotten = await mkTask('Clean the fridge');
    // Overdue by a whole interval, so it becomes today's mission
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(new Date(Date.now() - 20 * 86400000).toISOString(), forgotten);
    db.prepare("DELETE FROM app_settings WHERE key = 'features'").run();
    const mission = (await agent.get('/api/dashboard').set(auth(admin.token)).expect(200)).body.rescueMission;
    expect(mission.taskId).toBe(forgotten);
    const f = await focus(kid.token);
    expect(f.line.map((t: any) => t.id)).toEqual([mine, forgotten, open]);
  });
});
