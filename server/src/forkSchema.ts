import type Database from 'better-sqlite3';

/**
 * Schema added by this fork, kept in one place: the server applies it at startup
 * (initDatabase) and the tests apply it on their in-memory database, so the two can't drift.
 * Everything here must be idempotent.
 */
const NEW_TABLES: string[] = [
  // Coin ledger: every manual coin change a parent makes, with the amount actually applied
  `CREATE TABLE IF NOT EXISTS coin_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT,
    createdBy INTEGER,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_coin_adjustments_user ON coin_adjustments(userId, createdAt)`,
  // Who can see a reward (no rows = everyone) and per-person prices
  `CREATE TABLE IF NOT EXISTS reward_visibility (
    rewardId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    PRIMARY KEY (rewardId, userId),
    FOREIGN KEY (rewardId) REFERENCES rewards(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS reward_prices (
    rewardId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    costCoins INTEGER NOT NULL,
    PRIMARY KEY (rewardId, userId),
    FOREIGN KEY (rewardId) REFERENCES rewards(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`,
  // Coins chipped into a shared reward's pot; redemptionId is set once the pot became a request
  `CREATE TABLE IF NOT EXISTS reward_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rewardId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    redemptionId INTEGER,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (rewardId) REFERENCES rewards(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reward_contributions_reward ON reward_contributions(rewardId, redemptionId)`,
  // Double coins events: completions in the chosen rooms (NULL = every room) pay multiplier × coins
  // while the boost runs. notifiedStart / notifiedEnding make each notification go out once.
  `CREATE TABLE IF NOT EXISTS coin_boosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    multiplier REAL NOT NULL DEFAULT 2,
    startAt TEXT NOT NULL,
    endAt TEXT NOT NULL,
    roomIds TEXT,
    createdBy INTEGER REFERENCES users(id) ON DELETE SET NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    notifiedStart INTEGER NOT NULL DEFAULT 0,
    notifiedEnding INTEGER NOT NULL DEFAULT 0
  )`,
];

/** Columns added to existing tables (ignored when they already exist). */
const NEW_COLUMNS: string[] = [
  // Per-person views set by a parent: taskView 'all' | 'mine' (starts on Mine) | 'mineOnly' (locked)
  `ALTER TABLE users ADD COLUMN taskView TEXT NOT NULL DEFAULT 'all'`,
  `ALTER TABLE users ADD COLUMN kidMode INTEGER NOT NULL DEFAULT 0`,
  // Optional proof a kid attaches when finishing a chore
  `ALTER TABLE task_completions ADD COLUMN note TEXT`,
  `ALTER TABLE task_completions ADD COLUMN photoUrl TEXT`,
  // Reward rules: an optional limit (count per day/week/month/ever, per person or for everyone),
  // an optional date window (local YYYY-MM-DD, inclusive), weekly rotation and shared saving
  `ALTER TABLE rewards ADD COLUMN limitCount INTEGER`,
  `ALTER TABLE rewards ADD COLUMN limitPeriod TEXT NOT NULL DEFAULT 'ever'`,
  `ALTER TABLE rewards ADD COLUMN limitScope TEXT NOT NULL DEFAULT 'person'`,
  `ALTER TABLE rewards ADD COLUMN availableFrom TEXT`,
  `ALTER TABLE rewards ADD COLUMN availableUntil TEXT`,
  `ALTER TABLE rewards ADD COLUMN isRotating INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE rewards ADD COLUMN isShared INTEGER NOT NULL DEFAULT 0`,
  // Anytime quests: at most repeatLimit completions per person per repeatPeriod ('day' | 'week'); NULL = no limit
  `ALTER TABLE tasks ADD COLUMN repeatLimit INTEGER`,
  `ALTER TABLE tasks ADD COLUMN repeatPeriod TEXT`,
  // A goal that sets up next week's copy of itself when its week ends (see rollOverRepeatingGoals)
  `ALTER TABLE user_goals ADD COLUMN repeatWeekly INTEGER NOT NULL DEFAULT 0`,
  // Scheduling (utils/schedule.ts): a season (months 1–12, may wrap), set weekdays (bitmask, bit 0 =
  // Sunday) instead of the rolling interval, and rotation by calendar week instead of per completion
  `ALTER TABLE tasks ADD COLUMN seasonStartMonth INTEGER`,
  `ALTER TABLE tasks ADD COLUMN seasonEndMonth INTEGER`,
  `ALTER TABLE tasks ADD COLUMN scheduleWeekdays INTEGER`,
  `ALTER TABLE tasks ADD COLUMN rotationPeriod TEXT NOT NULL DEFAULT 'completion'`,
];

/** Fork tables included in backup export/import: key in the backup file -> table. */
export const BACKUP_TABLES: Array<{ key: string; table: string }> = [
  { key: 'coinAdjustments', table: 'coin_adjustments' },
  { key: 'rewardVisibility', table: 'reward_visibility' },
  { key: 'rewardPrices', table: 'reward_prices' },
  { key: 'rewardContributions', table: 'reward_contributions' },
  { key: 'coinBoosts', table: 'coin_boosts' },
];

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
