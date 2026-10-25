import db from '../database';
import { familyZone } from './clock';
import { tr } from './i18n';
import { notificationsOn, notifyPeople, type Builder } from './notify';

/** A double (triple…) coins event, e.g. getting the house ready for a party. */
export interface CoinBoost {
  id: number;
  title: string;
  multiplier: number;
  startAt: string;
  endAt: string;
  /** Rooms it applies to (null with no taskIds = everything) */
  roomIds: number[] | null;
  /** Chores it applies to, on top of its rooms */
  taskIds: number[] | null;
  createdBy: number | null;
  createdAt: string;
  notifiedStart: number;
  notifiedEnding: number;
}

const HOUR = 3600000;

/** A stored JSON id list (roomIds, taskIds); empty or missing = null */
export function parseIds(raw: unknown): number[] | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.length > 0 ? ids.map(Number).filter(Number.isInteger) : null;
  } catch {
    return null;
  }
}

export function toBoost(row: any): CoinBoost {
  return { ...row, multiplier: Number(row.multiplier), roomIds: parseIds(row.roomIds), taskIds: parseIds(row.taskIds) };
}

export function getBoost(id: number): CoinBoost | null {
  const row = db.prepare('SELECT * FROM coin_boosts WHERE id = ?').get(id);
  return row ? toBoost(row) : null;
}

/** Boosts running right now (start inclusive, end exclusive), soonest-ending first. */
export function getActiveBoosts(now: Date = new Date()): CoinBoost[] {
  const iso = now.toISOString();
  return (db.prepare('SELECT * FROM coin_boosts WHERE startAt <= ? AND endAt > ? ORDER BY endAt ASC, id ASC').all(iso, iso) as any[]).map(toBoost);
}

/** Whether a boost counts for this chore: nothing picked = everything; otherwise its room or the chore itself. */
export function boostCovers(b: Pick<CoinBoost, 'roomIds' | 'taskIds'>, taskId: number, roomId: number): boolean {
  if (!b.roomIds && !b.taskIds) return true;
  return !!b.roomIds?.includes(roomId) || !!b.taskIds?.includes(taskId);
}

/** The multiplier for completing this chore now: the biggest running boost that covers it (boosts don't stack). */
export function boostMultiplierFor(taskId: number, roomId: number, now: Date = new Date()): number {
  let best = 1;
  for (const b of getActiveBoosts(now)) {
    if (boostCovers(b, taskId, roomId)) best = Math.max(best, b.multiplier);
  }
  return best;
}

/** "2", "1.5" */
export function formatMultiplier(m: number): string {
  return String(Math.round(m * 100) / 100);
}

const names = (table: 'rooms' | 'tasks', ids: number[] | null, order: string) => (!ids ? [] :
  (db.prepare(`SELECT name FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY ${order}`).all(...ids) as { name: string }[]).map((r) => r.name));

/** Names of the chores a boost picked (Home's banner shows them) */
export const boostTaskNames = (b: CoinBoost) => names('tasks', b.taskIds, 'name');

/** "Kitchen, Clean Shower & Tub, Vacuum Living Room +2 more"; '' when it covers everything */
function targetNames(b: CoinBoost, lang: string): string {
  const all = [...names('rooms', b.roomIds, 'sortOrder, id'), ...boostTaskNames(b)];
  return all.length > 3 ? `${all.slice(0, 3).join(', ')} ${tr(lang, 'notify.andMore', { n: all.length - 3 })}` : all.join(', ');
}

const LOCALES: Record<string, string> = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT', nl: 'nl-NL' };
const timeLabel = (iso: string, lang = 'en') => new Date(iso).toLocaleString(LOCALES[lang] ?? 'en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: familyZone() });

/** The start and last-hour messages, in a given language. */
function boostMessage(b: CoinBoost, which: 'start' | 'ending'): Builder {
  return (lang) => {
    const vars = { multiplier: formatMultiplier(b.multiplier), title: b.title, time: timeLabel(b.endAt, lang) };
    if (which === 'ending') return tr(lang, 'notify.boostEnding', vars);
    const targets = targetNames(b, lang ?? 'en');
    return tr(lang, 'notify.boostStart', vars) + (targets ? ` (${targets})` : '');
  };
}

/**
 * Called by the periodic notification check: tells everyone when a boost starts and when it has
 * an hour left. Each message is claimed (flag set) before sending and released if sending fails,
 * so overlapping checks can't send it twice.
 */
export async function sendCoinBoostNotificationsIfNeeded(
  now: Date = new Date(),
  sendFn: (message: string, build: Builder) => Promise<boolean> = async (_message, build) => {
    await notifyPeople('everyone', 'coinBoost', build, { now });
    return true;
  },
): Promise<void> {
  if (!notificationsOn('coinBoost')) return;
  const nowMs = now.getTime();

  const claim = (id: number, column: 'notifiedStart' | 'notifiedEnding') =>
    db.prepare(`UPDATE coin_boosts SET ${column} = 1 WHERE id = ? AND ${column} = 0`).run(id).changes > 0;
  const release = (id: number, column: 'notifiedStart' | 'notifiedEnding') =>
    db.prepare(`UPDATE coin_boosts SET ${column} = 0 WHERE id = ?`).run(id);

  for (const b of getActiveBoosts(now)) {
    const endMs = new Date(b.endAt).getTime();
    const inLastHour = endMs - nowMs <= HOUR;
    // Short boosts (an hour or less), or a start we only notice in the last hour, get the start message only
    const skipEnding = endMs - new Date(b.startAt).getTime() <= HOUR || (inLastHour && !b.notifiedStart);

    if (!b.notifiedStart && claim(b.id, 'notifiedStart')) {
      if (skipEnding) claim(b.id, 'notifiedEnding');
      const build = boostMessage(b, 'start');
      const ok = await sendFn(build('en', null) ?? '', build).catch(() => false);
      if (!ok) {
        release(b.id, 'notifiedStart');
        if (skipEnding) release(b.id, 'notifiedEnding');
      }
      continue;
    }

    if (inLastHour && !b.notifiedEnding && claim(b.id, 'notifiedEnding')) {
      const build = boostMessage(b, 'ending');
      const ok = await sendFn(build('en', null) ?? '', build).catch(() => false);
      if (!ok) release(b.id, 'notifiedEnding');
    }
  }
}
