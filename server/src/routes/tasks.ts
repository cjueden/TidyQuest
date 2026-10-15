import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { calculateHealth, getCoinsForEffort } from '../utils/health';
import { suggestTaskIcon } from '../utils/taskIcons';
import { notifyAchievementUnlocksForUser, checkAndRecordNewAchievements } from '../utils/achievementNotifications';
import { ensureAdmin, getCoinsByEffortConfig, getGlobalVacation, getUserVacation, resolveVacation, isStrictModeEnabled } from '../utils/adminHelpers';
import { localDateStr } from '../utils/dateHelpers';
import { isNotificationTypeEnabled, sendNotification } from '../utils/notifications';

// Proof photos kids can attach to a completion (served at /api/proofs)
export const proofsDir = path.join(__dirname, '..', '..', '..', 'data', 'proofs');
if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });
const proofUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, proofsDir),
    filename: (_req, file, cb) => {
      const ext = ['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(path.extname(file.originalname).toLowerCase())
        ? path.extname(file.originalname).toLowerCase() : '.jpg';
      cb(null, `proof-${crypto.randomBytes(12).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const router = Router();
router.use(authMiddleware);

function hadDueTaskOnDate(dateIsoDay: string): boolean {
  const endOfDay = new Date(`${dateIsoDay}T23:59:59.999Z`).getTime();
  const tasks = db.prepare('SELECT id, frequencyDays, isSeasonal, lastCompletedAt FROM tasks').all() as Array<{
    id: number; frequencyDays: number; isSeasonal: number; lastCompletedAt: string | null;
  }>;

  for (const t of tasks) {
    if (t.isSeasonal) continue;
    const safeFreq = Math.max(1 / 24, Number(t.frequencyDays) || 7);
    let dueTs: number;
    if (!t.lastCompletedAt) {
      dueTs = 0;
    } else {
      dueTs = new Date(t.lastCompletedAt).getTime() + safeFreq * 86400000;
    }
    if (dueTs <= endOfDay) {
      const health = calculateHealth(t.lastCompletedAt, safeFreq, false, null);
      if (health < 100) return true;
    }
  }
  return false;
}

function applyApprovedCompletion(
  task: any,
  taskId: number,
  effectiveUserId: number,
  coins: number,
  now: string,
  gamificationOn: boolean = true,
  options?: { completionId?: number; approvedByUserId?: number; approvedAt?: string; note?: string | null }
): number {
  const approvedByUserId = options?.approvedByUserId ?? effectiveUserId;
  const approvedAt = options?.approvedAt ?? now;
  let completionId = options?.completionId ?? 0;
  if (options?.completionId) {
    db.prepare(
      "UPDATE task_completions SET status = 'approved', approvedByUserId = ?, approvedAt = ? WHERE id = ?"
    ).run(approvedByUserId, approvedAt, options.completionId);
  } else {
    completionId = Number(db.prepare(
      'INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status, approvedByUserId, approvedAt, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(taskId, effectiveUserId, now, coins, 'approved', approvedByUserId, approvedAt, options?.note ?? null).lastInsertRowid);
  }

  const taskAssignees = db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?').all(taskId) as { userId: number }[];

  if (task.assignmentMode === 'shared' || task.assignmentMode === 'custom') {
    if (taskAssignees.length > 0) {
      const doneCount = db.prepare(
        `SELECT COUNT(*) as cnt
         FROM task_completions
         WHERE taskId = ? AND status = 'approved' AND date(completedAt, 'localtime') = date(?, 'localtime')`
      ).get(taskId, now) as { cnt: number };
      if (doneCount.cnt >= taskAssignees.length) {
        db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(now, taskId);
      }
    } else {
      db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(now, taskId);
    }
  } else {
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(now, taskId);
  }

  if (gamificationOn) {
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(coins, effectiveUserId);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(effectiveUserId) as any;
    const today = localDateStr();
    const globalVac = getGlobalVacation();
    const userVac = getUserVacation(effectiveUserId);
    const streakVacation = resolveVacation(globalVac, userVac);

    if (!streakVacation.isVacation && user.lastActiveDate !== today) {
      const yesterday = localDateStr(new Date(Date.now() - 86400000));
      let keepGapWithoutPenalty = false;
      if (user.lastActiveDate && user.lastActiveDate < yesterday) {
        keepGapWithoutPenalty = true;
        const start = new Date(`${user.lastActiveDate}T00:00:00`);
        const end = new Date(`${yesterday}T00:00:00`);
        for (let d = new Date(start.getTime() + 86400000); d <= end; d = new Date(d.getTime() + 86400000)) {
          const day = localDateStr(d);
          if (hadDueTaskOnDate(day)) {
            keepGapWithoutPenalty = false;
            break;
          }
        }
      }
      const newStreak = user.lastActiveDate === yesterday
        ? user.currentStreak + 1
        : keepGapWithoutPenalty
          ? user.currentStreak + 1
          : 1;
      db.prepare('UPDATE users SET currentStreak = ?, lastActiveDate = ? WHERE id = ?')
        .run(newStreak, today, effectiveUserId);
    }

  }
  return completionId;
}

/** Approve one waiting completion: pay it out, move the rotation on. Returns an error code or null. */
function approvePendingCompletion(completionId: number, adminId: number): string | null {
  const completion = db.prepare('SELECT id, taskId, userId, completedAt, coinsEarned, status FROM task_completions WHERE id = ?').get(completionId) as any;
  if (!completion) return 'not_found';
  if (completion.status !== 'pending') return 'completion_not_pending';
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(completion.taskId) as any;
  if (!task) return 'task_not_found';
  const gamifRow = db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  const gamificationOn = gamifRow ? gamifRow.value !== '0' : true;
  applyApprovedCompletion(task, completion.taskId, completion.userId, completion.coinsEarned, completion.completedAt, gamificationOn, {
    completionId: completion.id,
    approvedByUserId: adminId,
    approvedAt: new Date().toISOString(),
  });
  // The turn moves on once the parent approves (it used to stay stuck under Strict Mode)
  advanceRotation(task, completion.userId);
  if (gamificationOn) void notifyAchievementUnlocksForUser(completion.userId);
  return null;
}

/** Reject one waiting completion (it's removed; no coins). Returns an error code or null. */
function rejectPendingCompletion(completionId: number): string | null {
  const completion = db.prepare('SELECT id, status FROM task_completions WHERE id = ?').get(completionId) as { id: number; status: string } | undefined;
  if (!completion) return 'not_found';
  if (completion.status !== 'pending') return 'completion_not_pending';
  db.prepare('DELETE FROM task_completions WHERE id = ?').run(completion.id);
  return null;
}

// List tasks for a room
router.get('/rooms/:roomId/tasks', (req: AuthRequest, res: Response) => {
  const vacation = getGlobalVacation();
  const room = db.prepare('SELECT assignedUserId FROM rooms WHERE id = ?').get(req.params.roomId) as any;
  const tasks = db.prepare('SELECT * FROM tasks WHERE roomId = ?').all(req.params.roomId) as any[];
  const now = new Date().toISOString();

  // Build users map for assignment resolution
  const allUsers = db.prepare('SELECT id, displayName, avatarColor, avatarType, avatarPreset, avatarPhotoUrl FROM users').all() as any[];
  const usersById = new Map(allUsers.map((u: any) => [u.id, u]));

  // Batch-fetch today's completions for all tasks in this room
  const taskIds = tasks.map((t: any) => t.id);
  const todayCompletions = taskIds.length > 0
    ? db.prepare(
        `SELECT tc.id as completionId, tc.taskId, tc.userId, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
         FROM task_completions tc
         JOIN users u ON tc.userId = u.id
         WHERE tc.taskId IN (${taskIds.map(() => '?').join(',')}) AND tc.status = 'approved' AND date(tc.completedAt, 'localtime') = date(?, 'localtime')`
      ).all(...taskIds, now) as any[]
    : [];

  const completedTodayByTask = new Map(todayCompletions.map((c: any) => [c.taskId, {
    completionId: c.completionId, userId: c.userId, displayName: c.displayName, avatarColor: c.avatarColor,
    avatarType: c.avatarType, avatarPreset: c.avatarPreset, avatarPhotoUrl: c.avatarPhotoUrl,
  }]));

  // For shared mode tasks: collect per-user completions today
  const sharedCompletionsByTask = new Map<number, Array<{ userId: number; displayName: string; completionId: number }>>();
  for (const c of todayCompletions) {
    if (!sharedCompletionsByTask.has(c.taskId)) sharedCompletionsByTask.set(c.taskId, []);
    sharedCompletionsByTask.get(c.taskId)!.push({ userId: c.userId, displayName: c.displayName, completionId: c.completionId });
  }

  // Batch-fetch task_assignees for all tasks in this room
  const taskAssigneeRows = taskIds.length > 0
    ? db.prepare(`SELECT taskId, userId, coinPercentage FROM task_assignees WHERE taskId IN (${taskIds.map(() => '?').join(',')})`)
        .all(...taskIds) as { taskId: number; userId: number; coinPercentage: number }[]
    : [];
  const assigneesByTask = new Map<number, { userId: number; coinPercentage: number }[]>();
  for (const a of taskAssigneeRows) {
    if (!assigneesByTask.has(a.taskId)) assigneesByTask.set(a.taskId, []);
    assigneesByTask.get(a.taskId)!.push({ userId: a.userId, coinPercentage: a.coinPercentage });
  }

  const roomAssignedUserId = room?.assignedUserId ?? null;

  const tasksWithHealth = tasks.map((t) => {
    const taskAssigneeEntries = assigneesByTask.get(t.id) || [];
    const taskAssignedUserIds = taskAssigneeEntries.map(a => a.userId);
    // effectiveAssignedUserIds: room assignment overrides task assignment
    const effectiveAssignedUserIds = roomAssignedUserId ? [roomAssignedUserId] : taskAssignedUserIds;
    const assignedUsers = taskAssigneeEntries
      .map(a => {
        const u = usersById.get(a.userId);
        if (!u) return null;
        return { id: u.id, displayName: u.displayName, avatarColor: u.avatarColor, avatarType: u.avatarType, avatarPreset: u.avatarPreset, avatarPhotoUrl: u.avatarPhotoUrl, coinPercentage: a.coinPercentage };
      })
      .filter(Boolean);
    const mode = t.assignmentMode || 'first';
    return {
      ...t,
      isSeasonal: !!t.isSeasonal,
      assignedToChildren: !!t.assignedToChildren,
      assignedUserIds: taskAssignedUserIds,
      assignedUsers,
      effectiveAssignedUserIds,
      completedTodayBy: completedTodayByTask.get(t.id) || null,
      assignmentMode: mode,
      sharedCompletions: (mode === 'shared' || mode === 'custom') ? (sharedCompletionsByTask.get(t.id) || []) : undefined,
      health: (() => {
        const taskVac = effectiveAssignedUserIds.length === 1
          ? resolveVacation(vacation, getUserVacation(effectiveAssignedUserIds[0]))
          : vacation;
        return calculateHealth(t.lastCompletedAt, t.frequencyDays, taskVac.isVacation, taskVac.startDate);
      })(),
    };
  });

  res.json(tasksWithHealth);
});

// Create task
router.post('/rooms/:roomId/tasks', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { name, notes, frequencyDays, effort, isSeasonal, health, iconKey, assignedToChildren, assignedUserIds, assignmentMode, assignedUserPercentages, onDemand, showInDashboard, customCoins, allowEarlyCompletion } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const effectiveFrequency = Math.max(1 / 24, Number(frequencyDays) || 7);
  let lastCompletedAt: string | null = null;
  if (health !== undefined && health !== null) {
    const targetHealth = Math.max(0, Math.min(100, Math.round(Number(health))));
    if (targetHealth >= 100) {
      lastCompletedAt = new Date().toISOString();
    } else {
      const daysSince = ((100 - targetHealth) / 100) * effectiveFrequency;
      lastCompletedAt = new Date(Date.now() - daysSince * 86400000).toISOString();
    }
  }

  // assignedUserIds and assignedToChildren are mutually exclusive
  const resolvedAssignedToChildren = (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) ? 0 : (assignedToChildren ? 1 : 0);
  const resolvedAssignmentMode = ['shared', 'custom', 'rotating'].includes(assignmentMode) ? assignmentMode : 'first';

  // Validate custom mode percentages sum to 100
  if (resolvedAssignmentMode === 'custom' && Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
    const total = assignedUserIds.reduce((s: number, uid: number) => s + ((assignedUserPercentages?.[Number(uid)] ?? 0)), 0);
    if (total !== 100) return res.status(400).json({ error: 'custom_percentages_must_sum_to_100' });
  }

  const resolvedCustomCoins = (customCoins !== undefined && customCoins !== null && customCoins !== '')
    ? Math.max(1, Math.round(Number(customCoins))) : null;

  const result = db.prepare(
    `INSERT INTO tasks (roomId, name, notes, frequencyDays, effort, isSeasonal, lastCompletedAt, iconKey,
      assignedToChildren, assignmentMode, onDemand, showInDashboard, customCoins, allowEarlyCompletion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.params.roomId, name, notes || null, frequencyDays || 7, effort || 1, isSeasonal ? 1 : 0,
    lastCompletedAt, iconKey || suggestTaskIcon(name, null), resolvedAssignedToChildren,
    resolvedAssignmentMode, onDemand ? 1 : 0, showInDashboard ? 1 : 0,
    resolvedCustomCoins, allowEarlyCompletion ? 1 : 0
  );

  const newTaskId = result.lastInsertRowid as number;

  // Insert multi-user assignees
  if (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
    const insertAssignee = db.prepare('INSERT OR IGNORE INTO task_assignees (taskId, userId, coinPercentage) VALUES (?, ?, ?)');
    for (const uid of assignedUserIds) {
      const pct = (assignedUserPercentages && typeof assignedUserPercentages === 'object') ? (assignedUserPercentages[Number(uid)] ?? 0) : 0;
      insertAssignee.run(newTaskId, Number(uid), pct);
    }
    // Set initial rotation user for rotating mode
    if (resolvedAssignmentMode === 'rotating') {
      db.prepare('UPDATE tasks SET rotationCurrentUserId = ? WHERE id = ?').run(Number(assignedUserIds[0]), newTaskId);
    }
  }

  // If the room has a room-level assignedUserId, auto-assign this new task to that user
  const roomData = db.prepare('SELECT assignedUserId FROM rooms WHERE id = ?').get(req.params.roomId) as { assignedUserId: number | null } | undefined;
  if (roomData?.assignedUserId) {
    db.prepare('INSERT OR IGNORE INTO task_assignees (taskId, userId, coinPercentage) VALUES (?, ?, 0)')
      .run(newTaskId, roomData.assignedUserId);
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newTaskId);
  res.status(201).json(task);
});

// Update task
router.put('/tasks/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { name, notes, frequencyDays, effort, isSeasonal, health, iconKey, assignedToChildren, assignedUserIds, assignmentMode, assignedUserPercentages, onDemand, showInDashboard, roomId, customCoins, allowEarlyCompletion } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  let lastCompletedAt: string | undefined;
  if (health !== undefined && health !== null) {
    const targetHealth = Math.max(0, Math.min(100, Math.round(Number(health))));
    if (targetHealth >= 100) {
      lastCompletedAt = new Date().toISOString();
    } else {
      const effectiveFrequency = Math.max(1 / 24, Number(frequencyDays ?? task.frequencyDays) || 7);
      const daysSince = ((100 - targetHealth) / 100) * effectiveFrequency;
      lastCompletedAt = new Date(Date.now() - daysSince * 86400000).toISOString();
    }
  }

  // assignedUserIds and assignedToChildren are mutually exclusive
  let resolvedAssignedToChildren: number | undefined;
  if (assignedUserIds !== undefined) {
    resolvedAssignedToChildren = (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) ? 0 : undefined;
  } else if (assignedToChildren !== undefined) {
    resolvedAssignedToChildren = assignedToChildren ? 1 : 0;
  }

  // Build dynamic SQL to support explicit null values
  const setClauses: string[] = [];
  const params: any[] = [];

  if (name !== undefined) { setClauses.push('name = COALESCE(?, name)'); params.push(name); setClauses.push('translationKey = NULL'); }
  if (notes !== undefined) { setClauses.push('notes = ?'); params.push(notes || null); }
  if (frequencyDays !== undefined) { setClauses.push('frequencyDays = COALESCE(?, frequencyDays)'); params.push(frequencyDays); }
  if (effort !== undefined) { setClauses.push('effort = COALESCE(?, effort)'); params.push(effort); }
  if (isSeasonal !== undefined) { setClauses.push('isSeasonal = ?'); params.push(isSeasonal ? 1 : 0); }
  if (lastCompletedAt !== undefined) { setClauses.push('lastCompletedAt = COALESCE(?, lastCompletedAt)'); params.push(lastCompletedAt); }
  if (iconKey !== undefined) { setClauses.push('iconKey = COALESCE(?, iconKey)'); params.push(iconKey); }
  if (resolvedAssignedToChildren !== undefined) { setClauses.push('assignedToChildren = ?'); params.push(resolvedAssignedToChildren); }
  const resolvedMode = assignmentMode !== undefined ? (['shared', 'custom', 'rotating'].includes(assignmentMode) ? assignmentMode : 'first') : undefined;
  if (resolvedMode !== undefined) { setClauses.push('assignmentMode = ?'); params.push(resolvedMode); }
  if (onDemand !== undefined) { setClauses.push('onDemand = ?'); params.push(onDemand ? 1 : 0); }
  if (showInDashboard !== undefined) { setClauses.push('showInDashboard = ?'); params.push(showInDashboard ? 1 : 0); }
  if (roomId !== undefined) {
    const targetRoom = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
    if (!targetRoom) return res.status(404).json({ error: 'Target room not found' });
    setClauses.push('roomId = ?'); params.push(Number(roomId));
  }
  if (customCoins !== undefined) {
    const resolved = (customCoins !== null && customCoins !== '') ? Math.max(1, Math.round(Number(customCoins))) : null;
    setClauses.push('customCoins = ?'); params.push(resolved);
  }
  if (allowEarlyCompletion !== undefined) { setClauses.push('allowEarlyCompletion = ?'); params.push(allowEarlyCompletion ? 1 : 0); }

  // Validate custom mode percentages sum to 100
  if (resolvedMode === 'custom' && Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
    const total = assignedUserIds.reduce((s: number, uid: number) => s + ((assignedUserPercentages?.[Number(uid)] ?? 0)), 0);
    if (total !== 100) return res.status(400).json({ error: 'custom_percentages_must_sum_to_100' });
  }

  if (setClauses.length > 0) {
    params.push(req.params.id);
    db.prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
  }

  // Update task_assignees if provided
  if (assignedUserIds !== undefined) {
    db.prepare('DELETE FROM task_assignees WHERE taskId = ?').run(req.params.id);
    if (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
      const insertAssignee = db.prepare('INSERT OR IGNORE INTO task_assignees (taskId, userId, coinPercentage) VALUES (?, ?, ?)');
      for (const uid of assignedUserIds) {
        const pct = (assignedUserPercentages && typeof assignedUserPercentages === 'object') ? (assignedUserPercentages[Number(uid)] ?? 0) : 0;
        insertAssignee.run(Number(req.params.id), Number(uid), pct);
      }
      // Clear assignedToChildren when specific users are set
      db.prepare('UPDATE tasks SET assignedToChildren = 0 WHERE id = ?').run(req.params.id);
      // (Re-)set rotation start user when switching to rotating mode
      const effectiveMode = resolvedMode ?? task.assignmentMode;
      if (effectiveMode === 'rotating') {
        db.prepare('UPDATE tasks SET rotationCurrentUserId = ? WHERE id = ?').run(Number(assignedUserIds[0]), req.params.id);
      }
    } else {
      // Cleared all assignees — clear rotation too
      db.prepare('UPDATE tasks SET rotationCurrentUserId = NULL WHERE id = ?').run(req.params.id);
    }
  }

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  res.json({ ...updated, assignedToChildren: !!updated.assignedToChildren });
});

// Delete task
router.delete('/tasks/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get all overdue tasks (health <= 0, non-seasonal, non-onDemand)
router.get('/tasks/overdue', (req: AuthRequest, res: Response) => {
  const globalVac = getGlobalVacation();

  const tasks = db.prepare(`
    SELECT t.id, t.name, t.roomId, t.effort, t.frequencyDays, t.lastCompletedAt, t.isSeasonal, t.onDemand,
           r.name as roomName
    FROM tasks t
    JOIN rooms r ON t.roomId = r.id
    WHERE t.isSeasonal = 0 AND t.onDemand = 0
  `).all() as any[];

  const allUsers = db.prepare('SELECT id, displayName, avatarColor, avatarType, avatarPreset, avatarPhotoUrl FROM users').all() as any[];
  const usersById = new Map(allUsers.map((u: any) => [u.id, u]));

  const taskIds = tasks.map((t: any) => t.id);
  const taskAssigneeRows = taskIds.length > 0
    ? db.prepare(`SELECT taskId, userId FROM task_assignees WHERE taskId IN (${taskIds.map(() => '?').join(',')})`).all(...taskIds) as { taskId: number; userId: number }[]
    : [];
  const assigneesByTask = new Map<number, number[]>();
  for (const a of taskAssigneeRows) {
    if (!assigneesByTask.has(a.taskId)) assigneesByTask.set(a.taskId, []);
    assigneesByTask.get(a.taskId)!.push(a.userId);
  }

  const overdueTasks = tasks
    .map((t: any) => {
      const assigneeIds = assigneesByTask.get(t.id) || [];
      const taskVac = assigneeIds.length === 1
        ? resolveVacation(globalVac, getUserVacation(assigneeIds[0]))
        : globalVac;
      const health = calculateHealth(t.lastCompletedAt, t.frequencyDays, taskVac.isVacation, taskVac.startDate);
      if (health > 0) return null;
      const daysOverdue = t.lastCompletedAt
        ? Math.max(0, (Date.now() - new Date(t.lastCompletedAt).getTime()) / 86400000 - t.frequencyDays)
        : 999;
      return {
        id: t.id,
        name: t.name,
        roomId: t.roomId,
        roomName: t.roomName,
        effort: t.effort,
        frequencyDays: t.frequencyDays,
        lastCompletedAt: t.lastCompletedAt,
        health,
        daysOverdue: Math.round(daysOverdue * 10) / 10,
        assignedUsers: assigneeIds.map((uid: number) => usersById.get(uid)).filter(Boolean),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.health - b.health);

  res.json(overdueTasks);
});

// Duplicate a task (admin only)
router.post('/tasks/:id/duplicate', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const result = db.prepare(
    `INSERT INTO tasks (roomId, name, notes, frequencyDays, effort, isSeasonal, lastCompletedAt, iconKey,
      assignedToChildren, assignmentMode, onDemand, showInDashboard, customCoins, allowEarlyCompletion, translationKey)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    task.roomId, task.name, task.notes, task.frequencyDays, task.effort, task.isSeasonal,
    null, task.iconKey, task.assignedToChildren, task.assignmentMode, task.onDemand,
    task.showInDashboard, task.customCoins, task.allowEarlyCompletion, task.translationKey
  );
  const newTaskId = result.lastInsertRowid as number;

  const assignees = db.prepare('SELECT userId, coinPercentage FROM task_assignees WHERE taskId = ?').all(task.id) as { userId: number; coinPercentage: number }[];
  for (const a of assignees) {
    db.prepare('INSERT OR IGNORE INTO task_assignees (taskId, userId, coinPercentage) VALUES (?, ?, ?)').run(newTaskId, a.userId, a.coinPercentage);
  }

  // Set initial rotation user for rotating mode
  if (task.assignmentMode === 'rotating' && assignees.length > 0) {
    db.prepare('UPDATE tasks SET rotationCurrentUserId = ? WHERE id = ?').run(assignees[0].userId, newTaskId);
  }

  const newTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newTaskId);
  res.status(201).json(newTask);
});

// Reset task to dirty - admin only
router.post('/tasks/:id/reset', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const now = new Date().toISOString();
  const completions = db.prepare(
    "SELECT id, userId, coinsEarned, status FROM task_completions WHERE taskId = ? AND date(completedAt, 'localtime') = date(?, 'localtime')"
  ).all(task.id, now) as Array<{ id: number; userId: number; coinsEarned: number; status: string }>;

  for (const completion of completions) {
    if (completion.status === 'approved') {
      db.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE id = ?')
        .run(completion.coinsEarned, completion.userId);
    }
  }

  db.prepare(
    "DELETE FROM task_completions WHERE taskId = ? AND date(completedAt, 'localtime') = date(?, 'localtime')"
  ).run(task.id, now);

  const effectiveFrequency = Math.max(1 / 24, Number(task.frequencyDays) || 7);
  const dirtyAt = new Date(Date.now() - effectiveFrequency * 86400000).toISOString();
  db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?').run(dirtyAt, task.id);

  res.json({
    success: true,
    completionsRemoved: completions.length,
    coinsDeducted: completions
      .filter((completion) => completion.status === 'approved')
      .reduce((sum, completion) => sum + completion.coinsEarned, 0),
    lastCompletedAt: dirtyAt,
  });
});

/** Rotating tasks: hand the next turn to the assignee after the one who just finished. */
function advanceRotation(task: any, completedByUserId: number) {
  if (task.assignmentMode !== 'rotating') return;
  const rotationAssignees = db.prepare('SELECT userId FROM task_assignees WHERE taskId = ? ORDER BY userId ASC').all(task.id) as { userId: number }[];
  if (rotationAssignees.length > 1) {
    const currentIdx = rotationAssignees.findIndex(a => a.userId === (task.rotationCurrentUserId ?? completedByUserId));
    const nextIdx = (currentIdx + 1) % rotationAssignees.length;
    db.prepare('UPDATE tasks SET rotationCurrentUserId = ? WHERE id = ?').run(rotationAssignees[nextIdx].userId, task.id);
  }
}

// Complete task
router.post('/tasks/:id/complete', (req: AuthRequest, res: Response) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Enforce assignment rules
  const room = db.prepare('SELECT assignedUserId FROM rooms WHERE id = ?').get(task.roomId) as any;
  const requester = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId) as any;
  const isAdminOrMember = requester?.role === 'admin' || requester?.role === 'member';

  // Support completing on behalf of another user (admin/member only)
  const { onBehalfOfUserId } = req.body;
  if (onBehalfOfUserId && !isAdminOrMember) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const effectiveUserId = (onBehalfOfUserId && isAdminOrMember)
    ? Number(onBehalfOfUserId)
    : req.userId!;

  if (room?.assignedUserId !== null && room?.assignedUserId !== undefined) {
    // Room-level assignment: only the assigned user, admins, and members can complete
    if (!isAdminOrMember && req.userId !== room.assignedUserId) {
      return res.status(403).json({ error: 'not_assigned' });
    }
  } else {
    // Check task-level multi-user assignment
    const taskAssignees = db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?').all(task.id) as { userId: number }[];
    if (taskAssignees.length > 0) {
      if (!isAdminOrMember && !taskAssignees.some(a => a.userId === req.userId)) {
        return res.status(403).json({ error: 'not_assigned' });
      }
    }
  }
  // If task.assignedToChildren and no room/task-user assignment: all children allowed (no additional restriction needed)
  // If no assignment: everyone allowed

  // Rotating mode: only the current rotation user can complete (admins/members bypass)
  if (task.assignmentMode === 'rotating' && !isAdminOrMember) {
    const rotationUserId = task.rotationCurrentUserId;
    if (rotationUserId && req.userId !== rotationUserId) {
      return res.status(409).json({ error: 'not_your_turn' });
    }
  }

  // Always use server timestamp — never trust client-supplied completedAt
  const now = new Date().toISOString();

  if (!task.onDemand) {
    // Block if effective user already completed this task today
    const alreadyDoneBySelf = db.prepare(
      "SELECT id FROM task_completions WHERE taskId = ? AND userId = ? AND status IN ('approved', 'pending') AND date(completedAt, 'localtime') = date(?, 'localtime')"
    ).get(task.id, effectiveUserId, now);
    if (alreadyDoneBySelf) {
      return res.status(409).json({ error: 'already_done_today' });
    }

    if (task.assignmentMode !== 'shared' && task.assignmentMode !== 'custom') {
      // In 'first' mode: block if someone else already completed today
      const alreadyDoneByOther = db.prepare(
        "SELECT id FROM task_completions WHERE taskId = ? AND userId != ? AND status IN ('approved', 'pending') AND date(completedAt, 'localtime') = date(?, 'localtime')"
      ).get(task.id, effectiveUserId, now);
      if (alreadyDoneByOther) {
        return res.status(409).json({ error: 'already_done_by_other' });
      }
    }

    // Block if frequency cooldown hasn't elapsed (task not yet due)
    if (task.lastCompletedAt) {
      const globalVac = getGlobalVacation();
      const taskAssigneesForVac = db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?').all(task.id) as { userId: number }[];
      const taskVac = taskAssigneesForVac.length === 1
        ? resolveVacation(globalVac, getUserVacation(taskAssigneesForVac[0].userId))
        : globalVac;
      const currentHealth = calculateHealth(task.lastCompletedAt, task.frequencyDays, taskVac.isVacation, taskVac.startDate);
      if (currentHealth > 0) {
        // allowEarlyCompletion: bypass cooldown if completed on a previous calendar day
        if (task.allowEarlyCompletion) {
          const lastDay = localDateStr(new Date(task.lastCompletedAt));
          const today = localDateStr();
          if (lastDay >= today) {
            return res.status(409).json({ error: 'not_yet_due', health: currentHealth });
          }
          // Different calendar day — allow despite health > 0
        } else {
          return res.status(409).json({ error: 'not_yet_due', health: currentHealth });
        }
      }
    }
  }

  // Fetch assignees once — needed for coin splitting and lastCompletedAt logic
  const taskAssignees = db.prepare('SELECT userId, coinPercentage FROM task_assignees WHERE taskId = ?').all(task.id) as { userId: number; coinPercentage: number }[];

  // Coin calculation based on assignment mode (skip when gamification disabled)
  const gamifRow = db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  const gamificationOn = gamifRow ? gamifRow.value !== '0' : true;

  let coins: number;
  if (!gamificationOn) {
    coins = 0;
  } else {
    const baseCoins = (task.customCoins != null && task.customCoins > 0)
      ? task.customCoins
      : getCoinsForEffort(task.effort, getCoinsByEffortConfig());
    if (task.assignmentMode === 'shared' && taskAssignees.length > 1) {
      coins = Math.floor(baseCoins / taskAssignees.length);
    } else if (task.assignmentMode === 'custom') {
      const row = taskAssignees.find(a => a.userId === effectiveUserId);
      coins = Math.floor(baseCoins * (row?.coinPercentage ?? 0) / 100);
    } else {
      coins = baseCoins;
    }
  }

  // Optional proof note (a photo can be attached afterwards with POST /completions/:id/photo)
  const note = typeof req.body.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 500) : null;

  const targetUser = db.prepare('SELECT role, displayName FROM users WHERE id = ?').get(effectiveUserId) as { role?: string; displayName?: string } | undefined;
  // requireApproval: integrations such as Home Assistant act for a child with a parent's login, so the
  // completion must still go through Strict Mode (upstream #142). In-app "who did it?" stays instant.
  const actingForChild = !!onBehalfOfUserId && req.body.requireApproval === true;
  const strictNeedsApproval = isStrictModeEnabled() && targetUser?.role === 'child' && (!isAdminOrMember || actingForChild);

  if (strictNeedsApproval) {
    const pendingId = Number(db.prepare(
      "INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status, note) VALUES (?, ?, ?, ?, 'pending', ?)"
    ).run(task.id, effectiveUserId, now, coins, note).lastInsertRowid);
    if (isNotificationTypeEnabled('choreApproval')) {
      void sendNotification(`✅ ${targetUser?.displayName ?? 'Someone'} finished "${task.name}" and it's waiting for your approval.`);
    }
    return res.json({ coinsEarned: 0, health: task.health, pendingApproval: true, completionId: pendingId });
  }

  const completionId = applyApprovedCompletion(task, task.id, effectiveUserId, coins, now, gamificationOn, { note });
  advanceRotation(task, effectiveUserId);

  const newAchievements = gamificationOn ? checkAndRecordNewAchievements(effectiveUserId) : [];
  if (newAchievements.length > 0) {
    void notifyAchievementUnlocksForUser(effectiveUserId);
  }
  res.json({ coinsEarned: coins, health: 100, pendingApproval: false, newAchievements, completionId });
});

router.get('/completions/pending', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const pending = db.prepare(`
    SELECT tc.id, tc.taskId, tc.userId, tc.completedAt, tc.coinsEarned, tc.note, tc.photoUrl,
           t.name AS taskName, t.translationKey, t.roomId, t.assignmentMode, t.effort,
           r.name AS roomName, r.roomType,
           u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
    FROM task_completions tc
    JOIN tasks t ON tc.taskId = t.id
    JOIN rooms r ON t.roomId = r.id
    JOIN users u ON tc.userId = u.id
    WHERE tc.status = 'pending'
    ORDER BY tc.completedAt DESC
  `).all();

  res.json({ pending });
});

const PENDING_ERRORS: Record<string, number> = { not_found: 404, task_not_found: 404, completion_not_pending: 409 };

router.post('/completions/:completionId/approve', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }
  const error = approvePendingCompletion(Number(req.params.completionId), req.userId!);
  if (error) return res.status(PENDING_ERRORS[error]).json({ error: error === 'not_found' ? 'Completion not found' : error === 'task_not_found' ? 'Task not found' : error });
  res.json({ success: true });
});

router.delete('/completions/:completionId/reject', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }
  const error = rejectPendingCompletion(Number(req.params.completionId));
  if (error) return res.status(PENDING_ERRORS[error]).json({ error: error === 'not_found' ? 'Completion not found' : error });
  res.json({ success: true });
});

// Approve or reject several waiting completions at once (report card day). Skips ones already handled.
function batchIds(body: any): number[] | null {
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) return null;
  const nums = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return nums.length === ids.length ? nums : null;
}

router.post('/completions/approve-batch', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const ids = batchIds(req.body);
  if (!ids) return res.status(400).json({ error: 'ids must be a non-empty array of completion ids' });
  const results = db.transaction(() => ids.map((id) => ({ id, error: approvePendingCompletion(id, req.userId!) })))();
  res.json({ approved: results.filter((r) => !r.error).map((r) => r.id), skipped: results.filter((r) => r.error) });
});

router.post('/completions/reject-batch', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const ids = batchIds(req.body);
  if (!ids) return res.status(400).json({ error: 'ids must be a non-empty array of completion ids' });
  const results = db.transaction(() => ids.map((id) => ({ id, error: rejectPendingCompletion(id) })))();
  res.json({ rejected: results.filter((r) => !r.error).map((r) => r.id), skipped: results.filter((r) => r.error) });
});

// Attach a proof photo to a completion: the person who did it (or a parent)
router.post('/completions/:completionId/photo', proofUpload.single('photo'), (req: AuthRequest, res: Response) => {
  const file = (req as any).file as { filename: string; path: string } | undefined;
  const completion = db.prepare('SELECT id, userId FROM task_completions WHERE id = ?').get(req.params.completionId) as { id: number; userId: number } | undefined;
  const discard = () => { if (file) fs.rmSync(file.path, { force: true }); };
  if (!completion) { discard(); return res.status(404).json({ error: 'Completion not found' }); }
  if (completion.userId !== req.userId && !ensureAdmin(req.userId)) { discard(); return res.status(403).json({ error: 'forbidden' }); }
  if (!file) return res.status(400).json({ error: 'photo (an image file) is required' });
  const photoUrl = `/api/proofs/${file.filename}`;
  db.prepare('UPDATE task_completions SET photoUrl = ? WHERE id = ?').run(photoUrl, completion.id);
  res.json({ photoUrl });
});

// Cancel (undo) a task completion — admin only
router.delete('/completions/:completionId', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const completion = db.prepare(
    'SELECT id, taskId, userId, coinsEarned, status FROM task_completions WHERE id = ?'
  ).get(req.params.completionId) as any;
  if (!completion) return res.status(404).json({ error: 'Completion not found' });

  if (completion.status === 'approved') {
    db.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE id = ?')
      .run(completion.coinsEarned, completion.userId);
  }

  // Delete the completion record
  db.prepare('DELETE FROM task_completions WHERE id = ?').run(completion.id);

  // Update task.lastCompletedAt to the previous completion's completedAt (or NULL if none)
  const prev = db.prepare(
    "SELECT completedAt FROM task_completions WHERE taskId = ? AND status = 'approved' ORDER BY completedAt DESC LIMIT 1"
  ).get(completion.taskId) as any;
  db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?')
    .run(prev?.completedAt || null, completion.taskId);

  res.json({ success: true, coinsDeducted: completion.coinsEarned });
});

export default router;
