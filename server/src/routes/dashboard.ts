import { Router, Response } from 'express';
import { focusLine, focusModeFor, OPEN_PER_DAY } from '../utils/focus';
import { parseHomeLayout } from '../utils/homeLayout';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { calendarDaysUntil, beforeStart, hasFixedSchedule, isSeasonalNow, nextDueAt, oneTimeDeadline, scheduleFields, taskHealth } from '../utils/schedule';
import { getGlobalVacation, getUserVacation, hiddenRoomIdsFor, isStrictModeEnabled, resolveVacation } from '../utils/adminHelpers';
import { syncPrimaryGoal } from '../utils/goals';
import { repeatCountsFor } from '../utils/repeatLimits';
import { boostTaskNames, getActiveBoosts } from '../utils/boosts';
import { achievementsFor } from '../utils/achievementStats';
import { forgottenTasks, usualTasks } from '../utils/homeSections';
import { rescueCandidates, todaysMission } from '../utils/rescue';
import { getFeatures, holidaysOff, isFeatureOn } from '../utils/features';
import { MAX_SHIELDS, SHIELD_EVERY, shieldPrice, shieldsOn } from '../utils/streaks';
import { cheersFor } from '../utils/cheers';
import { cosmetics, unlocksFor } from '../utils/unlocks';
import { mascotFor } from '../utils/mascot';
import { groupTeamPending, teamUpInfo, teamupsFor } from '../utils/teamups';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  // Refresh the cached goal first so it rolls over to the current week (and completes) on its own
  const myPrimaryGoal = syncPrimaryGoal(req.userId!);
  const user = db.prepare(
    'SELECT id, username, displayName, role, avatarColor, avatarType, avatarPreset, avatarPhotoUrl, coins, currentStreak, streakShields, goalCoins, goalStartAt, goalEndAt, lastActiveDate, language, taskView, kidMode, focusMode, homeLayout FROM users WHERE id = ?'
  ).get(req.userId) as any;
  const vacation = getGlobalVacation();

  // Kids don't see other people's private rooms (when the setting is on)
  const hiddenRooms = hiddenRoomIdsFor(req.userId);
  const rooms = (db.prepare('SELECT * FROM rooms WHERE deletedAt IS NULL ORDER BY sortOrder, id').all() as any[]).filter((r) => !hiddenRooms.has(r.id));
  const allTasks: any[] = [];

  // Fetch all tasks in one query and group by roomId to avoid N+1
  const dbTasks = db.prepare('SELECT * FROM tasks WHERE archivedAt IS NULL AND deletedAt IS NULL AND pausedAt IS NULL').all() as any[];
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
    (db.prepare("SELECT taskId, COUNT(*) AS n, MAX(id) AS lastId FROM task_completions WHERE userId = ? AND status = 'pending' GROUP BY taskId")
      .all(req.userId) as { taskId: number; n: number; lastId: number }[]).map((r) => [r.taskId, r])
  );
  // Anytime quests with a repeat limit: how many times the viewer did each this day/week
  const myRepeatCounts = repeatCountsFor(req.userId, dbTasks);

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
      // Rolling interval or set weekdays, and the season (utils/schedule.ts)
      const health = taskHealth(t, taskVac);
      const dueDateTs = nextDueAt(t)?.getTime() ?? nowTs;
      const dueInDays = t.onDemand ? 0
        : hasFixedSchedule(t) || beforeStart(t) ? calendarDaysUntil(new Date(dueDateTs))
        : Math.max(0, Math.floor((dueDateTs - nowTs) / 86400000));
      const taskWithHealth = {
        ...t,
        ...scheduleFields(t, taskAssigneesForTask.map((a: any) => a.userId)),
        isSeasonal: isSeasonalNow(t),
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
        myPendingCount: myPendingByTask.get(t.id)?.n || 0,
        // The latest one, so its owner can take it back (FIX-3)
        myPendingId: myPendingByTask.get(t.id)?.lastId ?? null,
        myRepeatCount: myRepeatCounts.get(t.id) || 0,
        sharedCompletions: sharedCompletionsByTask.get(t.id) || [],
        completedTodayBy: completedTodayByTask.get(t.id) || null,
        teamUp: teamUpInfo(t, req.userId!),
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

    // One-time chores don't count toward health
    const regular = tasksWithHealth.filter((t) => !t.oneTime);
    const nonSeasonal = regular.filter((t) => !t.isSeasonal);
    const forAvg = nonSeasonal.length > 0 ? nonSeasonal : regular;
    const totalEffort = forAvg.reduce((s, t) => s + t.effort, 0);
    const health = totalEffort > 0
      ? Math.round(forAvg.reduce((s, t) => s + t.health * t.effort, 0) / totalEffort)
      : 100;

    return { ...room, health, taskCount: tasks.length, criticalCount: tasksWithHealth.filter((t) => t.health < 30).length };
  });

  // House health
  const regularTasks = allTasks.filter((t) => !t.oneTime);
  const nonSeasonal = regularTasks.filter((t) => !t.isSeasonal);
  const forHouseAvg = nonSeasonal.length > 0 ? nonSeasonal : regularTasks;
  const totalEffort = forHouseAvg.reduce((s, t) => s + t.effort, 0);
  const houseHealth = totalEffort > 0
    ? Math.round(forHouseAvg.reduce((s, t) => s + t.health * t.effort, 0) / totalEffort)
    : 100;

  // Ready to complete: actually overdue (due date has passed), non-seasonal, non-on-demand
  const readyToComplete = allTasks
    .filter((t) => !t.isSeasonal && !t.onDemand && !t.oneTime && new Date(t.dueDate).getTime() <= nowTs)
    .sort((a, b) => a.health - b.health)
    .slice(0, 10);

  // Scheduled upcoming: not yet due (due date in the future), non-seasonal, non-on-demand
  const scheduledUpcoming = allTasks
    .filter((t) => !t.isSeasonal && !t.onDemand && !t.oneTime && new Date(t.dueDate).getTime() > nowTs)
    .sort((a, b) => a.dueInDays - b.dueInDays || a.health - b.health)
    .slice(0, 10);

  // On-demand quests: only those opted in via showInDashboard
  const onDemandQuests = allTasks
    .filter((t) => !t.isSeasonal && t.onDemand && t.showInDashboard)
    .sort((a, b) => a.health - b.health);

  // One-time chores still to do (the To-do card): overdue first, then by do-by date, then oldest
  const todoQuests = !getFeatures().todos ? [] : allTasks
    .filter((t) => t.oneTime)
    .map((t) => ({ ...t, overdue: Date.now() > oneTimeDeadline(t).getTime() }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || String(a.doBy ?? '9999').localeCompare(String(b.doBy ?? '9999')) || a.id - b.id);

  // Your usual (pins, then what this person does most) and Maybe you forgot (overdue by a whole interval)
  // Today's Rescue Mission: shown to the people who can do that chore (parents always), with its
  // own card, so it's left out of "Maybe you forgot"
  const missionRow = todaysMission();
  const missionTask = missionRow ? allTasks.find((t) => t.id === missionRow.taskId) ?? null : null;
  const missionIds: number[] = missionTask?.effectiveAssignedUserIds ?? [];
  const missionVisible = user.role === 'admin' || (missionTask ? missionIds.length === 0 || missionIds.includes(user.id) : false);
  const rescueMission = missionRow && missionVisible && (missionTask || missionRow.completedBy) ? {
    day: missionRow.day,
    taskId: missionRow.taskId,
    multiplier: missionRow.multiplier,
    completedBy: missionRow.completedBy,
    completedByName: missionRow.completedBy ? (db.prepare('SELECT displayName FROM users WHERE id = ?').get(missionRow.completedBy) as { displayName: string } | undefined)?.displayName ?? null : null,
    taskName: missionTask?.name ?? (db.prepare('SELECT name FROM tasks WHERE id = ?').get(missionRow.taskId) as { name: string } | undefined)?.name ?? null,
    task: missionTask,
  } : null;
  // Parents can choose another one
  const rescueChoices = user.role === 'admin' && isFeatureOn('rescue') ? rescueCandidates().slice(0, 8).map(({ id, name }) => ({ id, name })) : [];

  // Extras a family can switch off (Settings → Features)
  const features = getFeatures();
  const usualQuests = features.usual ? usualTasks(allTasks, req.userId!) : [];
  const forgottenQuests = features.forgot ? forgottenTasks(allTasks, req.userId!, new Date(), new Set(missionRow?.taskId ? [missionRow.taskId] : [])) : [];

  const focusMode = features.focus ? focusModeFor(user) : 'off';
  const focus = focusMode === 'off' ? null
    : { mode: focusMode, openPerDay: OPEN_PER_DAY, ...focusLine(allTasks, user.id, missionRow?.taskId ?? null) };

  // Backwards-compatible aliases
  const todaysQuests = [...readyToComplete, ...onDemandQuests];
  const nextTasks = scheduledUpcoming;

  // Completed today
  const completedToday = db.prepare(`
    SELECT tc.id AS completionId, tc.userId, tc.completedAt, tc.coinsEarned, tc.approvalNote,
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
  `).all() as any[];
  // Cheers on today's chores
  if (isFeatureOn('cheers')) {
    const cheers = cheersFor(completedToday.map((c) => c.completionId), req.userId!);
    for (const c of completedToday) c.cheers = cheers.get(c.completionId) ?? { counts: [], mine: null };
  }

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
    goalId: myPrimaryGoal?.id ?? null,
    title: myPrimaryGoal?.title ?? null,
    rewardCoins: myPrimaryGoal?.rewardCoins ?? 0,
  } : null;

  // Each child's current goal, so parents can see who reached it (and earned the bonus)
  const childPrimaryGoals = new Map<number, ReturnType<typeof syncPrimaryGoal>>([[user.id, myPrimaryGoal]]);
  if (user.role === 'admin') {
    const listed = db.prepare("SELECT id FROM users WHERE (role != 'admin' OR isParticipant = 1) AND id != ?").all(user.id) as { id: number }[];
    for (const c of listed) childPrimaryGoals.set(c.id, syncPrimaryGoal(c.id));
  }
  const childrenGoals = user.role === 'admin'
    ? db.prepare(
      "SELECT id, displayName, role, coins, goalCoins, goalStartAt, goalEndAt, avatarColor, avatarType, avatarPreset, avatarPhotoUrl FROM users WHERE role != 'admin' OR isParticipant = 1 ORDER BY displayName"
    ).all().map((c: any) => {
      const currentCoins = c.goalCoins ? getGoalCoinsWithinPeriod(c) : c.coins;
      const primary = childPrimaryGoals.get(c.id);
      return {
        ...c,
        currentCoins,
        progress: c.goalCoins ? Math.min(100, Math.round((currentCoins / c.goalCoins) * 100)) : null,
        goalCompleted: primary?.status === 'completed',
        goalRewardCoins: primary?.rewardCoins ?? 0,
      };
    })
    : [];

  // Chores waiting for a parent's approval (Strict Mode), newest first
  const pendingCompletions = user.role === 'admin'
    ? db.prepare(`
      SELECT tc.id, tc.taskId, tc.userId, tc.completedAt, tc.coinsEarned, tc.note, tc.photoUrl, tc.teamupId, tc.loggedAt,
             t.name AS taskName, t.translationKey, t.roomId, t.iconKey, r.name AS roomName, r.roomType, r.color AS roomColor,
             u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
      FROM task_completions tc
      JOIN tasks t ON tc.taskId = t.id
      JOIN rooms r ON t.roomId = r.id
      JOIN users u ON tc.userId = u.id
      WHERE tc.status = 'pending'
      ORDER BY tc.completedAt DESC
      LIMIT 100`).all() as any[]
    : [];
  const pendingCompletionsGrouped = groupTeamPending(pendingCompletions);

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
    todoQuests,
    usualQuests,
    forgottenQuests,
    rescueMission,
    rescueChoices,
    // One thing at a time: how this person sees it, and today's line (NEW-2)
    focus,
    features,
    holidaysOff: holidaysOff(),
    // Everyone's frame, title and celebration (avatars and names), and what your next level unlocks
    cosmetics: cosmetics(),
    // Today's team-ups you're on or could join
    teamups: features.teamups ? teamupsFor(req.userId!) : [],
    // The house mascot (Settings → Features)
    mascot: features.mascot ? mascotFor({ houseHealth, rooms: roomsWithHealth, rescueDone: !!missionRow?.completedBy }) : null,
    nextUnlock: unlocksFor(req.userId!).next,
    onDemandQuests,
    nextTasks,
    completedToday,
    myGoal,
    childrenGoals,
    pendingRewardRequests,
    pendingCompletions: pendingCompletionsGrouped,
    strictMode: isStrictModeEnabled(),
    // Double coins events running now (Home shows a banner and the boosted amounts)
    coinBoosts: getActiveBoosts().map((b) => ({ id: b.id, title: b.title, multiplier: b.multiplier, startAt: b.startAt, endAt: b.endAt, roomIds: b.roomIds, taskIds: b.taskIds, taskNames: boostTaskNames(b) })),
    currentUser: { ...user, homeLayout: parseHomeLayout(user.homeLayout) },
    recentActivity,
    badges,
    // The viewer's level and the closest badge still to earn ("Next up")
    ...(() => {
      const gamificationOn = (db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined)?.value !== '0';
      const mine = gamificationOn ? achievementsFor(req.userId!) : null;
      return { myLevel: features.levels ? mine?.level ?? null : null, nextBadge: features.nextBadge ? mine?.nextBadge ?? null : null };
    })(),
    vacation: { vacationMode: vacation.isVacation, vacationStartDate: vacation.startDate, vacationEndDate: vacation.endDate },
    // Streak shields: null when they're off (or gamification is)
    shields: shieldsOn() ? { price: shieldPrice(), max: MAX_SHIELDS, every: SHIELD_EVERY } : null,
  });
});

export default router;
