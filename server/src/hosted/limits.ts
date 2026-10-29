import db from '../database';
import { isHosted } from './context';
import { filesBytes } from './files';

// Hosted mode's limits and outside addresses (HOSTED.md §8). Self-hosters keep what they have: any
// number of people, 50 MB imports, 8 MB proof photos, any ntfy server and Home Assistant.

const MB = 1024 * 1024;

const fromEnv = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** The limits, from environment settings (the starting values are the defaults). */
export const limits = () => ({
  people: fromEnv('MAX_PEOPLE', 15),
  importMb: fromEnv('MAX_IMPORT_MB', 5),
  photoMb: fromEnv('MAX_PHOTO_MB', 5),
  filesMb: fromEnv('MAX_FILES_MB', 200),
});

/** Hosted mode: the answer when a family would have more people than allowed; null when it's fine. */
export function tooManyPeople(total: number): { error: string; code: string; limit: number } | null {
  const max = limits().people;
  if (!isHosted() || total <= max) return null;
  return { error: `A family can have up to ${max} people`, code: 'people-limit', limit: max };
}

/** Hosted mode: whether the family's avatars and photos now take more space than allowed. */
export function overFilesLimit(familyId?: string): boolean {
  return isHosted() && !!familyId && filesBytes(familyId) > limits().filesMb * MB;
}

export const filesFullError = () => ({ error: "Your family's space for photos is full", code: 'storage-full', limit: limits().filesMb });

/**
 * The ntfy servers this server sends to. Hosted mode only uses ntfy.sh: an address someone types could be
 * a machine inside the hosting network.
 */
export function ntfyServerAllowed(url: string): boolean {
  if (!isHosted()) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'ntfy.sh' && !u.port && !u.username && !u.password;
  } catch {
    return false;
  }
}

export const NTFY_ONLY_ERROR = { error: 'Only ntfy.sh can be used on this server', code: 'ntfy-sh-only' };

/**
 * Hosted mode, after an import: drops the notification addresses this server won't send to. Topics on a
 * custom ntfy server go too, so a family's messages never land in a public ntfy.sh topic of that name.
 */
export function dropRefusedAddresses(): void {
  if (!isHosted()) return;
  db.prepare("UPDATE app_settings SET value = '' WHERE key IN ('haUrl', 'haToken', 'haFamilyService')").run();
  db.prepare('UPDATE users SET haNotifyService = NULL').run();
  const server = (db.prepare("SELECT value FROM app_settings WHERE key = 'ntfyServerUrl'").get() as { value: string } | undefined)?.value;
  if (server && !ntfyServerAllowed(server)) {
    db.prepare("UPDATE app_settings SET value = 'https://ntfy.sh' WHERE key = 'ntfyServerUrl'").run();
    db.prepare("UPDATE app_settings SET value = '' WHERE key IN ('ntfyTopic', 'ntfyToken')").run();
    db.prepare("UPDATE app_settings SET value = '0' WHERE key = 'ntfyEnabled'").run();
    db.prepare('UPDATE users SET ntfyTopic = NULL').run();
  }
}
