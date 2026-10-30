import db from '../database';
import { isSeasonalNow, nextDueAt, type ScheduledTask } from './schedule';
import { dateStr, wall } from './clock';
import { perFamily } from '../hosted/context';
import { ntfyServerAllowed } from '../hosted/limits';

interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  chatId: string;
  notificationTime: string;
}

export interface NotificationTypeSettings {
  taskDue: boolean;
  rewardRequest: boolean;
  achievementUnlocked: boolean;
  /** A child finished a chore and it's waiting for a parent (Strict Mode) */
  choreApproval: boolean;
  /** A double coins event started, or has an hour left */
  coinBoost: boolean;
  /** To a kid: a chore or reward approved or turned down, coins added or taken away */
  outcome: boolean;
  /** Morning "today's chores" for kids, Sunday recap for parents */
  summary: boolean;
  /** Evening: what's still undone, a streak about to break, close to the weekly goal */
  nudge: boolean;
  /** Per-task reminders at a set time, then again, then to a parent */
  reminder: boolean;
  /** The day's Rescue Mission, in the morning */
  rescue: boolean;
  /** Someone cheered a chore you did */
  cheer: boolean;
  /** Someone asked you to team up on a chore, or joined yours */
  teamup: boolean;
}

export const NOTIFICATION_KINDS: Array<keyof NotificationTypeSettings> = ['taskDue', 'rewardRequest', 'achievementUnlocked', 'choreApproval', 'coinBoost', 'outcome', 'summary', 'nudge', 'reminder', 'rescue', 'cheer', 'teamup'];

function getSetting(key: string): string {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value?: string } | undefined;
  return row?.value || '';
}

export function getTelegramSettings(): TelegramSettings {
  return {
    enabled: getSetting('telegramEnabled') === '1',
    botToken: getSetting('telegramBotToken'),
    chatId: getSetting('telegramChatId'),
    notificationTime: normalizeNotificationTime(getSetting('telegramNotificationTime')),
  };
}

const DEFAULT_NOTIFICATION_TYPES = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])) as unknown as NotificationTypeSettings;

export function getNotificationTypeSettings(): NotificationTypeSettings {
  const raw = getSetting('notificationTypes') || getSetting('telegramNotificationTypes');
  if (!raw) return DEFAULT_NOTIFICATION_TYPES;
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationTypeSettings>;
    return Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, parsed[k] !== false])) as unknown as NotificationTypeSettings;
  } catch {
    return DEFAULT_NOTIFICATION_TYPES;
  }
}

export function isNotificationTypeEnabled(type: keyof NotificationTypeSettings): boolean {
  return getNotificationTypeSettings()[type];
}

interface SendTelegramMessageOptions {
  ignoreEnabled?: boolean;
  botToken?: string;
  chatId?: string;
}

interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

function normalizeNotificationTime(value: string): string {
  const trimmed = value.trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : '09:00';
}

function toLocalIsoDay(date: Date): string {
  return dateStr(date);
}

function getDueIsoDay(task: ScheduledTask, now: Date): string {
  // Rolling interval, set weekdays or monthly, and the start date (utils/schedule.ts); never done = due now
  return toLocalIsoDay(nextDueAt(task, now) ?? now);
}

// No send (Telegram, ntfy, Home Assistant) waits longer than this, so a slow server can't hold up the
// background jobs of everyone else
let sendTimeoutMs = 10_000;
export const sendTimeout = () => sendTimeoutMs;
/** Tests: a shorter time limit (call with no argument to restore). */
export function setSendTimeout(ms = 10_000) { sendTimeoutMs = ms; }

export async function sendTelegramMessageDetailed(message: string, options: SendTelegramMessageOptions = {}): Promise<TelegramSendResult> {
  const cfg = getTelegramSettings();
  const botToken = options.botToken?.trim() || cfg.botToken;
  const chatId = options.chatId?.trim() || cfg.chatId;
  if (!botToken) return { ok: false, error: 'Telegram bot token is missing.' };
  if (!chatId) return { ok: false, error: 'Telegram chat ID is missing.' };
  if (!cfg.enabled && !options.ignoreEnabled) return { ok: false, error: 'Notifications are disabled.' };

  // Security: Validate Telegram bot token format to prevent SSRF
  // Telegram tokens have format: 123456789:ABCdef-GHIjkl_MNOpqr
  // Must contain only digits, letters, hyphens, underscores, and exactly one colon
  const telegramTokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
  if (!telegramTokenPattern.test(botToken)) {
    return { ok: false, error: 'Invalid Telegram bot token format.' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      signal: AbortSignal.timeout(sendTimeout()),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    });
    if (response.ok) return { ok: true };

    const body = await response.json().catch(() => null) as { description?: string } | null;
    const details = body?.description ? ` ${body.description}` : '';
    return { ok: false, error: `Telegram API rejected the request.${details}`.trim() };
  } catch {
    return { ok: false, error: 'Could not reach Telegram API (network/connectivity issue).' };
  }
}

export async function sendTelegramMessage(message: string, options: SendTelegramMessageOptions = {}): Promise<boolean> {
  const result = await sendTelegramMessageDetailed(message, options);
  return result.ok;
}

/* ── ntfy ── */

interface NtfySettings {
  enabled: boolean;
  serverUrl: string;
  topic: string;
  token: string;
}

interface SendNtfyMessageOptions {
  ignoreEnabled?: boolean;
  serverUrl?: string;
  topic?: string;
  token?: string;
}

interface NtfySendResult {
  ok: boolean;
  error?: string;
}

export function getNtfySettings(): NtfySettings {
  return {
    enabled: getSetting('ntfyEnabled') === '1',
    serverUrl: getSetting('ntfyServerUrl') || 'https://ntfy.sh',
    topic: getSetting('ntfyTopic'),
    token: getSetting('ntfyToken'),
  };
}

export async function sendNtfyMessageDetailed(message: string, options: SendNtfyMessageOptions = {}): Promise<NtfySendResult> {
  const cfg = getNtfySettings();
  const serverUrl = (options.serverUrl?.trim() || cfg.serverUrl).replace(/\/+$/, '');
  const topic = options.topic?.trim() || cfg.topic;
  const token = options.token?.trim() || cfg.token;
  if (!topic) return { ok: false, error: 'ntfy topic is missing.' };
  if (!cfg.enabled && !options.ignoreEnabled) return { ok: false, error: 'ntfy notifications are disabled.' };

  // Validate URL to prevent SSRF
  try {
    const parsed = new URL(`${serverUrl}/${topic}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, error: 'ntfy server URL must use http or https.' };
    }
    // Hosted mode only sends to ntfy.sh (hosted/limits.ts)
    if (!ntfyServerAllowed(parsed.href)) return { ok: false, error: 'Only ntfy.sh can be used on this server.' };
  } catch {
    return { ok: false, error: 'Invalid ntfy server URL.' };
  }

  try {
    const headers: Record<string, string> = { Title: 'TidyQuest' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${serverUrl}/${topic}`, {
      method: 'POST',
      signal: AbortSignal.timeout(sendTimeout()),
      headers,
      body: message,
    });
    if (response.ok) return { ok: true };
    const text = await response.text().catch(() => '');
    return { ok: false, error: `ntfy returned ${response.status}.${text ? ` ${text}` : ''}`.trim() };
  } catch {
    return { ok: false, error: 'Could not reach ntfy server (network/connectivity issue).' };
  }
}

export async function sendNtfyMessage(message: string, options: SendNtfyMessageOptions = {}): Promise<boolean> {
  const result = await sendNtfyMessageDetailed(message, options);
  return result.ok;
}

/* ── Unified sender ── */

export async function sendNotification(message: string): Promise<{ telegram?: boolean; ntfy?: boolean }> {
  const results: { telegram?: boolean; ntfy?: boolean } = {};
  const telegramCfg = getTelegramSettings();
  const ntfyCfg = getNtfySettings();

  if (telegramCfg.enabled && telegramCfg.botToken && telegramCfg.chatId) {
    results.telegram = await sendTelegramMessage(message);
  }
  if (ntfyCfg.enabled && ntfyCfg.topic) {
    results.ntfy = await sendNtfyMessage(message);
  }
  return results;
}

// The last minute the "due today" check ran, per family
const lastCheckedMinute = perFamily<string | null>(null);
// A late run (many families, a slow send) still sends "due today" within this long of the set time
const DUE_WINDOW_MIN = 90;

export function isAnyProviderEnabled(): boolean {
  if (getSetting('notificationsEnabled') !== '1') return false;
  const tg = getTelegramSettings();
  const ntfy = getNtfySettings();
  return (tg.enabled && !!tg.botToken && !!tg.chatId) || (ntfy.enabled && !!ntfy.topic);
}

/** "Due today" at the set time (or a little after, if the run is late), to each task's people (utils/notifyMessages.ts). Once per task per day. */
export async function sendDueTaskNotificationsIfNeeded(now: Date = new Date()): Promise<void> {
  if (getSetting('notificationsEnabled') !== '1') return;
  if (!isNotificationTypeEnabled('taskDue')) return;

  const w = wall(now);
  const nowHm = `${String(w.hours).padStart(2, '0')}:${String(w.minutes).padStart(2, '0')}`;
  const currentMinute = `${toLocalIsoDay(now)} ${nowHm}`;
  if (currentMinute === lastCheckedMinute.get()) return;
  lastCheckedMinute.set(currentMinute);

  const notificationTime = normalizeNotificationTime(getSetting('notificationTime') || getSetting('telegramNotificationTime'));
  const [hours, minutes] = notificationTime.split(':').map(Number);
  const late = w.hours * 60 + w.minutes - (hours * 60 + minutes);
  if (late < 0 || late >= DUE_WINDOW_MIN) return;

  const today = toLocalIsoDay(now);
  const tasks = db.prepare(
    `SELECT t.*, r.name AS roomName FROM tasks t LEFT JOIN rooms r ON r.id = t.roomId WHERE t.isSeasonal = 0 AND t.onDemand = 0 AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND t.pausedAt IS NULL`
  ).all() as any[];
  // Loaded lazily: notifyMessages imports this module
  const { notifyTaskDue } = await import('./notifyMessages');
  for (const task of tasks) {
    if (isSeasonalNow(task, now)) continue; // outside its season
    if (getDueIsoDay(task, now) !== today) continue;
    if (db.prepare('SELECT id FROM task_due_notifications WHERE taskId = ? AND dueDate = ?').get(task.id, today)) continue;
    db.prepare('INSERT OR IGNORE INTO task_due_notifications (taskId, dueDate) VALUES (?, ?)').run(task.id, today);
    await notifyTaskDue(task, today);
  }
}
