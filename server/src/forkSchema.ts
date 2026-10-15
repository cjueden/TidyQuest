import type Database from 'better-sqlite3';

/**
 * Schema added by this fork, kept in one place: the server applies it at startup
 * (initDatabase) and the tests apply it on their in-memory database, so the two can't drift.
 * Everything here must be idempotent.
 */
const NEW_TABLES: string[] = [];

/** Columns added to existing tables (ignored when they already exist). */
const NEW_COLUMNS: string[] = [
  // Per-person views set by a parent: taskView 'all' | 'mine' (starts on Mine) | 'mineOnly' (locked)
  `ALTER TABLE users ADD COLUMN taskView TEXT NOT NULL DEFAULT 'all'`,
  `ALTER TABLE users ADD COLUMN kidMode INTEGER NOT NULL DEFAULT 0`,
  // Optional proof a kid attaches when finishing a chore
  `ALTER TABLE task_completions ADD COLUMN note TEXT`,
  `ALTER TABLE task_completions ADD COLUMN photoUrl TEXT`,
];

/** Fork tables included in backup export/import: key in the backup file -> table. */
export const BACKUP_TABLES: Array<{ key: string; table: string }> = [];

export function applyForkSchema(instance: InstanceType<typeof Database>) {
  for (const sql of NEW_TABLES) instance.exec(sql);
  for (const sql of NEW_COLUMNS) {
    try {
      instance.exec(sql);
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) throw e;
    }
  }
}
