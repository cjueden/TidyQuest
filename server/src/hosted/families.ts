import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { createDatabase, initDatabase } from '../database';
import { registerClockFunctions } from '../utils/clock';
import { FamilyContext, runInFamily } from './context';
import { newFamilyCode } from './familyCode';
import { dataDir, mainDb, openMainDb } from './mainDb';

type Db = InstanceType<typeof Database>;

/** Family ids are random (16 letters and digits), so they don't show how many families there are. */
export const FAMILY_ID = /^[a-z0-9]{16}$/;
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const TRIAL_DAYS = 30;
/** A deleted family's folder is kept this long, then removed. */
export const KEEP_DELETED_DAYS = 30;

export function newFamilyId(): string {
  let id = '';
  for (let i = 0; i < 16; i++) id += ID_CHARS[crypto.randomInt(ID_CHARS.length)];
  return id;
}

/** data/families/<familyId>/ holds tidyquest.db, avatars/ and proofs/. */
export const familyDir = (id: string) => path.join(dataDir(), 'families', id);
const deletedDir = () => path.join(dataDir(), 'deleted');

// Open family databases. One nobody has used for an hour is closed, so the number open follows the
// families active right now.
const open = new Map<string, { db: Db; lastUsed: number; lastActiveSaved: number }>();

/** Makes a family: its folder, its database, its row in main.db and its family code. Tests pass an in-memory database. */
export function createFamily(name: string, opts: { db?: Db; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  let id = newFamilyId();
  while (fs.existsSync(familyDir(id)) || mainDb().prepare('SELECT 1 FROM families WHERE id = ?').get(id)) id = newFamilyId();
  fs.mkdirSync(path.join(familyDir(id), 'avatars'), { recursive: true });
  fs.mkdirSync(path.join(familyDir(id), 'proofs'), { recursive: true });
  const db = opts.db ?? createDatabase(path.join(familyDir(id), 'tidyquest.db'));
  if (opts.db) registerClockFunctions(db);
  else runInFamily({ familyId: id, db }, () => initDatabase());
  open.set(id, { db, lastUsed: now.getTime(), lastActiveSaved: now.getTime() });
  mainDb().prepare('INSERT INTO families (id, name, status, trialEndsAt, createdAt, lastActiveAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, 'trial', new Date(now.getTime() + TRIAL_DAYS * DAY).toISOString(), now.toISOString(), now.toISOString());
  newFamilyCode(id);
  return id;
}

/** Whether this is a family that exists and isn't deleted. */
export function isLiveFamily(id: unknown): id is string {
  if (typeof id !== 'string' || !FAMILY_ID.test(id)) return false;
  return !!mainDb().prepare('SELECT 1 FROM families WHERE id = ? AND deletedAt IS NULL').get(id);
}

/**
 * The family's database, opened on first use (which also upgrades its schema). Null for an unknown or
 * deleted family. main.db is asked every time, so a deleted family is shut out at once.
 */
export function openFamily(id: unknown, now = Date.now()): FamilyContext | null {
  if (!isLiveFamily(id)) return null;
  let entry = open.get(id);
  if (!entry) {
    const file = path.join(familyDir(id), 'tidyquest.db');
    if (!fs.existsSync(file)) return null;
    const db = createDatabase(file);
    try {
      runInFamily({ familyId: id, db }, () => initDatabase());
    } catch (err) {
      db.close();
      throw err;
    }
    entry = { db, lastUsed: now, lastActiveSaved: 0 };
    open.set(id, entry);
  }
  entry.lastUsed = now;
  if (now - entry.lastActiveSaved >= HOUR) {
    entry.lastActiveSaved = now;
    mainDb().prepare('UPDATE families SET lastActiveAt = ? WHERE id = ?').run(new Date(now).toISOString(), id);
  }
  return { familyId: id, db: entry.db };
}

function closeFamily(id: string): void {
  const entry = open.get(id);
  if (!entry) return;
  open.delete(id);
  if (entry.db.open) entry.db.close();
}

/** Closes the family databases nobody has used for an hour. Returns how many it closed. */
export function closeIdleFamilies(now = Date.now()): number {
  let closed = 0;
  for (const [id, entry] of open) {
    if (now - entry.lastUsed >= HOUR) {
      closeFamily(id);
      closed++;
    }
  }
  return closed;
}

/** Closes every open family database (a fresh test server starts with none). */
export function closeAllFamilies(): void {
  for (const id of [...open.keys()]) closeFamily(id);
}

/**
 * Deletes a family: its folder moves to data/deleted/<familyId>-<date>/ (kept 30 days), and its emails
 * and family code are freed for a new sign-up.
 */
export function deleteFamily(id: string, now = new Date()): boolean {
  if (!isLiveFamily(id)) return false;
  closeFamily(id);
  if (fs.existsSync(familyDir(id))) {
    fs.mkdirSync(deletedDir(), { recursive: true });
    fs.renameSync(familyDir(id), path.join(deletedDir(), `${id}-${now.toISOString().slice(0, 10)}`));
  }
  const main = mainDb();
  main.transaction(() => {
    main.prepare('DELETE FROM email_tokens WHERE familyId = ?').run(id);
    main.prepare('DELETE FROM accounts WHERE familyId = ?').run(id);
    main.prepare("UPDATE families SET status = 'deleted', code = NULL, codeKey = NULL, deletedAt = ? WHERE id = ?").run(now.toISOString(), id);
  })();
  return true;
}

/** Removes the folders of families deleted more than 30 days ago (a daily job from NEW-11). */
export function purgeDeletedFamilies(now = new Date()): number {
  const main = mainDb();
  const cutoff = new Date(now.getTime() - KEEP_DELETED_DAYS * DAY).toISOString();
  const gone = main.prepare('SELECT id FROM families WHERE deletedAt IS NOT NULL AND deletedAt <= ?').all(cutoff) as { id: string }[];
  const folders = fs.existsSync(deletedDir()) ? fs.readdirSync(deletedDir()) : [];
  for (const { id } of gone) {
    for (const name of folders) {
      if (name.startsWith(`${id}-`)) fs.rmSync(path.join(deletedDir(), name), { recursive: true, force: true });
    }
    main.prepare('DELETE FROM families WHERE id = ?').run(id);
  }
  return gone.length;
}

/** Server start in hosted mode: open main.db and close idle family databases every few minutes. */
export function startHosted(): void {
  openMainDb();
  if (!process.env.PUBLIC_URL) console.warn('[hosted] Set PUBLIC_URL (like https://app.tidyquest.org): links in emails follow the request until then.');
  setInterval(() => closeIdleFamilies(), 5 * 60 * 1000).unref();
}
