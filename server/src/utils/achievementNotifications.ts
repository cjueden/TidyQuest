import db from '../database';
import { buildAchievements } from './achievements';
import { isNotificationTypeEnabled, sendNotification } from './notifications';
import { isSeasonalNow, taskHealth } from './schedule';
import { getGlobalVacation, getUserVacation, resolveVacation } from './adminHelpers';
import { localDateStr } from './dateHelpers';

function getUserAchievementStats(userId: number) {
  const user = db.prepare(
    'SELECT id, displayName, coins, currentStreak FROM users WHERE id = ?'
  ).get(userId) as any;
  if (!user) return null;
  const globalVac = getGlobalVacation();
  const vacation = resolveVacation(globalVac, getUserVacation(userId));

  const completionsRow = db.prepare("SELECT COUNT(*) as count FROM task_completions WHERE userId = ? AND status = 'approved'").get(userId) as { count: number };

  const rooms = db.prepare('SELECT id FROM rooms').all() as Array<{ id: number }>;
  let roomsClean = 0;
  for (const room of rooms) {
    const tasks = db.prepare('SELECT effort, isSeasonal, lastCompletedAt, frequencyDays, seasonStartMonth, seasonEndMonth, scheduleWeekdays FROM tasks WHERE roomId = ?').all(room.id) as Array<{
      effort: number;
      isSeasonal: number;
      lastCompletedAt: string | null;
      frequencyDays: number;
      seasonStartMonth: number | null;
      seasonEndMonth: number | null;
      scheduleWeekdays: number | null;
    }>;
    if (tasks.length === 0) continue;
    const nonSeasonal = tasks.filter((t) => !isSeasonalNow(t));
    const forAvg = nonSeasonal.length > 0 ? nonSeasonal : tasks;
    const totalEffort = forAvg.reduce((s, t) => s + t.effort, 0);
    const health = totalEffort > 0
      ? Math.round(forAvg.reduce((s, t) => s + taskHealth(t, vacation) * t.effort, 0) / totalEffort)
      : 100;
    if (health >= 70) roomsClean++;
  }

  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);
  const weeklyRow = db.prepare(
    "SELECT COUNT(*) as count FROM task_completions WHERE userId = ? AND status = 'approved' AND completedAt >= ?"
  ).get(userId, monday.toISOString()) as { count: number };

  // Tasks completed on the most recent weekend (Sat+Sun)
  const nowDay = now.getDay(); // 0=Sun, 6=Sat
  const daysToLastSat = nowDay === 6 ? 0 : nowDay === 0 ? 1 : nowDay + 1;
  const lastSat = new Date(now);
  lastSat.setDate(now.getDate() - daysToLastSat);
  lastSat.setHours(0, 0, 0, 0);
  const lastSun = new Date(lastSat);
  lastSun.setDate(lastSat.getDate() + 1);
  lastSun.setHours(23, 59, 59, 999);
  const weekendRow = db.prepare(
    "SELECT COUNT(*) as count FROM task_completions WHERE userId = ? AND status = 'approved' AND completedAt >= ? AND completedAt <= ?"
  ).get(userId, lastSat.toISOString(), lastSun.toISOString()) as { count: number };

  const allCompletions = db.prepare(
    "SELECT date(completedAt, 'localtime') as day FROM task_completions WHERE userId = ? AND status = 'approved' GROUP BY date(completedAt, 'localtime') ORDER BY day"
  ).all(userId) as Array<{ day: string }>;

  const parseDayLocal = (day: string): Date => new Date(`${day}T00:00:00`);
  const mondayOfLocalDate = (d: Date): Date => {
    const out = new Date(d);
    const dow = out.getDay() || 7;
    out.setDate(out.getDate() - dow + 1);
    out.setHours(0, 0, 0, 0);
    return out;
  };

  let perfectWeeks = 0;
  if (allCompletions.length > 0) {
    const daySet = new Set(allCompletions.map((c) => c.day));
    const firstDay = parseDayLocal(allCompletions[0].day);
    const startMonday = mondayOfLocalDate(firstDay);
    const thisMonday = mondayOfLocalDate(now);
    const checkDate = new Date(startMonday);

    while (checkDate < thisMonday) {
      let allDays = true;
      for (let d = 0; d < 7; d++) {
        const checkDay = new Date(checkDate);
        checkDay.setDate(checkDate.getDate() + d);
        const dayStr = localDateStr(checkDay);
        if (!daySet.has(dayStr)) {
          allDays = false;
          break;
        }
      }
      if (allDays) perfectWeeks++;
      checkDate.setDate(checkDate.getDate() + 7);
    }
  }

  return {
    userDisplayName: String(user.displayName || 'User'),
    achievements: buildAchievements({
      completions: completionsRow.count,
      streak: user.currentStreak || 0,
      coins: user.coins || 0,
      rooms_clean: roomsClean,
      weekly_tasks: weeklyRow.count,
      weekend_tasks: weekendRow.count,
      perfect_weeks: perfectWeeks,
    }),
  };
}

/**
 * Synchronously checks which achievements are newly unlocked for a user,
 * records them in user_achievement_notifications, and returns their IDs.
 * Safe to call inline before sending a response.
 */
export function checkAndRecordNewAchievements(userId: number): string[] {
  const gamifRow = db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  if (gamifRow && gamifRow.value === '0') return [];
  const stats = getUserAchievementStats(userId);
  if (!stats) return [];
  const newIds: string[] = [];
  for (const ach of stats.achievements) {
    if (!ach.unlocked) continue;
    const inserted = db.prepare(
      'INSERT OR IGNORE INTO user_achievement_notifications (userId, achievementId) VALUES (?, ?)'
    ).run(userId, ach.id);
    if (inserted.changes > 0) newIds.push(ach.id);
  }
  return newIds;
}

/**
 * Async: sends Telegram/ntfy notifications for newly unlocked achievements.
 * Calls checkAndRecordNewAchievements internally.
 */
export async function notifyAchievementUnlocksForUser(userId: number): Promise<void> {
  if (!isNotificationTypeEnabled('achievementUnlocked')) {
    checkAndRecordNewAchievements(userId);
    return;
  }
  const newIds = checkAndRecordNewAchievements(userId);
  if (newIds.length === 0) return;
  const user = db.prepare('SELECT displayName FROM users WHERE id = ?').get(userId) as { displayName: string } | undefined;
  const name = user?.displayName || 'User';
  for (const id of newIds) {
    await sendNotification(`🏆 ${name} unlocked an achievement: ${id}`);
  }
}
