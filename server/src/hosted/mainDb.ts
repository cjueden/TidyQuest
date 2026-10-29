import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { applyMainSchema } from './mainSchema';

let dir = path.join(__dirname, '..', '..', '..', 'data');

/** The data folder: main.db, families/ and deleted/ in hosted mode. */
export function dataDir(): string {
  return dir;
}

/** Tests keep their families in a temporary folder. */
export function setDataDir(folder: string): void {
  dir = folder;
}

let main: InstanceType<typeof Database> | null = null;

export function openMainDb(): InstanceType<typeof Database> {
  fs.mkdirSync(dir, { recursive: true });
  const instance = new Database(path.join(dir, 'main.db'));
  instance.pragma('journal_mode = WAL');
  setMainDb(instance);
  return instance;
}

/** Tests use an in-memory main.db. */
export function setMainDb(instance: InstanceType<typeof Database>): void {
  applyMainSchema(instance);
  main = instance;
}

export function mainDb(): InstanceType<typeof Database> {
  if (!main) throw new Error('main.db is not open (hosted mode)');
  return main;
}
