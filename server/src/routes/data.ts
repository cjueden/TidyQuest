import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { BACKUP_TABLES } from '../forkSchema';

const router = Router();
router.use(authMiddleware);

/**
 * Tables in a backup, parents before children. The key is the property name in the backup file
 * (kept from older versions so their files still import).
 */
const TABLES: Array<{ key: string; table: string }> = [
  { key: 'users', table: 'users' },
  { key: 'zones', table: 'zones' },
  { key: 'rooms', table: 'rooms' },
  { key: 'tasks', table: 'tasks' },
  { key: 'taskAssignees', table: 'task_assignees' },
  { key: 'completions', table: 'task_completions' },
  { key: 'goals', table: 'user_goals' },
  { key: 'rewards', table: 'rewards' },
  { key: 'rewardRedemptions', table: 'reward_redemptions' },
  ...BACKUP_TABLES,
];

interface ColumnInfo { name: string; notnull: number; dflt_value: unknown }

function columnsOf(table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

/**
 * Insert backup rows using whatever columns the table has today, so no column is silently
 * dropped. Keys the table doesn't know are ignored; missing or null values fall back to the
 * column default.
 */
function insertRows(table: string, rows: any[], skip: string[] = []) {
  const cols = columnsOf(table).filter((c) => !skip.includes(c.name));
  // Optional links to rows the backup doesn't contain (e.g. a room's zone, when an older backup has
  // no zones) are cleared instead of failing the whole import on a foreign key.
  const optionalLinks = (db.prepare(`PRAGMA foreign_key_list(${table})`).all() as { table: string; from: string; to: string | null }[])
    .filter((fk) => !cols.find((c) => c.name === fk.from)?.notnull);
  for (const original of rows) {
    const row = { ...original };
    for (const fk of optionalLinks) {
      if (row[fk.from] == null) continue;
      const exists = db.prepare(`SELECT 1 FROM ${fk.table} WHERE ${fk.to ?? 'id'} = ?`).get(row[fk.from]);
      if (!exists) row[fk.from] = null;
    }
    const present = cols.filter((c) => row[c.name] !== undefined && !(row[c.name] === null && c.notnull && c.dflt_value !== null));
    if (present.length === 0) continue;
    const values = present.map((c) => (typeof row[c.name] === 'boolean' ? (row[c.name] ? 1 : 0) : row[c.name]));
    db.prepare(`INSERT INTO ${table} (${present.map((c) => c.name).join(', ')}) VALUES (${present.map(() => '?').join(', ')})`).run(...values);
  }
}

// Export all data as JSON
router.get('/export', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const out: Record<string, unknown> = { version: 7, exportedAt: new Date().toISOString() };
  for (const { key, table } of TABLES) {
    out[key] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  // Password hashes never leave the server, nor login token versions (a restore must not bring back
  // logins that were cut off)
  out.users = (out.users as any[]).map(({ passwordHash: _omit, tokenVersion: _v, ...u }) => u);
  out.settings = db.prepare('SELECT * FROM app_settings').all();

  res.setHeader('Content-Disposition', 'attachment; filename=tidyquest-backup.json');
  res.json(out);
});

// Import data from JSON (replaces everything)
router.post('/import', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const body = req.body || {};
  const { users, rooms, tasks, completions, settings, taskAssignees } = body;

  if (!Array.isArray(users) || !Array.isArray(rooms) || !Array.isArray(tasks) || !Array.isArray(completions)) {
    return res.status(400).json({ error: 'Invalid backup format. Expected arrays: users, rooms, tasks, completions' });
  }

  // Password hashes are never accepted from a file. The importing admin keeps theirs, and anyone
  // who already has an account here (same username) keeps their current password; new people get
  // a random one and need a reset.
  const currentAdmin = db.prepare('SELECT id, username, passwordHash FROM users WHERE id = ?').get(req.userId) as { id: number; username: string; passwordHash: string } | undefined;
  const existing = db.prepare('SELECT username, passwordHash, tokenVersion FROM users').all() as { username: string; passwordHash: string; tokenVersion: number }[];
  const existingHashes = new Map(existing.map((u) => [u.username.toLowerCase(), u.passwordHash]));
  // Logins stay as they are: anyone already here keeps their token version (NEW-8)
  const existingVersions = new Map(existing.map((u) => [u.username.toLowerCase(), u.tokenVersion]));

  const importData = db.transaction(() => {
    // Clear existing data, children first. Zones are only replaced when the backup has them.
    for (const { key, table } of [...TABLES].reverse()) {
      if (table === 'zones' && !Array.isArray(body.zones)) continue;
      if (BACKUP_TABLES.some((t) => t.table === table) && !Array.isArray(body[key])) continue;
      db.prepare(`DELETE FROM ${table}`).run();
    }

    const usersWithHashes = users.map((u: any) => {
      const isCurrentAdmin = currentAdmin && (u.id === currentAdmin.id || u.username === currentAdmin.username);
      const passwordHash = isCurrentAdmin
        ? currentAdmin!.passwordHash
        : existingHashes.get(String(u.username).toLowerCase())
          ?? bcrypt.hashSync(require('crypto').randomBytes(32).toString('hex'), 10);
      const { passwordHash: _ignored, tokenVersion: _v, ...rest } = u;
      return { ...rest, passwordHash, tokenVersion: existingVersions.get(String(u.username).toLowerCase()) ?? 0 };
    });
    insertRows('users', usersWithHashes);

    if (Array.isArray(body.zones)) insertRows('zones', body.zones);
    insertRows('rooms', rooms);
    insertRows('tasks', tasks);

    if (Array.isArray(taskAssignees)) {
      insertRows('task_assignees', taskAssignees);
    } else {
      // Backward compatibility for older backups without task_assignees array
      for (const t of tasks) {
        if (t.assignedUserId != null) {
          db.prepare('INSERT OR IGNORE INTO task_assignees (taskId, userId, coinPercentage) VALUES (?, ?, 0)')
            .run(t.id, t.assignedUserId);
        }
      }
    }

    insertRows('task_completions', completions.map((c: any) => ({ ...c, status: c.status || 'approved' })));

    if (Array.isArray(settings)) {
      db.prepare('DELETE FROM app_settings').run();
      for (const s of settings) {
        db.prepare('INSERT INTO app_settings (key, value, updatedAt) VALUES (?, ?, COALESCE(?, datetime(\'now\')))').run(s.key, s.value, s.updatedAt);
      }
    }

    for (const { key, table } of TABLES) {
      if (['users', 'zones', 'rooms', 'tasks', 'task_assignees', 'task_completions'].includes(table)) continue;
      if (Array.isArray(body[key])) insertRows(table, body[key]);
    }
  });

  importData();
  res.json({ success: true, imported: { users: users.length, rooms: rooms.length, tasks: tasks.length, completions: completions.length } });
});

export default router;
