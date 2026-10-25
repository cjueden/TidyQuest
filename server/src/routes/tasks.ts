import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { getCoinsForEffort } from '../utils/health';
import { suggestTaskIcon } from '../utils/taskIcons';
import { notifyAchievementUnlocksForUser, checkAndRecordNewAchievements } from '../utils/achievementNotifications';
import { badgeInfo } from '../utils/achievementStats';
import { pinnedTaskIds } from '../utils/homeSections';
import { claimRescue, releaseRescue, setRescueCompletion, todaysMission } from '../utils/rescue';
import { notifyChoreApproved, notifyChoreRejected, notifyChoreWaiting } from '../utils/notifyMessages';
import { ensureAdmin, getCoinsByEffortConfig, getGlobalVacation, getUserVacation, resolveVacation, isStrictModeEnabled } from '../utils/adminHelpers';
import { localDateStr } from '../utils/dateHelpers';
import { dayAt, daySql, endOfDay as endOfDayOf, startOfDay } from '../utils/clock';
import { hasFixedSchedule, isSeasonalNow, lastCompletedAtForHealth, nextDueAt, parseStored, readScheduleInput, rotationTurnUserId, saveScheduleInput, scheduleFields, taskHealth, type ScheduledTask } from '../utils/schedule';
import { isNotificationTypeEnabled, sendNotification } from '../utils/notifications';
import { countInPeriod, parseRepeatLimit, repeatLimitOf } from '../utils/repeatLimits';
import { boostMultiplierFor } from '../utils/boosts';
import { trashTask } from '../utils/trash';
import { tr } from '../utils/i18n';
import { pauseTask, readPausedUntil, resumeTask } from '../utils/pause';
import { earnShieldAt, lateStreak, nextStreak, noteBrokenStreak, settleStreak } from '../utils/streaks';
import { baseCoinsOf, endTeamupsFor, groupTeamPending, openTeamupFor, teamShares, teamUpInfo, type Teamup } from '../utils/teamups';

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

function applyApprovedCompletion(
  task: any,
  taskId: number,
  effectiveUserId: number,
  coins: number,
  now: string,
  gamificationOn: boolean = true,
  options?: { completionId?: number; approvedByUserId?: number; approvedAt?: string; note?: string | null; loggedAt?: string; lateDay?: string }
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
      'INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status, approvedByUserId, approvedAt, note, loggedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(taskId, effectiveUserId, now, coins, 'approved', approvedByUserId, approvedAt, options?.note ?? null, options?.loggedAt ?? null).lastInsertRowid);
  }

  const taskAssignees = db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?').all(taskId) as { userId: number }[];
  // lastCompletedAt only moves forward (a late log can be older than the last completion)
  const setLastCompleted = () => db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ? AND (lastCompletedAt IS NULL OR lastCompletedAt < ?)').run(now, taskId, now);

  // A one-time chore is finished: it leaves every list (its history stays)
  if (task.oneTime) db.prepare('UPDATE tasks SET archivedAt = ? WHERE id = ?').run(now, taskId);

  if (task.assignmentMode === 'shared' || task.assignmentMode === 'custom') {
    if (taskAssignees.length > 0) {
      const doneCount = db.prepare(
        `SELECT COUNT(*) as cnt
         FROM task_completions
         WHERE taskId = ? AND status = 'approved' AND ${daySql('completedAt')} = ${daySql('?')}`
      ).get(taskId, now) as { cnt: number };
      if (doneCount.cnt >= taskAssignees.length) setLastCompleted();
    } else {
      setLastCompleted();
    }
  } else {
    setLastCompleted();
  }

  if (gamificationOn) {
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(coins, effectiveUserId);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(effectiveUserId) as any;
    const today = localDateStr();
    if (options?.lateDay) {
      lateStreak(effectiveUserId, options.lateDay);
      return completionId;
    }
    const globalVac = getGlobalVacation();
    const userVac = getUserVacation(effectiveUserId);
    const streakVacation = resolveVacation(globalVac, userVac);

    if (!streakVacation.isVacation && user.lastActiveDate !== today) {
      // Shields first cover any days missed since the last counted day, so the streak can carry on
      settleStreak(effectiveUserId);
      const last = (db.prepare('SELECT lastActiveDate FROM users WHERE id = ?').get(effectiveUserId) as { lastActiveDate: string | null }).lastActiveDate;
      const newStreak = nextStreak(effectiveUserId, user.currentStreak, last, today);
      if (newStreak === 1 && user.currentStreak > 0 && last) noteBrokenStreak(effectiveUserId, user.currentStreak, last, today);
      db.prepare('UPDATE users SET currentStreak = ?, lastActiveDate = ? WHERE id = ?')
        .run(newStreak, today, effectiveUserId);
      earnShieldAt(effectiveUserId, newStreak);
    }

  }
  return completionId;
}

/** Approve one waiting completion: pay it out, move the rotation on. Returns an error code or null. */
/** Extras a parent can add when approving one chore: a note ("Great job!") and an "above and beyond" bonus */
const APPROVAL_BONUSES = [1, 2, 5];
function parseApprovalExtras(body: any): { note: string | null; bonus: number } | { error: string } {
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (note.length > 200) return { error: 'note_too_long' };
  const bonus = body?.bonus == null ? 0 : Number(body.bonus);
  if (bonus !== 0 && !APPROVAL_BONUSES.includes(bonus)) return { error: 'invalid_bonus' };
  return { note: note || null, bonus };
}

function approvePendingCompletion(completionId: number, adminId: number, extras: { note: string | null; bonus: number } = { note: null, bonus: 0 }): string | null {
  const completion = db.prepare('SELECT id, taskId, userId, completedAt, coinsEarned, status, teamupId FROM task_completions WHERE id = ?').get(completionId) as any;
  if (!completion) return 'not_found';
  if (completion.status !== 'pending') return 'completion_not_pending';
  // A team's chore is approved once for everyone on it
  if (completion.teamupId) {
    const team = db.prepare("SELECT id FROM task_completions WHERE teamupId = ? AND status = 'pending' AND id != ?").all(completion.teamupId, completion.id) as { id: number }[];
    for (const other of team) approveOne(other.id, adminId, extras);
  }
  return approveOne(completionId, adminId, extras);
}

function approveOne(completionId: number, adminId: number, extras: { note: string | null; bonus: number }): string | null {
  const completion = db.prepare('SELECT id, taskId, userId, completedAt, coinsEarned, status, loggedAt FROM task_completions WHERE id = ?').get(completionId) as any;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(completion.taskId) as any;
  if (!task) return 'task_not_found';
  const gamifRow = db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  const gamificationOn = gamifRow ? gamifRow.value !== '0' : true;
  applyApprovedCompletion(task, completion.taskId, completion.userId, completion.coinsEarned, completion.completedAt, gamificationOn, {
    completionId: completion.id,
    approvedByUserId: adminId,
    approvedAt: new Date().toISOString(),
    lateDay: completion.loggedAt ? localDateStr(new Date(completion.completedAt)) : undefined,
  });
  // The turn moves on once the parent approves (it used to stay stuck under Strict Mode); a late log
  // only moves it if nothing was done since
  if (!completion.loggedAt || isLatestCompletion(task.id, completion.completedAt)) advanceRotation(task, completion.userId);
  if (extras.note) db.prepare('UPDATE task_completions SET approvalNote = ? WHERE id = ?').run(extras.note, completion.id);
  // The bonus goes in the coin ledger as "above and beyond", in the kid's language
  if (extras.bonus > 0 && completion.coinsEarned > 0) { // not to a parent helping on a team
    const kidLang = (db.prepare('SELECT language FROM users WHERE id = ?').get(completion.userId) as { language: string | null } | undefined)?.language ?? 'en';
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(extras.bonus, completion.userId);
    db.prepare('INSERT INTO coin_adjustments (userId, amount, reason, createdBy, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(completion.userId, extras.bonus, tr(kidLang, 'cheers.bonusReason', { task: task.name }), adminId, new Date().toISOString());
  }
  void notifyChoreApproved(completion.userId, adminId, task.name, completion.coinsEarned, extras);
  if (gamificationOn) void notifyAchievementUnlocksForUser(completion.userId);
  return null;
}

/**
 * Done as a team: each member gets a completion (their share of the coins, times any double coins or
 * Rescue Mission multiplier). Under Strict Mode a kid's team waits for one approval for everyone.
 */
function completeAsTeam(task: any, team: Teamup, tapperId: number, tapperIsAdult: boolean, now: string, note: string | null) {
  const gamifRow = db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  const gamificationOn = gamifRow ? gamifRow.value !== '0' : true;
  const mission = todaysMission(new Date(now));
  const rescued = !!mission && mission.taskId === task.id && claimRescue(task.id, tapperId, new Date(now));
  const multiplier = Math.max(boostMultiplierFor(task.id, task.roomId, new Date(now)), rescued ? mission!.multiplier : 1);
  const shares = teamShares(gamificationOn ? baseCoinsOf(task) : 0, team.members);
  const needsApproval = isStrictModeEnabled() && !tapperIsAdult && team.members.some((m) => m.role === 'child');
  const ids: number[] = [];
  const earned = new Map<number, number>();
  for (const m of team.members) {
    let coins = shares.get(m.userId) ?? 0;
    if (coins > 0 && multiplier > 1) coins = Math.round(coins * multiplier);
    earned.set(m.userId, coins);
    const id = needsApproval
      ? Number(db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status, note, teamupId) VALUES (?, ?, ?, ?, 'pending', ?, ?)")
        .run(task.id, m.userId, now, coins, note, team.id).lastInsertRowid)
      : applyApprovedCompletion(task, task.id, m.userId, coins, now, gamificationOn, { note });
    if (!needsApproval) db.prepare('UPDATE task_completions SET teamupId = ? WHERE id = ?').run(team.id, id);
    ids.push(id);
  }
  db.prepare("UPDATE teamups SET status = 'done' WHERE id = ?").run(team.id);
  if (rescued) setRescueCompletion(mission!.day, ids[0]);
  if (needsApproval) {
    void notifyChoreWaiting(team.members.find((m) => m.role === 'child')!.userId, task.name);
    return { coinsEarned: 0, health: task.health, pendingApproval: true, completionId: ids[0], rescued, team: true };
  }
  const newAchievements = gamificationOn ? checkAndRecordNewAchievements(tapperId) : [];
  for (const m of team.members) if (gamificationOn) void notifyAchievementUnlocksForUser(m.userId);
  return { coinsEarned: earned.get(tapperId) ?? 0, health: 100, pendingApproval: false, newAchievements, newAchievementInfo: badgeInfo(tapperId, newAchievements), completionId: ids[0], rescued, team: true };
}

/** Reject one waiting completion (it's removed; no coins). Returns an error code or null. */
function rejectPendingCompletion(completionId: number, adminId?: number, reason: string | null = null): string | null {
  const completion = db.prepare('SELECT c.id, c.status, c.userId, c.teamupId, t.name AS taskName FROM task_completions c LEFT JOIN tasks t ON t.id = c.taskId WHERE c.id = ?')
    .get(completionId) as { id: number; status: string; userId: number; teamupId: number | null; taskName: string | null } | undefined;
  if (!completion) return 'not_found';
  if (completion.status !== 'pending') return 'completion_not_pending';
  // A team's chore is turned down for everyone, and goes back to the team to try again
  if (completion.teamupId) {
    const team = db.prepare("SELECT id, userId FROM task_completions WHERE teamupId = ? AND status = 'pending' AND id != ?").all(completion.teamupId, completion.id) as { id: number; userId: number }[];
    for (const other of team) {
      db.prepare('DELETE FROM task_completions WHERE id = ?').run(other.id);
      releaseRescue(other.id);
      if (adminId) void notifyChoreRejected(other.userId, adminId, completion.taskName ?? '', reason);
    }
    db.prepare("UPDATE teamups SET status = 'open' WHERE id = ?").run(completion.teamupId);
  }
  db.prepare('DELETE FROM task_completions WHERE id = ?').run(completion.id);
  releaseRescue(completion.id); // a rejected Rescue Mission is open again
  if (adminId) void notifyChoreRejected(completion.userId, adminId, completion.taskName ?? '', reason);
  return null;
}

// List tasks for a room
// The icon a chore's name suggests (the icon picker shows it while you type)
router.get('/tasks/icon-suggestion', (req: AuthRequest, res: Response) => {
  res.json({ iconKey: suggestTaskIcon(typeof req.query.name === 'string' ? req.query.name.slice(0, 200) : '') });
});

router.get('/rooms/:roomId/tasks', (req: AuthRequest, res: Response) => {
  const vacation = getGlobalVacation();
  const room = db.prepare('SELECT assignedUserId FROM rooms WHERE id = ? AND deletedAt IS NULL').get(req.params.roomId) as any;
  // Paused chores (ENH-1) only for parents (the room page and the plan sync, which must still match them)
  const seesPaused = ensureAdmin(req.userId);
  const tasks = (db.prepare('SELECT * FROM tasks WHERE roomId = ? AND archivedAt IS NULL AND deletedAt IS NULL').all(req.params.roomId) as any[])
    .filter((t) => !t.pausedAt || seesPaused);
  const myPins = new Set(pinnedTaskIds(req.userId!));
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
         WHERE tc.taskId IN (${taskIds.map(() => '?').join(',')}) AND tc.status = 'approved' AND ${daySql('tc.completedAt')} = ${daySql('?')}`
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
      ...scheduleFields(t, taskAssignedUserIds),
      isSeasonal: isSeasonalNow(t),
      pinned: myPins.has(t.id),
      assignedToChildren: !!t.assignedToChildren,
      assignedUserIds: taskAssignedUserIds,
      assignedUsers,
      effectiveAssignedUserIds,
      completedTodayBy: completedTodayByTask.get(t.id) || null,
      teamUp: teamUpInfo(t, req.userId!),
      assignmentMode: mode,
      sharedCompletions: (mode === 'shared' || mode === 'custom') ? (sharedCompletionsByTask.get(t.id) || []) : undefined,
      health: (() => {
        const taskVac = effectiveAssignedUserIds.length === 1
          ? resolveVacation(vacation, getUserVacation(effectiveAssignedUserIds[0]))
          : vacation;
        return taskHealth(t, taskVac);
      })(),
    };
  });

  res.json(tasksWithHealth);
});

/** Result of createTask / updateTask: the HTTP status and JSON body the routes send back. */
export interface TaskWriteResult { status: number; body: any }

/** Create a task in a room (POST /rooms/:roomId/tasks; also used by the CSV import). */
export function createTask(roomId: number | string, body: any): TaskWriteResult {
  const { name, notes, frequencyDays, effort, isSeasonal, health, iconKey, assignedToChildren, assignedUserIds, assignmentMode, assignedUserPercentages, onDemand, showInDashboard, customCoins, allowEarlyCompletion } = body;
  if (!name) return { status: 400, body: { error: 'name is required' } };

  const room = db.prepare('SELECT id FROM rooms WHERE id = ? AND deletedAt IS NULL').get(roomId);
  if (!room) return { status: 404, body: { error: 'Room not found' } };
  const schedule = readScheduleInput(body);
  if ('error' in schedule) return { status: 400, body: { error: schedule.error } };

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
    if (total !== 100) return { status: 400, body: { error: 'custom_percentages_must_sum_to_100' } };
  }

  const resolvedCustomCoins = (customCoins !== undefined && customCoins !== null && customCoins !== '')
    ? Math.max(1, Math.round(Number(customCoins))) : null;
  const repeat = parseRepeatLimit(body);
  if (repeat.error) return { status: 400, body: { error: repeat.error } };

  const result = db.prepare(
    `INSERT INTO tasks (roomId, name, notes, frequencyDays, effort, isSeasonal, lastCompletedAt, iconKey,
      assignedToChildren, assignmentMode, onDemand, showInDashboard, customCoins, allowEarlyCompletion, repeatLimit, repeatPeriod)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    roomId, name, notes || null, frequencyDays || 7, effort || 1, isSeasonal ? 1 : 0,
    lastCompletedAt, iconKey || suggestTaskIcon(name, null), resolvedAssignedToChildren,
    resolvedAssignmentMode, onDemand ? 1 : 0, showInDashboard ? 1 : 0,
    resolvedCustomCoins, allowEarlyCompletion ? 1 : 0,
    repeat.value?.repeatLimit ?? null, repeat.value?.repeatPeriod ?? null
  );

  const newTaskId = result.lastInsertRowid as number;
  // Season, set weekdays, rotation period (utils/schedule.ts)
  saveScheduleInput(newTaskId, schedule.values, health);

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
  const roomData = db.prepare('SELECT assignedUserId FROM rooms WHERE id = ? AND deletedAt IS NULL').get(roomId) as { assignedUserId: number | null } | undefined;
  if (roomData?.assignedUserId) {
    db.prepare('INSERT OR IGNORE INTO task_assignees (taskId, userId, coinPercentage) VALUES (?, ?, 0)')
      .run(newTaskId, roomData.assignedUserId);
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newTaskId);
  return { status: 201, body: task };
}

// Create task
router.post('/rooms/:roomId/tasks', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }
  const result = createTask(req.params.roomId as string, req.body);
  res.status(result.status).json(result.body);
});

/** Update a task (PUT /tasks/:id; also used by the bulk edit and the CSV import). Only given fields change. */
export function updateTask(id: number | string, body: any): TaskWriteResult {
  const { name, notes, frequencyDays, effort, isSeasonal, health, iconKey, assignedToChildren, assignedUserIds, assignmentMode, assignedUserPercentages, onDemand, showInDashboard, roomId, customCoins, allowEarlyCompletion } = body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND deletedAt IS NULL').get(id) as any;
  if (!task) return { status: 404, body: { error: 'Task not found' } };
  const schedule = readScheduleInput(body);
  if ('error' in schedule) return { status: 400, body: { error: schedule.error } };
  // Pause (ENH-1): only when the editor sends `paused` (the plan sync never does, so it can't switch it back on)
  let pause: { until: string | null } | null | undefined;
  if (body && 'paused' in body) {
    const until = body.paused ? readPausedUntil(body.pausedUntil) : null;
    if (until === 'invalid') return { status: 400, body: { error: 'invalid_paused_until' } };
    pause = body.paused ? { until } : null;
  }

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
    const targetRoom = db.prepare('SELECT id FROM rooms WHERE id = ? AND deletedAt IS NULL').get(roomId);
    if (!targetRoom) return { status: 404, body: { error: 'Target room not found' } };
    setClauses.push('roomId = ?'); params.push(Number(roomId));
  }
  if (customCoins !== undefined) {
    const resolved = (customCoins !== null && customCoins !== '') ? Math.max(1, Math.round(Number(customCoins))) : null;
    setClauses.push('customCoins = ?'); params.push(resolved);
  }
  if (allowEarlyCompletion !== undefined) { setClauses.push('allowEarlyCompletion = ?'); params.push(allowEarlyCompletion ? 1 : 0); }
  const repeat = parseRepeatLimit(body);
  if (repeat.error) return { status: 400, body: { error: repeat.error } };
  if (repeat.value) {
    setClauses.push('repeatLimit = ?', 'repeatPeriod = ?');
    params.push(repeat.value.repeatLimit, repeat.value.repeatPeriod);
  }

  // Validate custom mode percentages sum to 100
  if (resolvedMode === 'custom' && Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
    const total = assignedUserIds.reduce((s: number, uid: number) => s + ((assignedUserPercentages?.[Number(uid)] ?? 0)), 0);
    if (total !== 100) return { status: 400, body: { error: 'custom_percentages_must_sum_to_100' } };
  }

  if (setClauses.length > 0) {
    params.push(id);
    db.prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
  }
  saveScheduleInput(Number(id), schedule.values, health);
  if (pause) pauseTask(Number(id), pause.until);
  else if (pause === null) resumeTask(Number(id));

  // Update task_assignees if provided
  if (assignedUserIds !== undefined) {
    db.prepare('DELETE FROM task_assignees WHERE taskId = ?').run(id);
    if (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
      const insertAssignee = db.prepare('INSERT OR IGNORE INTO task_assignees (taskId, userId, coinPercentage) VALUES (?, ?, ?)');
      for (const uid of assignedUserIds) {
        const pct = (assignedUserPercentages && typeof assignedUserPercentages === 'object') ? (assignedUserPercentages[Number(uid)] ?? 0) : 0;
        insertAssignee.run(Number(id), Number(uid), pct);
      }
      // Clear assignedToChildren when specific users are set
      db.prepare('UPDATE tasks SET assignedToChildren = 0 WHERE id = ?').run(id);
      // (Re-)set rotation start user when switching to rotating mode
      const effectiveMode = resolvedMode ?? task.assignmentMode;
      if (effectiveMode === 'rotating') {
        db.prepare('UPDATE tasks SET rotationCurrentUserId = ? WHERE id = ?').run(Number(assignedUserIds[0]), id);
      }
    } else {
      // Cleared all assignees — clear rotation too
      db.prepare('UPDATE tasks SET rotationCurrentUserId = NULL WHERE id = ?').run(id);
    }
  }

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ? AND deletedAt IS NULL').get(id) as any;
  return { status: 200, body: { ...updated, assignedToChildren: !!updated.assignedToChildren } };
}

// Update task
router.put('/tasks/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }
  const result = updateTask(req.params.id as string, req.body);
  res.status(result.status).json(result.body);
});

// Delete task: it goes to the trash (restorable for 30 days, with its history)
router.delete('/tasks/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND deletedAt IS NULL').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const trashId = trashTask(Number(req.params.id), req.userId);
  res.json({ success: true, trashId });
});

// Bulk edit (Tasks page "Select"): the same change for many tasks, all or nothing.
const BULK_FIELDS = ['assignedUserIds', 'assignmentMode', 'customCoins', 'showInDashboard', 'onDemand', 'roomId', 'allowEarlyCompletion', 'effort', 'frequencyDays'];

class BulkEditError extends Error {
  constructor(public result: TaskWriteResult) { super('bulk edit failed'); }
}

router.post('/tasks/batch', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const ids = batchIds(req.body);
  if (!ids) return res.status(400).json({ error: 'ids must be a non-empty array of task ids' });
  const changes = req.body.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'changes must be an object with at least one field' });
  }
  const unsupported = Object.keys(changes).filter((k) => !BULK_FIELDS.includes(k));
  if (unsupported.length > 0) return res.status(400).json({ error: 'unsupported_fields', fields: unsupported });
  if (changes.assignedUserIds !== undefined && !(Array.isArray(changes.assignedUserIds)
    && changes.assignedUserIds.every((u: unknown) => db.prepare('SELECT 1 FROM users WHERE id = ?').get(Number(u))))) {
    return res.status(400).json({ error: 'assignedUserIds must list existing people' });
  }
  if (changes.customCoins != null && changes.customCoins !== '' && !(Number(changes.customCoins) >= 1)) {
    return res.status(400).json({ error: 'customCoins must be at least 1 (or null for the effort default)' });
  }
  const missing = ids.filter((id) => !db.prepare('SELECT 1 FROM tasks WHERE id = ? AND deletedAt IS NULL').get(id));
  if (missing.length > 0) return res.status(404).json({ error: 'Task not found', ids: missing });

  try {
    const tasks = db.transaction(() => ids.map((id) => {
      const current = db.prepare('SELECT assignmentMode FROM tasks WHERE id = ?').get(id) as { assignmentMode: string };
      // Custom splits belong to the old people; new people share the coins equally instead
      const own = changes.assignedUserIds !== undefined && changes.assignmentMode === undefined && current.assignmentMode === 'custom'
        ? { ...changes, assignmentMode: 'shared' } : changes;
      const result = updateTask(id, own);
      if (result.status !== 200) throw new BulkEditError(result);
      return result.body;
    }))();
    res.json({ updated: tasks.length, tasks });
  } catch (e) {
    if (e instanceof BulkEditError) return res.status(e.result.status).json(e.result.body);
    throw e;
  }
});

// Bulk delete: every task goes to the trash; returns the trash ids so the client can offer Undo
router.post('/tasks/batch-delete', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const ids = batchIds(req.body);
  if (!ids) return res.status(400).json({ error: 'ids must be a non-empty array of task ids' });
  const trashIds = db.transaction(() => ids.map((id) => trashTask(id, req.userId)).filter((t): t is number => t !== null))();
  res.json({ deleted: trashIds.length, trashIds });
});

// Get all overdue tasks (health <= 0, non-seasonal, non-onDemand)
router.get('/tasks/overdue', (req: AuthRequest, res: Response) => {
  const globalVac = getGlobalVacation();

  const tasks = db.prepare(`
    SELECT t.id, t.name, t.roomId, t.effort, t.frequencyDays, t.lastCompletedAt, t.isSeasonal, t.onDemand,
           t.seasonStartMonth, t.seasonEndMonth, t.scheduleWeekdays, t.scheduleMonthDay, t.scheduleMonthWeek,
           t.scheduleMonthWeekday, t.startsOn, t.createdAt,
           r.name as roomName
    FROM tasks t
    JOIN rooms r ON t.roomId = r.id
    WHERE t.isSeasonal = 0 AND t.onDemand = 0 AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND t.pausedAt IS NULL
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
    .filter((t: any) => !isSeasonalNow(t))
    .map((t: any) => {
      const assigneeIds = assigneesByTask.get(t.id) || [];
      const taskVac = assigneeIds.length === 1
        ? resolveVacation(globalVac, getUserVacation(assigneeIds[0]))
        : globalVac;
      const health = taskHealth(t, taskVac);
      if (health > 0) return null;
      const due = nextDueAt(t);
      const daysOverdue = due ? Math.max(0, (Date.now() - due.getTime()) / 86400000) : 999;
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

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND deletedAt IS NULL').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const result = db.prepare(
    `INSERT INTO tasks (roomId, name, notes, frequencyDays, effort, isSeasonal, lastCompletedAt, iconKey,
      assignedToChildren, assignmentMode, onDemand, showInDashboard, customCoins, allowEarlyCompletion, translationKey,
      repeatLimit, repeatPeriod)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    task.roomId, task.name, task.notes, task.frequencyDays, task.effort, task.isSeasonal,
    null, task.iconKey, task.assignedToChildren, task.assignmentMode, task.onDemand,
    task.showInDashboard, task.customCoins, task.allowEarlyCompletion, task.translationKey,
    task.repeatLimit ?? null, task.repeatPeriod ?? null
  );
  const newTaskId = result.lastInsertRowid as number;
  saveScheduleInput(newTaskId, {
    seasonStartMonth: task.seasonStartMonth, seasonEndMonth: task.seasonEndMonth,
    scheduleWeekdays: task.scheduleWeekdays, rotationPeriod: task.rotationPeriod,
    scheduleMonthDay: task.scheduleMonthDay, scheduleMonthWeek: task.scheduleMonthWeek,
    scheduleMonthWeekday: task.scheduleMonthWeekday, startsOn: task.startsOn,
    reminderTime: task.reminderTime, reminderDayBefore: task.reminderDayBefore,
    oneTime: task.oneTime, doBy: task.doBy, timerMinutes: task.timerMinutes, steps: task.steps,
  });

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

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND deletedAt IS NULL').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const now = new Date().toISOString();
  const completions = db.prepare(
    `SELECT id, userId, coinsEarned, status FROM task_completions WHERE taskId = ? AND ${daySql('completedAt')} = ${daySql('?')}`
  ).all(task.id, now) as Array<{ id: number; userId: number; coinsEarned: number; status: string }>;

  for (const completion of completions) {
    if (completion.status === 'approved') {
      db.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE id = ?')
        .run(completion.coinsEarned, completion.userId);
    }
  }

  db.prepare(
    `DELETE FROM task_completions WHERE taskId = ? AND ${daySql('completedAt')} = ${daySql('?')}`
  ).run(task.id, now);

  const effectiveFrequency = Math.max(1 / 24, Number(task.frequencyDays) || 7);
  const dirtyAt = hasFixedSchedule(task)
    ? lastCompletedAtForHealth(task, 0)
    : new Date(Date.now() - effectiveFrequency * 86400000).toISOString();
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
  if (task.rotationPeriod === 'week') return; // the turn follows the calendar week instead
  const rotationAssignees = db.prepare('SELECT userId FROM task_assignees WHERE taskId = ? ORDER BY userId ASC').all(task.id) as { userId: number }[];
  if (rotationAssignees.length > 1) {
    const currentIdx = rotationAssignees.findIndex(a => a.userId === (task.rotationCurrentUserId ?? completedByUserId));
    const nextIdx = (currentIdx + 1) % rotationAssignees.length;
    db.prepare('UPDATE tasks SET rotationCurrentUserId = ? WHERE id = ?').run(rotationAssignees[nextIdx].userId, task.id);
  }
}

/** "Done earlier…" (ENH-7): how many days back a chore can be logged late */
const LATE_DAYS = 7;

/** A late log's day from the request ('YYYY-MM-DD', 1–7 days ago), null for a normal tap, or an error. */
function readDoneOn(body: any): string | null | { error: string } {
  const v = body?.doneOn;
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: 'invalid_done_on' };
  const today = localDateStr();
  if (v >= today || v < localDateStr(startOfDay(new Date(), -LATE_DAYS))) return { error: 'invalid_done_on' };
  return v;
}

/** Nothing was done after this (the task's lastCompletedAt is this completion's). */
function isLatestCompletion(taskId: number, completedAt: string): boolean {
  return (db.prepare('SELECT lastCompletedAt FROM tasks WHERE id = ?').get(taskId) as { lastCompletedAt: string | null } | undefined)?.lastCompletedAt === completedAt;
}

/**
 * Was the chore due on a late log's day? Judged from the completion before that day, like the
 * "not yet due" check on a normal tap (per person when everyone does their own share).
 */
function dueOnDay(task: any, userId: number, when: string): boolean {
  const perPerson = task.assignmentMode === 'shared' || task.assignmentMode === 'custom';
  const prev = db.prepare(
    `SELECT completedAt FROM task_completions WHERE taskId = ? AND status IN ('approved', 'pending')
     AND ${daySql('completedAt')} < ${daySql('?')}${perPerson ? ' AND userId = ?' : ''}
     ORDER BY completedAt DESC LIMIT 1`
  ).get(...(perPerson ? [task.id, when, userId] : [task.id, when])) as { completedAt: string } | undefined;
  if (!prev || task.allowEarlyCompletion) return true;
  const endOfDay = endOfDayOf(when);
  const due = nextDueAt({ ...task, lastCompletedAt: prev.completedAt }, endOfDay);
  return !due || due.getTime() <= endOfDay.getTime();
}

// Complete task
router.post('/tasks/:id/complete', (req: AuthRequest, res: Response) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND deletedAt IS NULL').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Task not found' });
  // A one-time chore is done once: archived after that, and only one completion can wait for approval
  if (task.archivedAt) return res.status(409).json({ error: 'already_done' });
  if (task.pausedAt) return res.status(409).json({ error: 'paused' });
  if (task.oneTime && db.prepare("SELECT 1 FROM task_completions WHERE taskId = ? AND status = 'pending'").get(task.id)) {
    return res.status(409).json({ error: 'already_done_by_other' });
  }

  // Enforce assignment rules
  const room = db.prepare('SELECT assignedUserId FROM rooms WHERE id = ?').get(task.roomId) as any;
  const requester = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId) as any;
  const isAdminOrMember = requester?.role === 'admin' || requester?.role === 'member';

  // "Done earlier…": logged late for a past day
  const lateDay = readDoneOn(req.body);
  if (lateDay && typeof lateDay === 'object') return res.status(400).json(lateDay);
  if (lateDay) {
    const added = task.createdAt ? localDateStr(parseStored(task.createdAt)) : '';
    if (lateDay < added || (task.startsOn && lateDay < task.startsOn)) return res.status(409).json({ error: 'before_start' });
  }

  // Support completing on behalf of another user (admin/member only)
  const { onBehalfOfUserId } = req.body;
  if (onBehalfOfUserId && !isAdminOrMember) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const effectiveUserId = (onBehalfOfUserId && isAdminOrMember)
    ? Number(onBehalfOfUserId)
    : req.userId!;

  // Team-ups: once someone has joined, the chore belongs to the team for the day (a late log is for another day)
  const team = lateDay ? null : openTeamupFor(task.id);
  const teamClaimed = !!team && team.members.length >= 2;
  if (teamClaimed && !team!.members.some((m) => m.userId === effectiveUserId)) {
    return res.status(409).json({ error: 'claimed_by_team', names: team!.members.map((m) => m.displayName) });
  }

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
    const rotationUserId = rotationTurnUserId(task);
    if (rotationUserId && req.userId !== rotationUserId) {
      return res.status(409).json({ error: 'not_your_turn' });
    }
  }

  // Always use server timestamp — never trust client-supplied completedAt. A late log is stored at noon on its day.
  const now = new Date().toISOString();
  const when = lateDay ? dayAt(lateDay, 12).toISOString() : now;

  if (!task.onDemand) {
    // Block if effective user already completed this task today
    const alreadyDoneBySelf = db.prepare(
      `SELECT id FROM task_completions WHERE taskId = ? AND userId = ? AND status IN ('approved', 'pending') AND ${daySql('completedAt')} = ${daySql('?')}`
    ).get(task.id, effectiveUserId, when);
    if (alreadyDoneBySelf) {
      return res.status(409).json({ error: lateDay ? 'already_done_that_day' : 'already_done_today' });
    }

    if (task.assignmentMode !== 'shared' && task.assignmentMode !== 'custom') {
      // In 'first' mode: block if someone else already completed today
      const alreadyDoneByOther = db.prepare(
        `SELECT id FROM task_completions WHERE taskId = ? AND userId != ? AND status IN ('approved', 'pending') AND ${daySql('completedAt')} = ${daySql('?')}`
      ).get(task.id, effectiveUserId, when);
      if (alreadyDoneByOther) {
        return res.status(409).json({ error: 'already_done_by_other' });
      }
    }

    // Block if frequency cooldown hasn't elapsed (task not yet due); a one-time chore can be done any time
    if (lateDay) {
      if (!task.oneTime && !dueOnDay(task, effectiveUserId, when)) return res.status(409).json({ error: 'not_yet_due' });
    } else if (task.lastCompletedAt && !task.oneTime) {
      const globalVac = getGlobalVacation();
      const taskAssigneesForVac = db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?').all(task.id) as { userId: number }[];
      const taskVac = taskAssigneesForVac.length === 1
        ? resolveVacation(globalVac, getUserVacation(taskAssigneesForVac[0].userId))
        : globalVac;
      const currentHealth = taskHealth(task, taskVac);
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
  } else {
    // Anytime quests skip the cooldowns above, but may be capped per person per day/week
    const repeat = repeatLimitOf(task);
    if (repeat) {
      const count = countInPeriod(task.id, effectiveUserId, repeat.period, new Date(when));
      if (count >= repeat.limit) {
        return res.status(409).json({ error: 'repeat_limit_reached', limit: repeat.limit, period: repeat.period, count });
      }
    }
  }

  if (teamClaimed) {
    const note = typeof req.body.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 500) : null;
    return res.json(completeAsTeam(task, team!, effectiveUserId, isAdminOrMember, new Date().toISOString(), note));
  }

  // Fetch assignees once — needed for coin splitting and lastCompletedAt logic
  const taskAssignees = db.prepare('SELECT userId, coinPercentage FROM task_assignees WHERE taskId = ?').all(task.id) as { userId: number; coinPercentage: number }[];

  // Coin calculation based on assignment mode (skip when gamification disabled)
  const gamifRow = db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  const gamificationOn = gamifRow ? gamifRow.value !== '0' : true;

  // Today's Rescue Mission: the first completion of that chore claims its bonus (before coins are
  // counted, so two people finishing at once can't both get it). It and double coins are for doing it on the day, not late.
  const mission = lateDay ? null : todaysMission(new Date(now));
  const rescued = !!mission && mission.taskId === task.id && claimRescue(task.id, effectiveUserId, new Date(now));

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
    // Double coins event running for this chore or its room: the boosted amount is stored on the completion,
    // so a parent approving it later (Strict Mode) still pays the boost
    // The Rescue Mission doesn't stack with a double coins event: the bigger multiplier wins
    const multiplier = lateDay ? 1 : Math.max(boostMultiplierFor(task.id, task.roomId, new Date(now)), rescued ? mission!.multiplier : 1);
    if (multiplier > 1) coins = Math.round(coins * multiplier);
  }

  // Optional proof note (a photo can be attached afterwards with POST /completions/:id/photo)
  const note = typeof req.body.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 500) : null;

  const targetUser = db.prepare('SELECT role, displayName FROM users WHERE id = ?').get(effectiveUserId) as { role?: string; displayName?: string } | undefined;
  // requireApproval: integrations such as Home Assistant act for a child with a parent's login, so the
  // completion must still go through Strict Mode (upstream #142). In-app "who did it?" stays instant.
  const actingForChild = !!onBehalfOfUserId && req.body.requireApproval === true;
  const strictNeedsApproval = isStrictModeEnabled() && targetUser?.role === 'child' && (!isAdminOrMember || actingForChild);
  // A late log always waits for a parent, unless a parent logged it
  const lateNeedsApproval = !!lateDay && (requester?.role !== 'admin' || actingForChild);
  const loggedAt = lateDay ? now : null;

  if (strictNeedsApproval || lateNeedsApproval) {
    const pendingId = Number(db.prepare(
      "INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status, note, loggedAt) VALUES (?, ?, ?, ?, 'pending', ?, ?)"
    ).run(task.id, effectiveUserId, when, coins, note, loggedAt).lastInsertRowid);
    void notifyChoreWaiting(effectiveUserId, task.name);
    if (rescued) setRescueCompletion(mission!.day, pendingId);
    if (!lateDay) endTeamupsFor(task.id);
    return res.json({ coinsEarned: 0, health: task.health, pendingApproval: true, completionId: pendingId, rescued, late: !!lateDay });
  }

  const completionId = applyApprovedCompletion(task, task.id, effectiveUserId, coins, when, gamificationOn, {
    note, ...(lateDay ? { loggedAt: now, approvedAt: now, lateDay } : {}),
  });
  if (rescued) setRescueCompletion(mission!.day, completionId);
  if (!lateDay) endTeamupsFor(task.id);
  if (!lateDay || isLatestCompletion(task.id, when)) advanceRotation(task, effectiveUserId);

  const newAchievements = gamificationOn ? checkAndRecordNewAchievements(effectiveUserId) : [];
  if (newAchievements.length > 0) {
    void notifyAchievementUnlocksForUser(effectiveUserId);
  }
  // Titles for the pop-up: parent-made and secret badges aren't in the page data the app already has
  const health = lateDay ? taskHealth(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id) as ScheduledTask) : 100;
  res.json({ coinsEarned: coins, health, pendingApproval: false, newAchievements, newAchievementInfo: badgeInfo(effectiveUserId, newAchievements), completionId, rescued, late: !!lateDay });
});

router.get('/completions/pending', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const pending = db.prepare(`
    SELECT tc.id, tc.taskId, tc.userId, tc.completedAt, tc.coinsEarned, tc.note, tc.photoUrl, tc.teamupId, tc.loggedAt,
           t.name AS taskName, t.translationKey, t.roomId, t.assignmentMode, t.effort,
           r.name AS roomName, r.roomType,
           u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
    FROM task_completions tc
    JOIN tasks t ON tc.taskId = t.id
    JOIN rooms r ON t.roomId = r.id
    JOIN users u ON tc.userId = u.id
    WHERE tc.status = 'pending'
    ORDER BY tc.completedAt DESC
  `).all() as any[];

  res.json({ pending: groupTeamPending(pending) });
});

/** The optional one-line reason a parent gives when rejecting (sent to the kid). undefined = too long. */
function parseRejectReason(body: any): string | null | undefined {
  const reason = typeof body?.reason === 'string' ? body.reason.trim().replace(/\s+/g, ' ') : '';
  if (reason.length > 200) return undefined;
  return reason || null;
}

const PENDING_ERRORS: Record<string, number> = { not_found: 404, task_not_found: 404, completion_not_pending: 409 };

router.post('/completions/:completionId/approve', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }
  const extras = parseApprovalExtras(req.body);
  if ('error' in extras) return res.status(400).json(extras);
  const error = approvePendingCompletion(Number(req.params.completionId), req.userId!, extras);
  if (error) return res.status(PENDING_ERRORS[error]).json({ error: error === 'not_found' ? 'Completion not found' : error === 'task_not_found' ? 'Task not found' : error });
  res.json({ success: true });
});

router.delete('/completions/:completionId/reject', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) {
    return res.status(403).json({ error: 'Admin only' });
  }
  const reason = parseRejectReason(req.body);
  if (reason === undefined) return res.status(400).json({ error: 'reason_too_long' });
  const error = rejectPendingCompletion(Number(req.params.completionId), req.userId, reason);
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
  const reason = parseRejectReason(req.body);
  if (reason === undefined) return res.status(400).json({ error: 'reason_too_long' });
  const results = db.transaction(() => ids.map((id) => ({ id, error: rejectPendingCompletion(id, req.userId, reason) })))();
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

// Home "Your usual": pin a task for yourself (or unpin it)
router.post('/tasks/:id/pin', (req: AuthRequest, res: Response) => {
  if (!db.prepare('SELECT 1 FROM tasks WHERE id = ? AND deletedAt IS NULL').get(req.params.id)) return res.status(404).json({ error: 'Task not found' });
  db.prepare('INSERT OR IGNORE INTO task_pins (userId, taskId) VALUES (?, ?)').run(req.userId, req.params.id);
  res.json({ pinned: true });
});
router.delete('/tasks/:id/pin', (req: AuthRequest, res: Response) => {
  db.prepare('DELETE FROM task_pins WHERE userId = ? AND taskId = ?').run(req.userId, req.params.id);
  res.json({ pinned: false });
});

// Home "Maybe you forgot": hide a chore from that list for a few days (for yourself)
// Pause a chore (ENH-1, parents): it leaves every list until resumed; { until: 'YYYY-MM-DD' } resumes it that day
router.post('/tasks/:id/pause', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  if (!db.prepare('SELECT 1 FROM tasks WHERE id = ? AND deletedAt IS NULL AND archivedAt IS NULL').get(req.params.id)) return res.status(404).json({ error: 'Task not found' });
  const until = readPausedUntil(req.body?.until);
  if (until === 'invalid') return res.status(400).json({ error: 'invalid_paused_until' });
  pauseTask(Number(req.params.id), until);
  res.json(db.prepare('SELECT pausedAt, pausedUntil FROM tasks WHERE id = ?').get(req.params.id));
});

// Switch it back on; it comes back as if just done
router.delete('/tasks/:id/pause', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  if (!db.prepare('SELECT 1 FROM tasks WHERE id = ? AND deletedAt IS NULL').get(req.params.id)) return res.status(404).json({ error: 'Task not found' });
  resumeTask(Number(req.params.id));
  res.json(db.prepare('SELECT pausedAt, pausedUntil, lastCompletedAt FROM tasks WHERE id = ?').get(req.params.id));
});

router.post('/tasks/:id/snooze', (req: AuthRequest, res: Response) => {
  if (!db.prepare('SELECT 1 FROM tasks WHERE id = ? AND deletedAt IS NULL').get(req.params.id)) return res.status(404).json({ error: 'Task not found' });
  const days = Math.min(30, Math.max(1, Math.round(Number(req.body?.days) || 3)));
  const until = new Date(Date.now() + days * 86400000).toISOString();
  db.prepare('INSERT OR REPLACE INTO task_snoozes (userId, taskId, until) VALUES (?, ?, ?)').run(req.userId, req.params.id, until);
  res.json({ snoozedUntil: until });
});
router.delete('/tasks/:id/snooze', (req: AuthRequest, res: Response) => {
  db.prepare('DELETE FROM task_snoozes WHERE userId = ? AND taskId = ?').run(req.userId, req.params.id);
  res.json({ success: true });
});

// Cancel (undo) a task completion — admin only
// Undo a completion. A parent can undo any; the person who tapped Done can take it back while it
// still waits for approval. A team's completions are undone together and the team-up reopens.
router.delete('/completions/:completionId', (req: AuthRequest, res: Response) => {
  const completion = db.prepare(
    'SELECT id, taskId, userId, coinsEarned, status, teamupId FROM task_completions WHERE id = ?'
  ).get(req.params.completionId) as { id: number; taskId: number; userId: number; coinsEarned: number; status: string; teamupId: number | null } | undefined;
  if (!completion) return res.status(404).json({ error: 'Completion not found' });

  const rows = completion.teamupId
    ? db.prepare('SELECT id, userId, coinsEarned, status FROM task_completions WHERE teamupId = ?').all(completion.teamupId) as Array<{ id: number; userId: number; coinsEarned: number; status: string }>
    : [completion];
  if (!ensureAdmin(req.userId)) {
    const mine = rows.some((r) => r.userId === req.userId);
    if (!mine) return res.status(403).json({ error: 'Admin only' });
    if (completion.status !== 'pending') return res.status(409).json({ error: 'completion_not_pending' });
  }

  let coinsDeducted = 0;
  db.transaction(() => {
    for (const row of rows) {
      if (row.status === 'approved') {
        db.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE id = ?').run(row.coinsEarned, row.userId);
        coinsDeducted += row.coinsEarned;
      }
      // Delete the completion record (an undone Rescue Mission is open again)
      db.prepare('DELETE FROM task_completions WHERE id = ?').run(row.id);
      releaseRescue(row.id);
    }
    if (completion.teamupId) db.prepare("UPDATE teamups SET status = 'open' WHERE id = ?").run(completion.teamupId);

    // Update task.lastCompletedAt to the previous completion's completedAt (or NULL if none)
    const prev = db.prepare(
      "SELECT completedAt FROM task_completions WHERE taskId = ? AND status = 'approved' ORDER BY completedAt DESC LIMIT 1"
    ).get(completion.taskId) as { completedAt: string } | undefined;
    db.prepare('UPDATE tasks SET lastCompletedAt = ? WHERE id = ?')
      .run(prev?.completedAt || null, completion.taskId);
    // Undoing a one-time chore's completion brings it back
    if (!prev) db.prepare('UPDATE tasks SET archivedAt = NULL WHERE id = ? AND oneTime = 1').run(completion.taskId);
  })();

  res.json({ success: true, coinsDeducted });
});

export default router;
