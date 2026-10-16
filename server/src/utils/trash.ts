import db from '../database';

/**
 * Trash for deleted tasks and rewards. Deleting copies the row and everything hanging off it into a
 * JSON snapshot, so a restore brings back the same history. Coins are never touched: deleting doesn't
 * change anyone's balance, and restoring puts the completions back exactly as they were.
 */

export const TRASH_DAYS = 30;

export type TrashKind = 'task' | 'reward';

interface ColumnInfo { name: string; notnull: number; dflt_value: unknown; pk: number }

/** Items older than TRASH_DAYS are removed for good (runs whenever the trash is used). */
export function purgeOldTrash() {
  db.prepare(`DELETE FROM trash WHERE deletedAt < datetime('now', ?)`).run(`-${TRASH_DAYS} days`);
}

/** Copy a task (with its assignees and completion history) into the trash, then delete it. */
export function trashTask(taskId: number, deletedBy: number | undefined): number | null {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
  if (!task) return null;
  const room = db.prepare('SELECT name FROM rooms WHERE id = ?').get(task.roomId) as { name: string } | undefined;
  const snapshot = {
    task,
    assignees: db.prepare('SELECT * FROM task_assignees WHERE taskId = ?').all(taskId),
    completions: db.prepare('SELECT * FROM task_completions WHERE taskId = ?').all(taskId),
  };
  return db.transaction(() => {
    purgeOldTrash();
    const id = Number(db.prepare(
      'INSERT INTO trash (kind, itemId, title, roomId, roomName, snapshot, deletedBy) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('task', taskId, task.name, task.roomId, room?.name ?? null, JSON.stringify(snapshot), deletedBy ?? null).lastInsertRowid);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    return id;
  })();
}

/**
 * Copy a reward (with its redemptions, who can see it, per-person prices and the pot contributions
 * that were spent) into the trash, then delete it. An open shared pot must be refunded first.
 */
export function trashReward(rewardId: number, deletedBy: number | undefined): number | null {
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId) as any;
  if (!reward) return null;
  const snapshot = {
    reward,
    redemptions: db.prepare('SELECT * FROM reward_redemptions WHERE rewardId = ?').all(rewardId),
    visibility: db.prepare('SELECT * FROM reward_visibility WHERE rewardId = ?').all(rewardId),
    prices: db.prepare('SELECT * FROM reward_prices WHERE rewardId = ?').all(rewardId),
    contributions: db.prepare('SELECT * FROM reward_contributions WHERE rewardId = ?').all(rewardId),
  };
  return db.transaction(() => {
    purgeOldTrash();
    const id = Number(db.prepare(
      'INSERT INTO trash (kind, itemId, title, snapshot, deletedBy) VALUES (?, ?, ?, ?, ?)'
    ).run('reward', rewardId, reward.title, JSON.stringify(snapshot), deletedBy ?? null).lastInsertRowid);
    db.prepare('DELETE FROM rewards WHERE id = ?').run(rewardId);
    return id;
  })();
}

/**
 * Insert a row from a snapshot using the columns the table has today. The original id is kept when
 * it's still free (links such as Home Assistant entities keep working); otherwise a new one is given.
 * Optional links to rows that are gone (e.g. a deleted person) are cleared. Returns the row's id.
 */
function insertSnapshotRow(table: string, original: Record<string, unknown>): number {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
  const row: Record<string, unknown> = { ...original };
  if (row.id != null && db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(row.id)) delete row.id;
  const links = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as { table: string; from: string; to: string | null }[];
  for (const fk of links) {
    if (row[fk.from] == null || cols.find((c) => c.name === fk.from)?.notnull) continue;
    if (!db.prepare(`SELECT 1 FROM ${fk.table} WHERE ${fk.to ?? 'id'} = ?`).get(row[fk.from])) row[fk.from] = null;
  }
  const present = cols.filter((c) => row[c.name] !== undefined && !(row[c.name] === null && c.notnull && c.dflt_value !== null));
  const result = db.prepare(
    `INSERT INTO ${table} (${present.map((c) => c.name).join(', ')}) VALUES (${present.map(() => '?').join(', ')})`
  ).run(...present.map((c) => row[c.name] as any));
  return Number(row.id ?? result.lastInsertRowid);
}

const userExists = (id: unknown) => id != null && !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id);

export class TrashError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

/**
 * Put a trashed item back. A task goes back into its room, or into `roomId` when given; if its room
 * is gone and no other room was chosen this fails with 'room_missing'.
 */
export function restoreFromTrash(trashId: number, options: { roomId?: number } = {}) {
  purgeOldTrash();
  const item = db.prepare('SELECT * FROM trash WHERE id = ?').get(trashId) as any;
  if (!item) throw new TrashError(404, 'not_found', 'Not in the trash (it may have been emptied after 30 days)');
  const snapshot = JSON.parse(item.snapshot);

  return db.transaction(() => {
    let restored: { kind: TrashKind; id: number; roomId?: number };
    if (item.kind === 'task') {
      const roomId = options.roomId ?? snapshot.task.roomId;
      if (!db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(roomId)) {
        if (options.roomId != null) throw new TrashError(404, 'room_not_found', 'That room does not exist');
        throw new TrashError(409, 'room_missing', `The room "${item.roomName ?? '?'}" no longer exists. Choose another room to restore this task into.`, { roomName: item.roomName });
      }
      const taskId = insertSnapshotRow('tasks', { ...snapshot.task, roomId });
      for (const a of snapshot.assignees || []) {
        if (userExists(a.userId)) insertSnapshotRow('task_assignees', { ...a, taskId });
      }
      // History comes back as it was; balances were never changed by deleting, so nothing is paid again
      for (const c of snapshot.completions || []) {
        if (userExists(c.userId)) insertSnapshotRow('task_completions', { ...c, taskId });
      }
      restored = { kind: 'task', id: taskId, roomId };
    } else if (item.kind === 'reward') {
      const rewardId = insertSnapshotRow('rewards', snapshot.reward);
      const redemptionIds = new Map<number, number>();
      for (const r of snapshot.redemptions || []) {
        if (userExists(r.userId)) redemptionIds.set(r.id, insertSnapshotRow('reward_redemptions', { ...r, rewardId }));
      }
      for (const v of snapshot.visibility || []) {
        if (userExists(v.userId)) insertSnapshotRow('reward_visibility', { ...v, rewardId });
      }
      for (const pr of snapshot.prices || []) {
        if (userExists(pr.userId)) insertSnapshotRow('reward_prices', { ...pr, rewardId });
      }
      for (const c of snapshot.contributions || []) {
        if (userExists(c.userId)) insertSnapshotRow('reward_contributions', { ...c, rewardId, redemptionId: c.redemptionId == null ? null : redemptionIds.get(c.redemptionId) ?? null });
      }
      restored = { kind: 'reward', id: rewardId };
    } else {
      throw new TrashError(400, 'unknown_kind', 'Unknown item type');
    }
    db.prepare('DELETE FROM trash WHERE id = ?').run(trashId);
    return restored;
  })();
}
