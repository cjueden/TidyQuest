import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';
import { flushNotificationQueue, notifyPeople, setNotifyTransport, type Delivery } from '../utils/notify';
import { notifyBadge, notifyChoreApproved } from '../utils/notifyMessages';
import { runScheduledNotifications } from '../utils/notifySchedule';
import { at as homeAt } from '../utils/clock';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;
let sent: Delivery[];

beforeEach(() => {
  ({ agent, db } = createTestApp());
  sent = [];
  setNotifyTransport(async (d) => { sent.push(d); return { ok: true }; });
});
afterEach(() => setNotifyTransport());

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const setting = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
// Wednesday Oct 14 2026
const at = (hour: number, minute = 0, day = 14) => homeAt(2026, 9, day, hour, minute);

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  setting('notificationsEnabled', '1');
  setting('ntfyEnabled', '1');
  setting('ntfyTopic', 'family-topic');
  const room = (await agent.post('/api/rooms').set(auth(admin.token)).send({ name: 'Garage', roomType: 'other' })).body.id as number;
  return { admin, kid, room };
}
const channel = (topic: string | null, userId: number) => db.prepare('UPDATE users SET ntfyTopic = ? WHERE id = ?').run(topic, userId);

describe('Who gets what, where', () => {
  it("sends to a person's own channel in their language, and the family channel for the rest", async () => {
    const { admin, kid } = await family();
    channel('kid-topic', kid.user.id);
    db.prepare("UPDATE users SET language = 'fr' WHERE id = ?").run(kid.user.id);
    await notifyBadge(kid.user.id, { titleKey: 'achievements.firstStep', title: null });
    expect(sent.map((d) => [d.target, d.message])).toEqual([
      ['kid-topic', '🏆 Tu as obtenu un badge : Premier pas !'],
      ['family-topic', '🏆 Kid earned a badge: First Step'],
    ]);
    void admin;
  });

  it('keeps private messages off the family channel, and respects what each person turned off', async () => {
    const { admin, kid } = await family();
    await notifyChoreApproved(kid.user.id, admin.user.id, 'Feed the dogs', 5);
    expect(sent).toEqual([]); // the kid has no channel of their own: nothing goes to everyone
    channel('kid-topic', kid.user.id);
    await notifyChoreApproved(kid.user.id, admin.user.id, 'Feed the dogs', 5);
    expect(sent.map((d) => d.message)).toEqual(['✅ Admin approved “Feed the dogs”: +5 coins']);
    db.prepare('UPDATE users SET notifyPrefs = ? WHERE id = ?').run(JSON.stringify({ outcome: false }), kid.user.id);
    await notifyChoreApproved(kid.user.id, admin.user.id, 'Feed the dogs', 5);
    expect(sent).toHaveLength(1);
  });

  it('holds messages during quiet hours (and school hours for kids) and sends them after', async () => {
    const { kid } = await family();
    channel('kid-topic', kid.user.id);
    setting('quietStart', '21:00'); setting('quietEnd', '07:00');
    await notifyPeople([kid.user.id], 'outcome', () => 'late news', { now: at(22) });
    expect(sent).toEqual([]);
    await flushNotificationQueue(at(6, 59, 15));
    expect(sent).toEqual([]);
    await flushNotificationQueue(at(7, 0, 15));
    expect(sent.map((d) => d.message)).toEqual(['late news']);

    setting('schoolHoursEnabled', '1');
    await notifyPeople([kid.user.id], 'outcome', () => 'during school', { now: at(10) });
    await flushNotificationQueue(at(14, 59));
    expect(sent).toHaveLength(1);
    await flushNotificationQueue(at(15, 0));
    expect(sent.map((d) => d.message)).toEqual(['late news', 'during school']);
  });
});

describe('Timed notifications', () => {
  it("sends the morning list of a kid's own chores once, only in its window", async () => {
    const { admin, kid, room } = await family();
    channel('kid-topic', kid.user.id);
    const mk = async (name: string, extra: object) => (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name, effort: 1, frequencyDays: 1, ...extra })).body.id;
    await mk('Bins out', { assignedUserIds: [kid.user.id] });
    await mk('Sweep', {}); // open to anyone: not in their list
    await runScheduledNotifications(at(6, 59));
    expect(sent).toEqual([]);
    await runScheduledNotifications(at(7, 5));
    await runScheduledNotifications(at(7, 6));
    expect(sent.map((d) => d.message)).toEqual(['☀️ Good morning, Kid! Today: Bins out']);
    await runScheduledNotifications(at(9, 0)); // window over
    expect(sent).toHaveLength(1);
  });

  it('nudges in the evening about undone chores and a streak about to break', async () => {
    const { admin, kid, room } = await family();
    channel('kid-topic', kid.user.id);
    await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Bins out', effort: 1, frequencyDays: 1, assignedUserIds: [kid.user.id] });
    db.prepare("UPDATE users SET currentStreak = 4, lastActiveDate = '2026-10-13' WHERE id = ?").run(kid.user.id);
    await runScheduledNotifications(at(19, 1));
    expect(sent.map((d) => d.message)).toEqual(['🌙 Still to do today: Bins out\n🔥 Do one chore today to keep your 4-day streak!']);
  });

  it('reminds at the task time, again two hours later, then tells a parent', async () => {
    const { admin, kid, room } = await family();
    channel('kid-topic', kid.user.id);
    channel('dad-topic', admin.user.id);
    const bins = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token))
      .send({ name: 'Bins to the curb', effort: 1, frequencyDays: 7, assignedUserIds: [kid.user.id], reminderTime: '19:00', reminderDayBefore: true })).body.id;
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(at(19, 0, 8).toISOString(), bins); // due tomorrow (Thursday)
    for (const [h, m] of [[18, 59], [19, 0], [19, 30], [21, 0], [23, 0], [23, 30]]) await runScheduledNotifications(at(h, m));
    expect(sent.map((d) => [d.target, d.message])).toEqual([
      ['kid-topic', '⏰ For tomorrow: Bins to the curb'],
      ['kid-topic', '⏰ Still not done: Bins to the curb'],
      ['dad-topic', '⚠️ Still not done: Bins to the curb (Kid)'],
    ]);
    const bad = await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'X', effort: 1, reminderTime: '7pm' });
    expect(bad.body.error).toBe('invalid_reminder_time');
  });

  it('stops reminding once the chore is done', async () => {
    const { admin, kid, room } = await family();
    channel('kid-topic', kid.user.id);
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token))
      .send({ name: 'Feed the cat', effort: 1, frequencyDays: 1, assignedUserIds: [kid.user.id], reminderTime: '17:00' })).body.id;
    await runScheduledNotifications(at(17, 0));
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(at(18).toISOString(), task);
    await runScheduledNotifications(at(19, 0));
    await runScheduledNotifications(at(21, 0));
    expect(sent.map((d) => d.message)).toEqual(['⏰ Reminder: Feed the cat']);
  });

  it('sends parents a Sunday recap', async () => {
    const { admin, kid, room } = await family();
    channel('dad-topic', admin.user.id);
    db.prepare('UPDATE users SET isParticipant = 0 WHERE id = ?').run(admin.user.id);
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Rake', effort: 1, frequencyDays: 1 })).body.id;
    db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 25, 'approved')").run(task, kid.user.id, at(10, 0, 17).toISOString());
    await runScheduledNotifications(at(18, 5, 18)); // Sunday Oct 18
    expect(sent.map((d) => d.message)).toEqual(['📊 This week: Kid 25 coins (1 chores)\n🏆 Winner: Kid']);
  });

  it('recaps the week that just ended when weeks start on the recap day (Sunday)', async () => {
    const { admin, kid, room } = await family();
    channel('dad-topic', admin.user.id);
    db.prepare('UPDATE users SET isParticipant = 0 WHERE id = ?').run(admin.user.id);
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('weekStart', '0')").run();
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Rake', effort: 1, frequencyDays: 1 })).body.id;
    db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 25, 'approved')").run(task, kid.user.id, at(10, 0, 17).toISOString());
    await runScheduledNotifications(at(18, 5, 18)); // Sunday Oct 18: last week was Sun 11 – Sat 17
    expect(sent.map((d) => d.message)).toEqual(['📊 Last week: Kid 25 coins (1 chores)\n🏆 Winner: Kid']);
  });
});

describe('Notification settings API', () => {
  it("lets a parent set times, quiet hours and anyone's channels; kids only their own", async () => {
    const { admin, kid } = await family();
    expect((await agent.put('/api/notify/settings').set(auth(admin.token)).send({ morningTime: '7am' })).body.error).toBe('invalid_time');
    const s = (await agent.put('/api/notify/settings').set(auth(admin.token)).send({ morningTime: '06:45', quietStart: '21:30', quietEnd: '06:30', haUrl: 'http://ha.local:8123/', haToken: 'secret' })).body;
    expect(s).toMatchObject({ morningTime: '06:45', quietStart: '21:30', haUrl: 'http://ha.local:8123', hasHaToken: true });
    expect(JSON.stringify(s)).not.toContain('secret');
    expect((await agent.put('/api/notify/settings').set(auth(kid.token)).send({})).status).toBe(403);

    const mine = (await agent.put(`/api/notify/people/${kid.user.id}`).set(auth(kid.token)).send({ ntfyTopic: 'cecil-chores', prefs: { nudge: false } })).body;
    expect(mine).toMatchObject({ ntfyTopic: 'cecil-chores', channels: ['ntfy'], prefs: { nudge: false, outcome: true } });
    expect((await agent.put(`/api/notify/people/${admin.user.id}`).set(auth(kid.token)).send({ ntfyTopic: 'x' })).status).toBe(403);
    expect((await agent.put(`/api/notify/people/${kid.user.id}`).set(auth(admin.token)).send({ ntfyTopic: 'bad topic!' })).body.error).toBe('invalid_topic');

    const test = (await agent.post(`/api/notify/people/${kid.user.id}/test`).set(auth(kid.token))).body;
    expect(test.results).toEqual([{ channel: 'ntfy', ok: true }]);
    expect(sent[0].message).toBe('👋 Test from TidyQuest: notifications for Kid work!');
    const log = (await agent.get('/api/notify/log').set(auth(admin.token))).body;
    expect(log[0]).toMatchObject({ displayName: 'Kid', channel: 'ntfy', kind: 'test', ok: 1 });
  });
});

describe('Rejecting with a reason', () => {
  it("tells the kid why, in one line; the reason is optional and can't be an essay", async () => {
    const { admin, kid, room } = await family();
    channel('kid-topic', kid.user.id);
    await agent.put('/api/users/strict-mode-config').set(auth(admin.token)).send({ strictMode: true }).expect(200);
    const task = (await agent.post(`/api/rooms/${room}/tasks`).set(auth(admin.token)).send({ name: 'Sweep', effort: 1, onDemand: true })).body.id as number;
    const tap = async () => {
      await agent.post(`/api/tasks/${task}/complete`).set(auth(kid.token)).expect(200);
      return (await agent.get('/api/completions/pending').set(auth(admin.token))).body.pending.at(-1).id as number;
    };
    const toKid = () => sent.filter((d) => d.target === 'kid-topic').map((d) => d.message);

    let id = await tap();
    await agent.delete(`/api/completions/${id}/reject`).set(auth(admin.token)).send({ reason: 'x'.repeat(201) }).expect(400);
    await agent.delete(`/api/completions/${id}/reject`).set(auth(admin.token)).send({ reason: '  Still   leaves\nby the door ' }).expect(200);
    expect(toKid().at(-1)).toBe('↩️ “Sweep” wasn\'t approved this time. Admin says: Still leaves by the door');

    id = await tap();
    await agent.post('/api/completions/reject-batch').set(auth(admin.token)).send({ ids: [id], reason: 'Corners too' }).expect(200);
    expect(toKid().at(-1)).toMatch(/Admin says: Corners too$/);

    id = await tap();
    await agent.delete(`/api/completions/${id}/reject`).set(auth(admin.token)).expect(200);
    expect(toKid().at(-1)).toMatch(/Ask Admin what's missing\.$/);
  });
});
