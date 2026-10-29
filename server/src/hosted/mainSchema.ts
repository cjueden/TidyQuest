import type Database from 'better-sqlite3';

// main.db in hosted mode: which families exist and the few things that live outside a family's own
// database. Like forkSchema.ts: only add tables and columns, never change or drop them.
const MAIN_TABLES: string[] = [
  // status: trial, active, suspended, expired or deleted. code: the family code kids log in with, as shown
  // (sunny-otter-42); codeKey: the same with only letters and digits, which logins look up (NEW-10).
  `CREATE TABLE IF NOT EXISTS families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    codeKey TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'trial',
    plan TEXT,
    trialEndsAt TEXT,
    createdAt TEXT NOT NULL,
    lastActiveAt TEXT,
    deletedAt TEXT
  )`,
  // A parent's email points at their user in the family database; passwords stay there.
  `CREATE TABLE IF NOT EXISTS accounts (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    familyId TEXT NOT NULL REFERENCES families(id),
    userId INTEGER NOT NULL,
    emailConfirmedAt TEXT,
    createdAt TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_accounts_family ON accounts(familyId, userId)`,
  // Links sent by email (kind: confirm, reset or change-email). Only a hash of the token is kept.
  `CREATE TABLE IF NOT EXISTS email_tokens (
    tokenHash TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    familyId TEXT NOT NULL REFERENCES families(id),
    userId INTEGER NOT NULL,
    email TEXT NOT NULL,
    newEmail TEXT,
    expiresAt TEXT NOT NULL,
    usedAt TEXT,
    createdAt TEXT NOT NULL
  )`,
  // Accounts for the operator page (NEW-13), separate from every family.
  `CREATE TABLE IF NOT EXISTS operators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    passwordHash TEXT NOT NULL,
    tokenVersion INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  )`,
  // Login and sign-up throttling that survives restarts (NEW-12). resetAt is in milliseconds.
  `CREATE TABLE IF NOT EXISTS throttle (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    resetAt INTEGER NOT NULL
  )`,
];

const MAIN_COLUMNS: string[] = [
  // When the parents were told an expired trial is about to be deleted (NEW-11)
  `ALTER TABLE families ADD COLUMN trialWarnedAt TEXT`,
];

export function applyMainSchema(instance: InstanceType<typeof Database>): void {
  instance.pragma('foreign_keys = ON');
  for (const sql of MAIN_TABLES) instance.exec(sql);
  for (const sql of MAIN_COLUMNS) {
    try {
      instance.exec(sql);
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) throw e;
    }
  }
}
