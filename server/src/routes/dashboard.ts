import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { calculateHealth } from '../utils/health';
import { getGlobalVacation, getUserVacation, resolveVacation } from '../utils/adminHelpers';
import { syncPrimaryGoal } from '../utils/goals';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  // Refresh the cached goal first so it rolls over to the current week (and completes) on its own
  const myPrimaryGoal = syncPrimaryGoal(req.userId!);
  const user = db.prepare(
    'SELECT id, username, displayName, role, avatarColor, avatarType, avatarPreset, avatarPhotoUrl, coins, currentStreak, goalCoins, goalStartAt, goalEndAt, lastActiveDate, language FROM users WHERE id = ?'
  ).get(req.userId) as any;
  const vacation = getGlobalVacation();

  const rooms = db.prepare('SELECT * FROM rooms ORDER BY sortOrder, id').all() as any[];
  const allTasks: any[] = [];

  // Fetch all tasks in one query and group by roomId to avoid N+1
  const dbTasks = db.prepare('SELECT * FROM tasks').all() as any[];
  const tasksByRoom = new Map<number, any[]>();
  for (const t of dbTasks) {
    if (!tasksByRoom.has(t.roomId)) tasksByRoom.set(t.roomId, []);
    tasksByRoom.get(t.roomId)!.push(t);
  }

  // Batch-fetch today's completions for assignment display
  const nowIso = new Date().toISOString();
  const todayCompletions = db.prepare(
    `SELECT tc.taskId, tc.userId, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
     FROM task_completions tc
     JOIN users u ON tc.userId = u.id
     WHERE tc.status = 'approved' AND date(tc.completedAt, 'localtime') = date(?, 'localtime')`
  ).all(nowIso) as any[];
  const completedTodayByTask = new Map(todayCompletions.map((c: any) => [c.taskId, {
    userId: c.userId, displayName: c.displayName, avatarColor: c.avatarColor,
    avatarType: c.avatarType, avatarPreset: c.avatarPreset, avatarPhotoUrl: c.avatarPhotoUrl,
  }]));
  // Group all today's completions by taskId (for shared mode)
  const sharedCompletionsByTask = new Map<number, Array<{ userId: number; displayName: string }>>();
  for (const c of todayCompletions) {
    if (!sharedCompletionsByTask.has(c.taskId)) sharedCompletionsByTask.set(c.taskId, []);
    sharedCompletionsByTask.get(c.taskId)!.push({ userId: c.userId, displayName: c.displayName });
  }

  // The viewer's own completions still waiting for a parent, per task (Strict Mode)
  const myPendingByTask = new Map(
    (db.prepare("SELECT taskId, COUNT(*) AS n FROM task_completions WHERE userId = ? AND status = 'pending' GROUP BY taskId")
      .all(req.userId) as { taskId: number; n: number }[]).map((r) => [r.taskId, r.n])
  );

  // Batch-fetch all task assignees
  const allTaskAssignees = db.prepare(
    `SELECT ta.taskId, ta.userId, ta.coinPercentage, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
     FROM task_assignees ta
     JOIN users u ON ta.userId = u.id`
  ).all() as any[];
  const assigneesByTask = new Map<number, any[]>();
  for (const a of allTaskAssignees) {
    if (!assigneesByTask.has(a.taskId)) assigneesByTask.set(a.taskId, []);
    assigneesByTask.get(a.taskId)!.push(a);
  }

  const nowTs = Date.now();
  const roomsWithHealth = rooms.map((room) => {
    const tasks = tasksByRoom.get(room.id) || [];
    const tasksWithHealth = tasks.map((t) => {
      const taskAssigneesForTask = assigneesByTask.get(t.id) || [];
      const effectiveIds = room.assignedUserId
        ? [room.assignedUserId]
        : taskAssigneesForTask.map((a: any) => a.userId);
      const taskVac = effectiveIds.length === 1
        ? resolveVacation(vacation, getUserVacation(effectiveIds[0]))
        : vacation;
      const health = calculateHealth(t.lastCompletedAt, t.frequencyDays, taskVac.isVacation, taskVac.startDate);
      const safeFreq = Math.max(1 / 24, Number(t.frequencyDays) || 7);
      const dueDateTs = t.lastCompletedAt
        ? new Date(t.lastCompletedAt).getTime() + safeFreq * 86400000
        : nowTs;
      const dueInDays = t.onDemand ? 0 : Math.max(0, Math.floor((dueDateTs - nowTs) / 86400000));
      const taskWithHealth = {
        ...t,
        isSeasonal: !!t.isSeasonal,
        assignedToChildren: !!t.assignedToChildren,
        effectiveAssignedUserId: room.assignedUserId ?? t.assignedUserId ?? null,
        assignedUserIds: taskAssigneesForTask.map((a: any) => a.userId),
        assignedUsers: taskAssigneesForTask.map((a: any) => ({
          id: a.userId, displayName: a.displayName, avatarColor: a.avatarColor,
          avatarType: a.avatarType, avatarPreset: a.avatarPreset, avatarPhotoUrl: a.avatarPhotoUrl,
          coinPercentage: a.coinPercentage ?? 0,
        })),
        assignmentMode: t.assignmentMode || 'first',
        effectiveAssignedUserIds: effectiveIds,
        myPendingCount: myPendingByTask.get(t.id) || 0,
        sharedCompletions: sharedCompletionsByTask.get(t.id) || [],
        completedTodayBy: completedTodayByTask.get(t.id) || null,
        health,
        dueDate: new Date(dueDateTs).toISOString(),
        dueInDays,
        roomName: room.name,
        roomColor: room.color,
        roomAccent: room.accentColor,
      };
      allTasks.push(taskWithHealth);
      return taskWithHealth;
    });

    const nonSeasonal = tasksWithHealth.filter((t) => !t.isSeasonal);
    const forAvg = nonSeasonal.length > 0 ? nonSeasonal : tasksWithHealth;
    const totalEffort = forAvg.reduce((s, t) => s + t.effort, 0);
    const health = totalEffort > 0
      ? Math.round(forAvg.reduce((s, t) => s + t.health * t.effort, 0) / totalEffort)
      : 100;

    return { ...room, health, taskCount: tasks.length, criticalCount: tasksWithHealth.filter((t) => t.health < 30).length };
  });

  // House health
  const nonSeasonal = allTasks.filter((t) => !t.isSeasonal);
  const forHouseAvg = nonSeasonal.length > 0 ? nonSeasonal : allTasks;
  const totalEffort = forHouseAvg.reduce((s, t) => s + t.effort, 0);
  const houseHealth = totalEffort > 0
    ? Math.round(forHouseAvg.reduce((s, t) => s + t.health * t.effort, 0) / totalEffort)
    : 100;

  // Ready to complete: actually overdue (due date has passed), non-seasonal, non-on-demand
  const readyToComplete = allTasks
    .filter((t) => !t.isSeasonal && !t.onDemand && new Date(t.dueDate).getTime() <= nowTs)
    .sort((a, b) => a.health - b.health)
    .slice(0, 10);

  // Scheduled upcoming: not yet due (due date in the future), non-seasonal, non-on-demand
  const scheduledUpcoming = allTasks
    .filter((t) => !t.isSeasonal && !t.onDemand && new Date(t.dueDate).getTime() > nowTs)
    .sort((a, b) => a.dueInDays - b.dueInDays || a.health - b.health)
    .slice(0, 10);

  // On-demand quests: only those opted in via showInDashboard
  const onDemandQuests = allTasks
    .filter((t) => !t.isSeasonal && t.onDemand && t.showInDashboard)
    .sort((a, b) => a.health - b.health);

  // Backwards-compatible aliases
  const todaysQuests = [...readyToComplete, ...onDemandQuests];
  const nextTasks = scheduledUpcoming;

  // Completed today
  const completedToday = db.prepare(`
    SELECT tc.completedAt, tc.coinsEarned,
           t.id as taskId, t.name, t.translationKey, t.iconKey, t.roomId,
           r.name as roomName, r.roomType, r.color as roomColor, r.accentColor as roomAccent,
           u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
    FROM task_completions tc
    JOIN tasks t ON tc.taskId = t.id
    JOIN rooms r ON t.roomId = r.id
    JOIN users u ON tc.userId = u.id
    WHERE tc.status = 'approved'
      AND date(tc.completedAt, 'localtime') = date('now', 'localtime')
    ORDER BY tc.completedAt DESC
  `).all();

  // Recent activity
  const recentActivity = db.prepare(`
    SELECT tc.*, t.name as taskName, t.translationKey, t.roomId, r.name as roomName, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
    FROM task_completions tc
    JOIN tasks t ON tc.taskId = t.id
    JOIN rooms r ON t.roomId = r.id
    JOIN users u ON tc.userId = u.id
    WHERE tc.status = 'approved'
    ORDER BY tc.completedAt DESC
    LIMIT 5
  `).all();

  function getGoalCoinsWithinPeriod(targetUser: any): number {
    if (!targetUser.goalStartAt && !targetUser.goalEndAt) return targetUser.coins;
    const from = targetUser.goalStartAt || '1970-01-01T00:00:00.000Z';
    const to = targetUser.goalEndAt || '9999-12-31T23:59:59.999Z';
    const row = db.prepare(
      "SELECT COALESCE(SUM(coinsEarned), 0) as total FROM task_completions WHERE userId = ? AND status = 'approved' AND completedAt >= ? AND completedAt <= ?"
    ).get(targetUser.id, from, to) as { total: number };
    return row?.total || 0;
  }

  const myCurrentCoins = user.goalCoins ? getGoalCoinsWithinPeriod(user) : user.coins;
  const myGoal = user.goalCoins ? {
    goalCoins: user.goalCoins,
    currentCoins: myCurrentCoins,
    goalStartAt: user.goalStartAt || null,
    goalEndAt: user.goalEndAt || null,
    progress: Math.min(100, Math.round((myCurrentCoins / user.goalCoins) * 100)),
    completed: myPrimaryGoal?.status === 'completed',
  } : null;

  if (user.role === 'admin') {
    const listed = db.prepare("SELECT id FROM users WHERE (role != 'admin' OR isParticipant = 1) AND id != ?").all(user.id) as { id: number }[];
    for (const c of listed) syncPrimaryGoal(c.id);
  }
  const childrenGoals = user.role === 'admin'
    ? db.prepare(
      "SELECT id, displayName, role, coins, goalCoins, goalStartAt, goalEndAt, avatarColor, avatarType, avatarPreset, avatarPhotoUrl FROM users WHERE role != 'admin' OR isParticipant = 1 ORDER BY displayName"
    ).all().map((c: any) => {
      const currentCoins = c.goalCoins ? getGoalCoinsWithinPeriod(c) : c.coins;
      return {
        ...c,
        currentCoins,
        progress: c.goalCoins ? Math.min(100, Math.round((currentCoins / c.goalCoins) * 100)) : null,
      };
    })
    : [];

  const pendingRewardRequests = user.role === 'admin'
    ? db.prepare(
      `SELECT rr.id, rr.costCoins, rr.redeemedAt, rr.status, r.title, u.displayName
       FROM reward_redemptions rr
       JOIN rewards r ON rr.rewardId = r.id
       JOIN users u ON rr.userId = u.id
       WHERE rr.status = 'requested'
       ORDER BY rr.redeemedAt DESC
       LIMIT 12`
    ).all()
    : [];

  // Compute achievement badge tier per user (based on total approved completions)
  function getBadgeTier(completions: number): string | null {
    if (completions >= 500) return 'legend';
    if (completions >= 250) return 'platinum';
    if (completions >= 100) return 'gold';
    if (completions >= 25) return 'silver';
    if (completions >= 1) return 'bronze';
    return null;
  }
  const completionCounts = db.prepare(
    "SELECT userId, COUNT(*) as cnt FROM task_completions WHERE status = 'approved' GROUP BY userId"
  ).all() as { userId: number; cnt: number }[];
  const badges: Record<number, string | null> = {};
  for (const row of completionCounts) {
    badges[row.userId] = getBadgeTier(row.cnt);
  }

  res.json({
    houseHealth,
    rooms: roomsWithHealth,
    todaysQuests,
    readyToComplete,
    scheduledUpcoming,
    onDemandQuests,
    nextTasks,
    completedToday,
    myGoal,
    childrenGoals,
    pendingRewardRequests,
    currentUser: user,
    recentActivity,
    badges,
    vacation: { vacationMode: vacation.isVacation, vacationStartDate: vacation.startDate, vacationEndDate: vacation.endDate },
  });
});

export default router;
