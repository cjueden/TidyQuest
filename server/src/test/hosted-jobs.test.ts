import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import type supertest from 'supertest';
import db from '../database';
import { currentFamily, perFamily, runInFamily } from '../hosted/context';
import { setEmailTransport, type Email } from '../hosted/email';
import { deleteFamily, isLiveFamily, openFamily, upgradeAllFamilies } from '../hosted/families';
import { resetDailyJobs, runJobs } from '../hosted/jobs';
import { mainDb } from '../hosted/mainDb';
import { endExpiredTrials } from '../hosted/trials';
import { at } from '../utils/clock';
import { sendDueTaskNotificationsIfNeeded, sendNtfyMessageDetailed, setSendTimeout } from '../utils/notifications';
import { setNotifyTransport, type Delivery } from '../utils/notify';
import { addTestFamily, createAdmin, createTestApp } from './setup';

// Hosted mode (NEW-11): the background jobs run for every family, each inside its own database.
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let agent: supertest.Agent;
let A: string;
let B: string;
let sent: Delivery[];

beforeEach(() => {
  const t = createTestApp({ hosted: true });
  agent = t.agent;
  A = t.familyId!;
  B = addTestFamily().familyId;
  sent = [];
  setNotifyTransport(async (d) => { sent.push(d); return { ok: true }; });
  resetDailyJobs();
});
afterEach(() => {
  setNotifyTransport();
  setSendTimeout();
  setEmailTransport();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const inFamily = <T>(id: string, fn: () => T): T => runInFamily(openFamily(id)!, fn);
const setStatus = (id: string, status: string, plan: string | null = null) =>
  mainDb().prepare('UPDATE families SET status = ?, plan = ? WHERE id = ?').run(status, plan, id);
// A family whose database is gone: main.db lists it (first, being oldest), but it can't be opened
const BROKEN = 'brokenbrokenbrok';
const addBrokenFamily = () =>
  mainDb().prepare("INSERT INTO families (id, name, status, createdAt) VALUES (?, 'Broken', 'trial', ?)").run(BROKEN, new Date(0).toISOString());

/** Notifications on, a family channel, and a chore that's never been done (so it's due today). */
function choreAndChannel(id: string, chore: string, topic: string) {
  inFamily(id, () => {
    for (const [key, value] of [['notificationsEnabled', '1'], ['ntfyEnabled', '1'], ['ntfyTopic', topic]]) {
      db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
    }
    const room = db.prepare("INSERT INTO rooms (name) VALUES ('Kitchen')").run().lastInsertRowid;
    db.prepare('INSERT INTO tasks (roomId, name, effort) VALUES (?, ?, 1)').run(room, chore);
  });
}
// Oct 14 2026 at the family's time (A and B are in the same zone); "due today" goes out at 09:00
const oct14 = (hour: number, minute = 0) => inFamily(A, () => at(2026, 9, 14, hour, minute));
const messagesTo = (topic: string) => sent.filter((d) => d.target === topic).map((d) => d.message).join('\n');

describe('Hosted mode: background jobs for every family', () => {
  it("sends each family's reminders to its own channels only", async () => {
    await createAdmin(agent, 'admin', 'admin123', 'Admin A', A);
    await createAdmin(agent, 'admin', 'admin123', 'Admin B', B);
    choreAndChannel(A, 'Feed the cat', 'a-topic');
    choreAndChannel(B, 'Walk the dog', 'b-topic');

    // The same minute for both: the "already checked this minute" memory is per family
    expect(await runJobs([sendDueTaskNotificationsIfNeeded], oct14(9))).toBe(true);
    expect(messagesTo('a-topic')).toContain('Feed the cat');
    expect(messagesTo('a-topic')).not.toContain('Walk the dog');
    expect(messagesTo('b-topic')).toContain('Walk the dog');
    expect(messagesTo('b-topic')).not.toContain('Feed the cat');
  });

  it('still sends "due today" when a run is late, up to 90 minutes', async () => {
    await createAdmin(agent, 'admin', 'admin123', 'Admin A', A);
    choreAndChannel(A, 'Feed the cat', 'a-topic');
    await runJobs([sendDueTaskNotificationsIfNeeded], oct14(8, 59));
    await runJobs([sendDueTaskNotificationsIfNeeded], oct14(10, 30));
    expect(sent).toEqual([]);
    await runJobs([sendDueTaskNotificationsIfNeeded], oct14(10, 29));
    expect(messagesTo('a-topic')).toContain('Feed the cat');
  });

  it('runs each job once per trial or paid family, skipping suspended, expired and deleted ones', async () => {
    const paid = addTestFamily('Paid').familyId;
    setStatus(paid, 'active', 'yearly');
    setStatus(addTestFamily('Suspended').familyId, 'suspended');
    setStatus(addTestFamily('Expired').familyId, 'expired');
    deleteFamily(addTestFamily('Gone').familyId);

    const seen: string[] = [];
    await runJobs([() => { seen.push(currentFamily()!.familyId); }]);
    expect(seen.sort()).toEqual([A, B, paid].sort());
  });

  it("doesn't let one broken family or job stop the rest, and logs which family it was", async () => {
    addBrokenFamily();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: string[] = [];
    await runJobs([
      () => { if (currentFamily()!.familyId === A) throw new Error('broken job'); },
      () => { seen.push(currentFamily()!.familyId); },
    ]);
    expect(seen.sort()).toEqual([A, B].sort());
    expect(error).toHaveBeenCalledWith(`[jobs] Family ${BROKEN} failed:`, expect.any(Error));
    expect(error).toHaveBeenCalledWith(expect.stringContaining(`failed for family ${A}`), expect.any(Error));
  });

  it('skips a run while the last one is still going', async () => {
    let finish!: () => void;
    const slow = new Promise<void>((resolve) => { finish = resolve; });
    const first = runJobs([() => slow]);
    expect(await runJobs([() => slow])).toBe(false);
    finish();
    expect(await first).toBe(true);
    expect(await runJobs([() => slow])).toBe(true);
  });

  it("keeps what a job remembers separately for each family", () => {
    const settledDay = perFamily('');
    inFamily(A, () => settledDay.set('2026-10-14'));
    expect(inFamily(B, () => settledDay.get())).toBe('');
    expect(inFamily(A, () => settledDay.get())).toBe('2026-10-14');
  });

  it("doesn't count a job's use of a family as activity", () => {
    const lastActive = () => (mainDb().prepare('SELECT lastActiveAt FROM families WHERE id = ?').get(A) as { lastActiveAt: string }).lastActiveAt;
    const created = lastActive();
    const later = Date.now() + 2 * HOUR;
    openFamily(A, later, { activity: false });
    expect(lastActive()).toBe(created);
    openFamily(A, later);
    expect(lastActive()).toBe(new Date(later).toISOString());
  });

  it("upgrades every family's database at startup, and logs one it can't open", () => {
    addBrokenFamily();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => upgradeAllFamilies()).not.toThrow();
    expect(error).toHaveBeenCalledWith(`[hosted] Family ${BROKEN} has no database.`);
  });

  it('removes deleted families once a day', async () => {
    const gone = (id: string) => !mainDb().prepare('SELECT 1 FROM families WHERE id = ?').get(id);
    const deletedOn = new Date('2027-02-01T12:00:00Z');
    deleteFamily(B, deletedOn);
    await runJobs([], new Date('2027-03-04T12:00:00Z'));
    expect(gone(B)).toBe(true);

    const C = addTestFamily('C').familyId;
    deleteFamily(C, deletedOn);
    await runJobs([], new Date('2027-03-04T18:00:00Z'));
    expect(gone(C)).toBe(false); // already ran today
    await runJobs([], new Date('2027-03-05T00:30:00Z'));
    expect(gone(C)).toBe(true);
  });

  it('gives up on a notification send after the time limit', async () => {
    const server = http.createServer(() => {}); // never answers
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    setSendTimeout(200);
    try {
      const started = Date.now();
      const result = await inFamily(A, () => sendNtfyMessageDetailed('Hi', {
        serverUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, topic: 'slow', ignoreEnabled: true,
      }));
      expect(result.ok).toBe(false);
      expect(Date.now() - started).toBeLessThan(5000);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

describe('Hosted mode: expired trials', () => {
  let emails: Email[];
  const trialEnded = Date.parse('2027-01-01T00:00:00Z');
  const daysAfterTrial = (days: number) => new Date(trialEnded + days * DAY);

  beforeEach(async () => {
    emails = [];
    setEmailTransport((email) => { emails.push(email); });
    vi.stubEnv('PUBLIC_URL', 'https://app.example');
    const admin = await createAdmin(agent, 'admin', 'admin123', 'Admin A', A);
    inFamily(A, () => db.prepare("UPDATE users SET language = 'fr' WHERE id = ?").run(admin.user.id));
    mainDb().prepare('UPDATE accounts SET emailConfirmedAt = ? WHERE familyId = ?').run('2026-12-01T00:00:00.000Z', A);
    mainDb().prepare('UPDATE families SET trialEndsAt = ? WHERE id IN (?, ?)').run(new Date(trialEnded).toISOString(), A, B);
    setStatus(B, 'active', 'yearly'); // B paid: never touched here
  });

  it('are kept while billing is off (no payment key), as decision 11 says', async () => {
    expect(await endExpiredTrials(daysAfterTrial(365))).toBe(0);
    expect(emails).toEqual([]);
    expect(isLiveFamily(A)).toBe(true);
  });

  it("warn the parents a week ahead, in each parent's language, then are deleted 60 days after the trial", async () => {
    vi.stubEnv('PAYMENT_KEY', 'test');
    await endExpiredTrials(daysAfterTrial(52));
    expect(emails).toEqual([]);

    await endExpiredTrials(daysAfterTrial(53));
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(`admin@${A}.example`);
    expect(emails[0].subject).toBe('Votre famille TidyQuest sera supprimée le 2 mars 2027');
    expect(emails[0].text).toContain('https://app.example/settings');
    expect(emails[0].text).toContain('Exporter les données');
    expect(emails[0].text).toContain('Paramètres');

    expect(await endExpiredTrials(daysAfterTrial(59))).toBe(0);
    expect(emails).toHaveLength(1); // warned once
    expect(await endExpiredTrials(daysAfterTrial(60))).toBe(1);
    expect(isLiveFamily(A)).toBe(false);
    expect(isLiveFamily(B)).toBe(true);
  });

  it("give a week's notice even when billing starts long after the trial ended", async () => {
    vi.stubEnv('PAYMENT_KEY', 'test');
    expect(await endExpiredTrials(daysAfterTrial(200))).toBe(0);
    expect(emails).toHaveLength(1);
    expect(await endExpiredTrials(daysAfterTrial(206))).toBe(0);
    expect(await endExpiredTrials(daysAfterTrial(207))).toBe(1);
  });

  it('are kept until PUBLIC_URL is set, since the warning needs a link', async () => {
    vi.stubEnv('PAYMENT_KEY', 'test');
    vi.stubEnv('PUBLIC_URL', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await endExpiredTrials(daysAfterTrial(365))).toBe(0);
    expect(emails).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});
