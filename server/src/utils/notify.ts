import db from '../database';
import { isHosted } from '../hosted/context';
import { at, minuteOfDay, wall } from './clock';
import { getNotificationTypeSettings, getNtfySettings, getTelegramSettings, sendNtfyMessageDetailed, sendTelegramMessageDetailed, sendTimeout, type NotificationTypeSettings } from './notifications';

/**
 * Notifications to people, not just the family channel.
 *
 * Each person can have their own channels (an ntfy topic, a Telegram chat, a Home Assistant phone).
 * A message for someone goes to their own channels, in their language. People without any fall back
 * to the family channel (one message there, in the family's language), except for private kinds
 * (outcomes, summaries, nudges), which only go to personal channels. Each person can turn kinds off.
 * During quiet hours (and school hours, for kids) messages wait in a queue. Everything sent is logged.
 */

export type NotifyKind = keyof NotificationTypeSettings;
/** Only to the person's own channels: the family channel would be noise for everyone else */
const PRIVATE_KINDS: NotifyKind[] = ['outcome', 'summary', 'nudge', 'cheer'];

export interface Person {
  id: number;
  displayName: string;
  role: string;
  language: string;
  ntfyTopic: string | null;
  telegramChatId: string | null;
  haNotifyService: string | null;
  prefs: Partial<Record<NotifyKind, boolean>>;
}

export type Audience = number[] | 'parents' | 'kids' | 'everyone';
/** The text for one person (null person = the family channel); null = nothing to send */
export type Builder = (lang: string, person: Person | null) => string | null;

export type Channel = 'ntfy' | 'telegram' | 'ha';
export interface Delivery { channel: Channel; target: string; message: string }
/** Sends one message on one channel. Swapped out in tests. */
export type Transport = (d: Delivery) => Promise<{ ok: boolean; error?: string }>;

const getSetting = (key: string): string =>
  (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value?: string } | undefined)?.value ?? '';

function haSettings() {
  return { url: getSetting('haUrl').replace(/\/+$/, ''), token: getSetting('haToken'), familyService: getSetting('haFamilyService') };
}

/** Home Assistant is set up (never in hosted mode: see sendHomeAssistant). */
const haReady = () => !isHosted() && !!haSettings().url && !!haSettings().token;

async function sendHomeAssistant(service: string, message: string): Promise<{ ok: boolean; error?: string }> {
  // Hosted mode never calls an address a family typed: it could be a machine inside the hosting network
  if (isHosted()) return { ok: false, error: 'Home Assistant is not available on this server.' };
  const { url, token } = haSettings();
  if (!url || !token) return { ok: false, error: 'Home Assistant URL or token is missing.' };
  // Only a plain service name (notify.<service>), and http(s) URLs: no request smuggling
  const name = service.replace(/^notify\./, '');
  if (!/^[a-z0-9_]+$/.test(name)) return { ok: false, error: 'Invalid Home Assistant notify service.' };
  try {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) return { ok: false, error: 'Home Assistant URL must use http or https.' };
  } catch {
    return { ok: false, error: 'Invalid Home Assistant URL.' };
  }
  try {
    const res = await fetch(`${url}/api/services/notify/${name}`, {
      method: 'POST',
      signal: AbortSignal.timeout(sendTimeout()),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'TidyQuest', message }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `Home Assistant returned ${res.status}.` };
  } catch {
    return { ok: false, error: 'Could not reach Home Assistant.' };
  }
}

const realTransport: Transport = async ({ channel, target, message }) => {
  if (channel === 'ntfy') return sendNtfyMessageDetailed(message, { topic: target, ignoreEnabled: true });
  if (channel === 'telegram') return sendTelegramMessageDetailed(message, { chatId: target, ignoreEnabled: true });
  return sendHomeAssistant(target, message);
};
let transport: Transport = realTransport;
/** Tests: capture deliveries instead of sending (call with no argument to restore). */
export function setNotifyTransport(t?: Transport) { transport = t ?? realTransport; }

function parsePrefs(raw: unknown): Partial<Record<NotifyKind, boolean>> {
  try { return raw ? JSON.parse(String(raw)) : {}; } catch { return {}; }
}

export function getPeople(): Person[] {
  return (db.prepare('SELECT id, displayName, role, language, ntfyTopic, telegramChatId, haNotifyService, notifyPrefs FROM users ORDER BY id').all() as any[])
    .map((u) => ({ ...u, language: u.language || 'en', prefs: parsePrefs(u.notifyPrefs) }));
}

/** A person's own channels (only those whose provider is set up). */
export function personalChannels(p: Person): Array<{ channel: Channel; target: string }> {
  const out: Array<{ channel: Channel; target: string }> = [];
  if (p.ntfyTopic) out.push({ channel: 'ntfy', target: p.ntfyTopic });
  if (p.telegramChatId && getTelegramSettings().botToken) out.push({ channel: 'telegram', target: p.telegramChatId });
  if (p.haNotifyService && haReady()) out.push({ channel: 'ha', target: p.haNotifyService });
  return out;
}

/** The family channels that are switched on. */
export function familyChannels(): Array<{ channel: Channel; target: string }> {
  const out: Array<{ channel: Channel; target: string }> = [];
  const tg = getTelegramSettings();
  if (tg.enabled && tg.botToken && tg.chatId) out.push({ channel: 'telegram', target: tg.chatId });
  const ntfy = getNtfySettings();
  if (ntfy.enabled && ntfy.topic) out.push({ channel: 'ntfy', target: ntfy.topic });
  if (haReady() && haSettings().familyService) out.push({ channel: 'ha', target: haSettings().familyService });
  return out;
}

/** The family channel's language: the first parent's. */
function familyLanguage(people: Person[]): string {
  return people.find((p) => p.role === 'admin')?.language ?? 'en';
}

const minutesOf = (hm: string) => { const m = /^(\d\d):(\d\d)$/.exec(hm); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** Inside a daily window [start, end) that may cross midnight; returns when it ends, or null. */
function windowEnd(now: Date, start: string, end: string): Date | null {
  const s = minutesOf(start); const e = minutesOf(end);
  if (s === null || e === null || s === e) return null;
  const cur = minuteOfDay(now);
  const inside = s < e ? cur >= s && cur < e : cur >= s || cur < e;
  if (!inside) return null;
  const w = wall(now);
  const out = at(w.year, w.month, w.date, Math.floor(e / 60), e % 60);
  return out > now ? out : at(w.year, w.month, w.date + 1, Math.floor(e / 60), e % 60);
}

/** When a message to this person (null = family channel) may go out, if it has to wait. */
export function holdUntil(person: Person | null, now: Date = new Date()): Date | null {
  const quiet = windowEnd(now, getSetting('quietStart'), getSetting('quietEnd'));
  if (quiet) return quiet;
  const day = wall(now).weekday;
  const weekday = day >= 1 && day <= 5;
  if (person?.role === 'child' && weekday && getSetting('schoolHoursEnabled') === '1') {
    return windowEnd(now, getSetting('schoolStart') || '08:00', getSetting('schoolEnd') || '15:00');
  }
  return null;
}

function log(userId: number | null, channel: string, kind: string, message: string, ok: boolean, error: string | null, dedupeKey: string | null, now: Date) {
  db.prepare('INSERT INTO notification_log (sentAt, userId, channel, kind, message, ok, error, dedupeKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(now.toISOString(), userId, channel, kind, message, ok ? 1 : 0, error, dedupeKey);
  // Keep the last 1000 entries
  db.prepare('DELETE FROM notification_log WHERE id <= (SELECT id FROM notification_log ORDER BY id DESC LIMIT 1 OFFSET 1000)').run();
}

/**
 * Already handled with this key for this person / the family channel: sent, waiting in the queue, or
 * tried in the last 30 minutes (a failing channel isn't retried every minute).
 */
export function alreadySent(dedupeKey: string, userId: number | null, now: Date = new Date()): boolean {
  const who = userId === null ? 'IS NULL' : '= ?';
  const args = userId === null ? [dedupeKey] : [dedupeKey, userId];
  const recent = new Date(now.getTime() - 30 * 60000).toISOString();
  return !!db.prepare(`SELECT 1 FROM notification_log WHERE dedupeKey = ? AND userId ${who} AND (ok = 1 OR sentAt > ?) LIMIT 1`).get(...args, recent)
    || !!db.prepare(`SELECT 1 FROM notification_queue WHERE dedupeKey = ? AND userId ${who} LIMIT 1`).get(...args);
}

async function deliver(userId: number | null, kind: string, message: string, dedupeKey: string | null, now: Date): Promise<boolean> {
  const person = userId === null ? null : getPeople().find((p) => p.id === userId) ?? null;
  const channels = person ? personalChannels(person) : familyChannels();
  let any = false;
  for (const c of channels) {
    const result = await transport({ ...c, message }).catch(() => ({ ok: false, error: 'send failed' }));
    log(userId, `${person ? '' : 'family-'}${c.channel}`, kind, message, result.ok, result.ok ? null : result.error ?? null, dedupeKey, now);
    any = any || result.ok;
  }
  return any;
}

async function sendOrHold(person: Person | null, kind: NotifyKind, message: string, dedupeKey: string | null, now: Date): Promise<boolean> {
  const until = holdUntil(person, now);
  if (until) {
    db.prepare('INSERT INTO notification_queue (userId, kind, message, notBefore, dedupeKey) VALUES (?, ?, ?, ?, ?)')
      .run(person?.id ?? null, kind, message, until.toISOString(), dedupeKey);
    return true;
  }
  return deliver(person?.id ?? null, kind, message, dedupeKey, now);
}

/** Send what waited out quiet hours (called by the periodic check). */
export async function flushNotificationQueue(now: Date = new Date()): Promise<void> {
  const due = db.prepare('SELECT * FROM notification_queue WHERE notBefore <= ? ORDER BY id').all(now.toISOString()) as any[];
  for (const q of due) {
    // Claim it first so an overlapping check can't send it twice
    if (db.prepare('DELETE FROM notification_queue WHERE id = ?').run(q.id).changes === 0) continue;
    await deliver(q.userId, q.kind, q.message, q.dedupeKey, now);
  }
}

export function notificationsOn(kind: NotifyKind): boolean {
  return getSetting('notificationsEnabled') === '1' && getNotificationTypeSettings()[kind] !== false;
}

function resolve(audience: Audience, people: Person[]): Person[] {
  if (Array.isArray(audience)) return people.filter((p) => audience.includes(p.id));
  if (audience === 'parents') return people.filter((p) => p.role === 'admin');
  if (audience === 'kids') return people.filter((p) => p.role !== 'admin');
  return people;
}

/**
 * Tell people something. Each recipient with their own channels gets their own message (in their
 * language); the rest share one family-channel message, unless the kind is private. With a
 * dedupeKey, anyone who already got it isn't sent it again.
 */
export async function notifyPeople(audience: Audience, kind: NotifyKind, build: Builder, options: { now?: Date; dedupeKey?: string } = {}): Promise<void> {
  if (!notificationsOn(kind)) return;
  const now = options.now ?? new Date();
  const dedupeKey = options.dedupeKey ?? null;
  const people = getPeople();
  let needFamily = false;
  for (const p of resolve(audience, people)) {
    if (p.prefs[kind] === false) continue;
    if (personalChannels(p).length > 0) {
      if (dedupeKey && alreadySent(dedupeKey, p.id, now)) continue;
      const text = build(p.language, p);
      if (text) await sendOrHold(p, kind, text, dedupeKey, now);
    } else if (!PRIVATE_KINDS.includes(kind)) {
      needFamily = true;
    }
  }
  if (needFamily && familyChannels().length > 0 && !(dedupeKey && alreadySent(dedupeKey, null, now))) {
    const text = build(familyLanguage(people), null);
    if (text) await sendOrHold(null, kind, text, dedupeKey, now);
  }
}

/** Send one test message to a person's own channels (Settings → "Send a test"). */
export async function sendPersonTest(userId: number, message: string): Promise<Array<{ channel: string; ok: boolean; error?: string }>> {
  const person = getPeople().find((p) => p.id === userId);
  if (!person) return [];
  const out: Array<{ channel: string; ok: boolean; error?: string }> = [];
  for (const c of personalChannels(person)) {
    const r = await transport({ ...c, message }).catch(() => ({ ok: false, error: 'send failed' }));
    log(userId, c.channel, 'test', message, r.ok, r.ok ? null : r.error ?? null, null, new Date());
    out.push({ channel: c.channel, ok: r.ok, error: r.ok ? undefined : r.error });
  }
  return out;
}
