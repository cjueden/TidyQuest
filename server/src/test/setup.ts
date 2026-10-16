import Database from 'better-sqlite3';
import supertest from 'supertest';

// Must set JWT_SECRET before any imports that reference it
process.env.JWT_SECRET = 'test-secret-key-for-vitest';
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

import { setDatabase } from '../database';
import { applyForkSchema } from '../forkSchema';
import { createApp } from '../index';

export function createTestApp() {
  // Fresh in-memory DB for each test suite
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  runSchema(db);
  applyForkSchema(db);
  // The Rescue Mission doubles the coins of a long-overdue chore; tests about it turn it on themselves
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('features', ?)").run(JSON.stringify({ rescue: false }));

  // Swap the global singleton so all routes use this DB
  setDatabase(db);

  const app = createApp();
  const agent = supertest(app);

  return { agent, db };
}

function runSchema(db: InstanceType<typeof Database>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      displayName TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'child',
      avatarColor TEXT NOT NULL DEFAULT '#F97316',
      avatarType TEXT NOT NULL DEFAULT 'letter',
      avatarPreset TEXT,
      avatarPhotoUrl TEXT,
      coins INTEGER NOT NULL DEFAULT 0,
      currentStreak INTEGER NOT NULL DEFAULT 0,
      lastActiveDate TEXT,
      isVacationMode INTEGER NOT NULL DEFAULT 0,
      vacationStartDate TEXT,
      vacationEndDate TEXT,
      language TEXT NOT NULL DEFAULT 'en',
      goalCoins INTEGER,
      goalStartAt TEXT,
      goalEndAt TEXT,
      isParticipant INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      roomType TEXT NOT NULL DEFAULT 'other',
      color TEXT NOT NULL DEFAULT '#FFE4CC',
      accentColor TEXT NOT NULL DEFAULT '#F97316',
      photoUrl TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      assignedUserId INTEGER REFERENCES users(id) ON DELETE SET NULL,
      zoneId INTEGER REFERENCES zones(id) ON DELETE SET NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roomId INTEGER NOT NULL,
      name TEXT NOT NULL,
      notes TEXT,
      frequencyDays REAL NOT NULL DEFAULT 7,
      effort INTEGER NOT NULL DEFAULT 1,
      isSeasonal INTEGER NOT NULL DEFAULT 0,
      lastCompletedAt TEXT,
      translationKey TEXT,
      iconKey TEXT,
      assignedToChildren INTEGER NOT NULL DEFAULT 0,
      assignedUserId INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assignmentMode TEXT NOT NULL DEFAULT 'first',
      onDemand INTEGER NOT NULL DEFAULT 0,
      showInDashboard INTEGER NOT NULL DEFAULT 0,
      customCoins INTEGER,
      allowEarlyCompletion INTEGER NOT NULL DEFAULT 0,
      rotationCurrentUserId INTEGER REFERENCES users(id) ON DELETE SET NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      completedAt TEXT NOT NULL DEFAULT (datetime('now')),
      coinsEarned INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'approved',
      approvedByUserId INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approvedAt TEXT,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_due_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId INTEGER NOT NULL,
      dueDate TEXT NOT NULL,
      sentAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(taskId, dueDate),
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_achievement_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      achievementId TEXT NOT NULL,
      sentAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(userId, achievementId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      title TEXT NOT NULL,
      goalCoins INTEGER NOT NULL,
      startAt TEXT,
      endAt TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      completedAt TEXT,
      rewardCoins INTEGER NOT NULL DEFAULT 0,
      createdBy INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      costCoins INTEGER NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      isPreset INTEGER NOT NULL DEFAULT 0,
      createdBy INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS reward_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rewardId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      costCoins INTEGER NOT NULL,
      redeemedAt TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'requested',
      FOREIGN KEY (rewardId) REFERENCES rewards(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_assignees (
      taskId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      coinPercentage INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (taskId, userId),
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_roomId ON tasks(roomId);
    CREATE INDEX IF NOT EXISTS idx_task_completions_userId ON task_completions(userId);
    CREATE INDEX IF NOT EXISTS idx_task_completions_taskId ON task_completions(taskId);
    CREATE INDEX IF NOT EXISTS idx_task_completions_completedAt ON task_completions(completedAt);
    CREATE INDEX IF NOT EXISTS idx_task_completions_status ON task_completions(status);
    CREATE INDEX IF NOT EXISTS idx_reward_redemptions_userId ON reward_redemptions(userId);
    CREATE INDEX IF NOT EXISTS idx_reward_redemptions_status ON reward_redemptions(status);
  `);

  // Default settings
  const defaults: [string, string][] = [
    ['coinsByEffort', JSON.stringify({ 1: 5, 2: 10, 3: 15, 4: 20, 5: 25 })],
    ['gamificationEnabled', '1'],
    ['vacationMode', '0'],
    ['vacationStartDate', ''],
    ['vacationEndDate', ''],
    ['strictMode', '0'],
    ['registrationEnabled', '1'],
    ['telegramEnabled', '0'],
    ['telegramBotToken', ''],
    ['telegramChatId', ''],
    ['telegramNotificationTime', '09:00'],
    ['telegramNotificationTypes', JSON.stringify({ taskDue: true, rewardRequest: true, achievementUnlocked: true })],
    ['ntfyEnabled', '0'],
    ['ntfyServerUrl', 'https://ntfy.sh'],
    ['ntfyTopic', ''],
    ['ntfyToken', ''],
  ];
  const insertSetting = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)');
  for (const [key, value] of defaults) {
    insertSetting.run(key, value);
  }
}

/** Register the first user (becomes admin automatically) */
export async function createAdmin(
  agent: supertest.Agent,
  username = 'admin',
  password = 'admin123',
  displayName = 'Admin'
) {
  const res = await agent
    .post('/api/auth/register')
    .send({ username, password, displayName });
  return { user: res.body.user, token: res.body.token };
}

/** Create a user via admin API and return their login token */
export async function createUser(
  agent: supertest.Agent,
  adminToken: string,
  opts: { username: string; displayName: string; password: string; role?: string }
) {
  // Create via admin endpoint — pass role directly (POST /api/users supports it)
  const res = await agent
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      username: opts.username,
      displayName: opts.displayName,
      password: opts.password,
      role: opts.role || 'child',
    });

  const user = res.body;

  // Login to get token
  const loginRes = await agent
    .post('/api/auth/login')
    .send({ username: opts.username, password: opts.password });

  return { user: loginRes.body.user, token: loginRes.body.token };
}

export async function loginAs(
  agent: supertest.Agent,
  username: string,
  password: string
) {
  const res = await agent
    .post('/api/auth/login')
    .send({ username, password });
  return res.body.token as string;
}
