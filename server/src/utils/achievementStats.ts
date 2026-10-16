import db from '../database';
import { buildAchievements, type AchievementStats } from './achievements';
import { isSeasonalNow, taskHealth } from './schedule';
import { getGlobalVacation, getUserVacation, resolveVacation } from './adminHelpers';
import { localDateStr } from './dateHelpers';

/**
 * Everything the badges are measured on, for one person. Shared by the Achievements page and the
 * unlock check after a completion.
 */
export function getAchievementStats(userId: number, now: Date = new Date()): AchievementStats | null {
  const user = db.prepare('SELECT id, currentStreak FROM users WHERE id = ?').get(userId) as { id: number; currentStreak: number } | undefined;
  if (!user) return null;
  const vacation = resolveVacation(getGlobalVacation(), getUserVacation(userId));

  const completions = (db.prepare("SELECT COUNT(*) AS n FROM task_completions WHERE userId = ? AND status = 'approved'").get(userId) as { n: number }).n;

  // Coins earned over all time (approved chores plus coins given, e.g. goal bonuses), not today's
  // balance: spending coins on a reward must not take a badge away
  const earnedFromTasks = (db.prepare("SELECT COALESCE(SUM(coinsEarned), 0) AS n FROM task_completions WHERE userId = ? AND status = 'approved'").get(userId) as { n: number }).n;
  const earnedFromAdjustments = (db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM coin_adjustments WHERE userId = ? AND amount > 0').get(userId) as { n: number }).n;

  // Rooms with health >= 70 ("clean") right now
  const tasksByRoom = new Map<number, any[]>();
  for (const t of db.prepare('SELECT * FROM tasks').all() as any[]) {
    if (!tasksByRoom.has(t.roomId)) tasksByRoom.set(t.roomId, []);
    tasksByRoom.get(t.roomId)!.push(t);
  }
  let roomsClean = 0;
  for (const tasks of tasksByRoom.values()) {
    const inSeason = tasks.filter((t) => !isSeasonalNow(t, now));
    const forAvg = inSeason.length > 0 ? inSeason : tasks;
    const totalEffort = forAvg.reduce((s, t) => s + t.effort, 0);
    const health = totalEffort > 0 ? Math.round(forAvg.reduce((s, t) => s + taskHealth(t, vacation, now) * t.effort, 0) / totalEffort) : 100;
    if (health >= 70) roomsClean++;
  }

  // This week (Monday 00:00 local) and the most recent weekend (Sat + Sun)
  const monday = new Date(now);
  monday.setDate(now.getDate() - (now.getDay() || 7) + 1);
  monday.setHours(0, 0, 0, 0);
  const weekly = (db.prepare("SELECT COUNT(*) AS n FROM task_completions WHERE userId = ? AND status = 'approved' AND completedAt >= ?").get(userId, monday.toISOString()) as { n: number }).n;
  const nowDay = now.getDay();
  const lastSat = new Date(now);
  lastSat.setDate(now.getDate() - (nowDay === 6 ? 0 : nowDay === 0 ? 1 : nowDay + 1));
  lastSat.setHours(0, 0, 0, 0);
  const lastSun = new Date(lastSat);
  lastSun.setDate(lastSat.getDate() + 1);
  lastSun.setHours(23, 59, 59, 999);
  const weekend = (db.prepare("SELECT COUNT(*) AS n FROM task_completions WHERE userId = ? AND status = 'approved' AND completedAt >= ? AND completedAt <= ?")
    .get(userId, lastSat.toISOString(), lastSun.toISOString()) as { n: number }).n;

  // Perfect weeks: full past weeks (Mon–Sun) with at least one completion every day
  const days = (db.prepare("SELECT date(completedAt, 'localtime') AS day FROM task_completions WHERE userId = ? AND status = 'approved' GROUP BY day ORDER BY day")
    .all(userId) as Array<{ day: string }>).map((r) => r.day);
  let perfectWeeks = 0;
  if (days.length > 0) {
    const daySet = new Set(days);
    const mondayOf = (d: Date) => { const out = new Date(d); out.setDate(out.getDate() - (out.getDay() || 7) + 1); out.setHours(0, 0, 0, 0); return out; };
    const check = mondayOf(new Date(`${days[0]}T00:00:00`));
    const thisMonday = mondayOf(now);
    while (check < thisMonday) {
      let all = true;
      for (let d = 0; d < 7 && all; d++) {
        const day = new Date(check);
        day.setDate(check.getDate() + d);
        all = daySet.has(localDateStr(day));
      }
      if (all) perfectWeeks++;
      check.setDate(check.getDate() + 7);
    }
  }

  return {
    completions,
    streak: user.currentStreak || 0,
    coins: earnedFromTasks + earnedFromAdjustments,
    rooms_clean: roomsClean,
    weekly_tasks: weekly,
    weekend_tasks: weekend,
    perfect_weeks: perfectWeeks,
  };
}

/** When each badge was first earned (user_achievement_notifications records every first unlock). */
export function earnedBadges(userId: number): Map<string, string> {
  const rows = db.prepare('SELECT achievementId, sentAt FROM user_achievement_notifications WHERE userId = ?').all(userId) as Array<{ achievementId: string; sentAt: string }>;
  // SQLite datetime('now') is UTC without a zone
  return new Map(rows.map((r) => [r.achievementId, r.sentAt.includes('T') ? r.sentAt : `${r.sentAt.replace(' ', 'T')}Z`]));
}

/**
 * A person's badges. One earned stays earned (with the date), even if the number it measures goes
 * down again later (a broken streak, rooms getting messy). With `record`, newly reached ones are saved
 * and their ids returned as `newlyEarned` (done after a completion, so the pop-up and notification go
 * out once); viewing only reads.
 */
export function achievementsFor(userId: number, options: { record?: boolean; now?: Date } = {}) {
  const stats = getAchievementStats(userId, options.now);
  if (!stats) return null;
  const live = buildAchievements(stats);
  const newlyEarned: string[] = [];
  if (options.record) {
    const save = db.prepare('INSERT OR IGNORE INTO user_achievement_notifications (userId, achievementId) VALUES (?, ?)');
    for (const a of live) if (a.unlocked && save.run(userId, a.id).changes > 0) newlyEarned.push(a.id);
  }
  const earned = earnedBadges(userId);
  const achievements = live.map((a) => {
    const unlockedAt = earned.get(a.id) ?? null;
    return unlockedAt ? { ...a, unlocked: true, progress: 100, unlockedAt } : { ...a, unlockedAt };
  });
  return { stats, achievements, newlyEarned };
}
