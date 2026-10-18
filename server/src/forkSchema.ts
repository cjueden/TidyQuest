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
  // Deleted tasks and rewards, kept for 30 days so they can be restored. snapshot is JSON: for a task
  // { task, assignees, completions }, for a reward { reward, redemptions, visibility, prices, contributions }.
  `CREATE TABLE IF NOT EXISTS trash (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    itemId INTEGER NOT NULL,
    title TEXT NOT NULL,
    roomId INTEGER,
    roomName TEXT,
    snapshot TEXT NOT NULL,
    deletedBy INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deletedAt TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // Badges parents make (utils/badges.ts). metric: what counts; taskIds (JSON array) or roomId when the
  // metric needs them; userIds (JSON array, NULL = everyone who does chores); bonusCoins paid once when earned.
  // Earned ones are recorded in user_achievement_notifications as 'custom_<id>'.
  `CREATE TABLE IF NOT EXISTS custom_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    icon TEXT NOT NULL DEFAULT '🏅',
    metric TEXT NOT NULL,
    taskIds TEXT,
    roomId INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    threshold INTEGER NOT NULL DEFAULT 1,
    bonusCoins INTEGER NOT NULL DEFAULT 0,
    userIds TEXT,
    secret INTEGER NOT NULL DEFAULT 0,
    createdBy INTEGER REFERENCES users(id) ON DELETE SET NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // Every notification sent (or tried): Settings → Notification log; dedupeKey stops repeats
  `CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sentAt TEXT NOT NULL,
    userId INTEGER REFERENCES users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    ok INTEGER NOT NULL,
    error TEXT,
    dedupeKey TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notification_log_dedupe ON notification_log(dedupeKey, userId)`,
  // Messages waiting for quiet hours or school hours to end (userId NULL = family channel)
  `CREATE TABLE IF NOT EXISTS notification_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    notBefore TEXT NOT NULL,
    dedupeKey TEXT
  )`,
  // Home: tasks a person pinned to "Your usual", and chores they snoozed in "Maybe you forgot"
  `CREATE TABLE IF NOT EXISTS task_pins (
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    taskId INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (userId, taskId)
  )`,
  `CREATE TABLE IF NOT EXISTS task_snoozes (
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    taskId INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    until TEXT NOT NULL,
    PRIMARY KEY (userId, taskId)
  )`,
  // The Rescue Mission of each day (utils/rescue.ts): the chore, its multiplier, who claimed it
  `CREATE TABLE IF NOT EXISTS rescue_missions (
    day TEXT PRIMARY KEY,
    taskId INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    multiplier REAL NOT NULL DEFAULT 2,
    completedBy INTEGER REFERENCES users(id) ON DELETE SET NULL,
    completionId INTEGER,
    skipped INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // Cheers on someone's finished chore: one per person per completion (👏 🎉 💪 ⭐)
  `CREATE TABLE IF NOT EXISTS cheers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    completionId INTEGER NOT NULL REFERENCES task_completions(id) ON DELETE CASCADE,
    fromUserId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (completionId, fromUserId)
  )`,
  // Team-ups: doing one chore together today (utils/teamups.ts). status 'open' | 'done' | 'cancelled'
  `CREATE TABLE IF NOT EXISTS teamups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    createdBy INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitedUserId INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open',
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  // Accessories bought for the house mascot (the outfit itself is app_settings 'mascotOutfit')
  `CREATE TABLE IF NOT EXISTS mascot_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    itemId TEXT NOT NULL,
    price INTEGER NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE TABLE IF NOT EXISTS teamup_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teamupId INTEGER NOT NULL REFERENCES teamups(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joinedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (teamupId, userId)
  )`,
  // Someone said no to an "anyone" team-up invite: it no longer shows for them (utils/teamups.ts)
  `CREATE TABLE IF NOT EXISTS teamup_declines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teamupId INTEGER NOT NULL REFERENCES teamups(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (teamupId, userId)
  )`,
];

/** Columns added to existing tables (ignored when they already exist). */
const NEW_COLUMNS: string[] = [
  // One-time chores ("Fix the screen door"): done once, then archived (archivedAt set; kept for history).
  // doBy is an optional local date 'YYYY-MM-DD'.
  `ALTER TABLE tasks ADD COLUMN oneTime INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tasks ADD COLUMN doBy TEXT`,
  `ALTER TABLE tasks ADD COLUMN archivedAt TEXT`,
  // Each person's color theme (NULL = the device's choice)
  `ALTER TABLE users ADD COLUMN theme TEXT`,
  // Birthday as 'MM-DD' (for the secret Birthday Helper badge)
  // Personal notification channels and which kinds this person wants (JSON {kind: false} to turn off)
  `ALTER TABLE users ADD COLUMN ntfyTopic TEXT`,
  `ALTER TABLE users ADD COLUMN telegramChatId TEXT`,
  `ALTER TABLE users ADD COLUMN haNotifyService TEXT`,
  `ALTER TABLE users ADD COLUMN notifyPrefs TEXT`,
  // A reminder for a task at a set time ('HH:MM') on its due day, or the evening before
  `ALTER TABLE tasks ADD COLUMN reminderTime TEXT`,
  `ALTER TABLE tasks ADD COLUMN reminderDayBefore INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN birthday TEXT`,
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
  // Reward categories (free text) and the parents' manual order ("Featured"; 0 = not placed yet)
  `ALTER TABLE rewards ADD COLUMN category TEXT`,
  `ALTER TABLE rewards ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0`,
  // Seasonal styling: 0 = keep your own theme's colors during holidays (decorations still show)
  `ALTER TABLE users ADD COLUMN holidayColors INTEGER NOT NULL DEFAULT 1`,
  // Double coins events can also name chores (JSON array of task ids), on top of their rooms
  `ALTER TABLE coin_boosts ADD COLUMN taskIds TEXT`,
  // A parent's note when approving a chore ("Great job!")
  `ALTER TABLE task_completions ADD COLUMN approvalNote TEXT`,
  // Unlockables picked by each person: an avatar frame, a celebration style, a title ('level' or 'badge:<id>')
  `ALTER TABLE users ADD COLUMN avatarFrame TEXT`,
  `ALTER TABLE users ADD COLUMN celebration TEXT`,
  `ALTER TABLE users ADD COLUMN title TEXT`,
  // A completion done as a team (each member gets one, all with the same teamupId)
  `ALTER TABLE task_completions ADD COLUMN teamupId INTEGER`,
  // Deleting a chore or room hides it (deletedAt set) but keeps the row, so its completions keep their
  // name in Activity, the Board, goals and badges. Lists filter deletedAt IS NULL next to archivedAt.
  `ALTER TABLE tasks ADD COLUMN deletedAt TEXT`,
  `ALTER TABLE rooms ADD COLUMN deletedAt TEXT`,
];

/** Fork tables included in backup export/import: key in the backup file -> table. */
export const BACKUP_TABLES: Array<{ key: string; table: string }> = [
  { key: 'coinAdjustments', table: 'coin_adjustments' },
  { key: 'rewardVisibility', table: 'reward_visibility' },
  { key: 'rewardPrices', table: 'reward_prices' },
  { key: 'rewardContributions', table: 'reward_contributions' },
  { key: 'coinBoosts', table: 'coin_boosts' },
  { key: 'trash', table: 'trash' },
  { key: 'customBadges', table: 'custom_badges' },
  { key: 'taskPins', table: 'task_pins' },
  { key: 'cheers', table: 'cheers' },
  { key: 'teamups', table: 'teamups' },
  { key: 'teamupMembers', table: 'teamup_members' },
  { key: 'teamupDeclines', table: 'teamup_declines' },
  { key: 'mascotPurchases', table: 'mascot_purchases' },
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
