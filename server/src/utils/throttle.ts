import { isHosted } from '../hosted/context';
import { mainDb } from '../hosted/mainDb';

// Limits on logins, sign-ups and emails, counted per key (an address, a login name, or a purpose and one
// of those) over 15 minutes. Self-hosted they're kept in memory and reset on restart. Hosted mode keeps
// them in main.db's throttle table, so they hold across restarts and deploys (NEW-12).
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_MAX = 20; // registrations, and failed logins, per address

interface Entry { count: number; resetAt: number }
interface Store {
  get(key: string): Entry | undefined;
  set(key: string, entry: Entry): void;
  delete(key: string): void;
  purge(now: number): void;
  clear(): void;
}

function memoryStore(): Store {
  const map = new Map<string, Entry>();
  return {
    get: (key) => map.get(key),
    set: (key, entry) => { map.set(key, entry); },
    delete: (key) => { map.delete(key); },
    purge: (now) => { for (const [key, entry] of map) if (entry.resetAt < now) map.delete(key); },
    clear: () => map.clear(),
  };
}

// One table for both kinds; a prefix keeps tries and failures apart
function mainDbStore(prefix: string): Store {
  return {
    get: (key) => mainDb().prepare('SELECT count, resetAt FROM throttle WHERE key = ?').get(prefix + key) as Entry | undefined,
    set: (key, { count, resetAt }) => {
      mainDb().prepare('INSERT INTO throttle (key, count, resetAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET count = excluded.count, resetAt = excluded.resetAt')
        .run(prefix + key, count, resetAt);
    },
    delete: (key) => { mainDb().prepare('DELETE FROM throttle WHERE key = ?').run(prefix + key); },
    purge: (now) => { mainDb().prepare('DELETE FROM throttle WHERE key LIKE ? AND resetAt < ?').run(`${prefix}%`, now); },
    clear: () => { mainDb().prepare('DELETE FROM throttle WHERE key LIKE ?').run(`${prefix}%`); },
  };
}

const memory = { tries: memoryStore(), failures: memoryStore() };
const hosted = { tries: mainDbStore('try:'), failures: mainDbStore('fail:') };
const stores = () => (isHosted() ? hosted : memory);
// Keys hold what people type (emails, usernames): a long one is cut, not stored whole
const keyOf = (key: string) => key.slice(0, 200);

/** Counts one try for this key; false once it's had `max` in 15 minutes. */
export function checkRateLimit(key: string, max = RATE_LIMIT_MAX): boolean {
  const { tries } = stores();
  const now = Date.now();
  const entry = tries.get(keyOf(key));
  if (!entry || entry.resetAt < now) {
    tries.set(keyOf(key), { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= max) return false;
  tries.set(keyOf(key), { count: entry.count + 1, resetAt: entry.resetAt });
  return true;
}

/** Failed logins for this key in the last 15 minutes. */
export function failuresOf(key: string): number {
  const entry = stores().failures.get(keyOf(key));
  return entry && entry.resetAt >= Date.now() ? entry.count : 0;
}

export function addFailure(key: string): void {
  const { failures } = stores();
  const now = Date.now();
  const entry = failures.get(keyOf(key));
  if (!entry || entry.resetAt < now) failures.set(keyOf(key), { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  else failures.set(keyOf(key), { count: entry.count + 1, resetAt: entry.resetAt });
}

/** A successful login clears that name's failures. */
export function clearFailures(key: string): void {
  stores().failures.delete(keyOf(key));
}

/** Tests start each app with clean limits. */
export function resetLoginLimits(): void {
  memory.tries.clear();
  memory.failures.clear();
  if (isHosted()) {
    hosted.tries.clear();
    hosted.failures.clear();
  }
}

// Expired entries are removed now and then, so neither the map nor the table keeps growing
setInterval(() => {
  const now = Date.now();
  for (const store of [memory.tries, memory.failures]) store.purge(now);
  if (!isHosted()) return;
  try {
    hosted.tries.purge(now);
    hosted.failures.purge(now);
  } catch { /* main.db not open yet */ }
}, RATE_LIMIT_WINDOW_MS).unref();
