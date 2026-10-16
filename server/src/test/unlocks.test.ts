import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;
beforeEach(() => {
  ({ agent, db } = createTestApp());
});
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const give = (userId: number, amount: number) => db.prepare('INSERT INTO coin_adjustments (userId, amount, reason) VALUES (?, ?, ?)').run(userId, amount, 'test');

describe('Unlockables from levels', () => {
  it('locks frames, celebrations, titles and the new themes until the level that unlocks them', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
    const me = () => agent.get('/api/unlocks').set(auth(kid.token));
    const pick = (body: object) => agent.put('/api/unlocks').set(auth(kid.token)).send(body);

    const start = (await me()).body;
    expect([start.level, start.titles, start.next]).toEqual([1, [], { level: 2, kind: 'frame', id: 'bronze' }]);
    expect((await pick({ frame: 'bronze' })).body).toEqual({ error: 'locked', field: 'frame' });
    expect((await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(kid.token)).send({ theme: 'galaxy' })).body.error).toBe('locked');
    expect((await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(admin.token)).send({ theme: 'galaxy' })).body.error).toBe('locked');
    expect((await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(kid.token)).send({ theme: 'night' })).status).toBe(200);

    // 300 coins = level 4: bronze frame, coin celebration and the Forest theme, but not titles yet
    give(kid.user.id, 300);
    expect((await pick({ frame: 'bronze', celebration: 'coins' })).body.chosen).toMatchObject({ frame: 'bronze', celebration: 'coins' });
    expect((await pick({ celebration: 'fireworks' })).body.error).toBe('locked');
    expect((await pick({ title: 'level' })).body.error).toBe('locked');
    expect((await agent.put(`/api/users/${kid.user.id}/profile`).set(auth(kid.token)).send({ theme: 'forest' })).status).toBe(200);

    // 2,250 coins = level 10: everything, and the title shows for the family
    give(kid.user.id, 1950);
    const all = (await pick({ frame: 'rainbow', celebration: 'fireworks', title: 'level' })).body;
    expect([all.level, all.next, all.items.every((i: any) => i.unlocked)]).toEqual([10, null, true]);
    const cosmetics = (await agent.get('/api/dashboard').set(auth(admin.token))).body.cosmetics[kid.user.id];
    expect(cosmetics).toEqual({ level: 10, frame: 'rainbow', celebration: 'fireworks', titleKey: 'levels.l10' });
    expect((await pick({ frame: null })).body.chosen.frame).toBeNull();
  });

  it('turns a hard badge into a frame and any earned badge into a title', async () => {
    const admin = await createAdmin(agent);
    const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
    give(kid.user.id, 500); // level 5: titles
    const pick = (body: object) => agent.put('/api/unlocks').set(auth(kid.token)).send(body);
    expect((await pick({ frame: 'badge:perfect_4' })).body.error).toBe('locked');
    db.prepare("INSERT INTO user_achievement_notifications (userId, achievementId) VALUES (?, 'perfect_4')").run(kid.user.id);
    const res = (await pick({ frame: 'badge:perfect_4', title: 'badge:perfect_4' })).body;
    expect(res.badgeFrames.find((f: any) => f.id === 'badge:perfect_4')).toMatchObject({ unlocked: true, icon: 'crown' });
    expect(res.titles.map((o: any) => o.id)).toEqual(['level', 'badge:perfect_4']);
    expect((await agent.get('/api/dashboard').set(auth(kid.token))).body.cosmetics[kid.user.id].titleKey).toBe('achievements.perfectMonth');
  });
});
