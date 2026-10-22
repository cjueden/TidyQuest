import db from '../database';
import { ACHIEVEMENTS, buildAchievements, type AchievementStats } from './achievements';
import { badgeAppliesTo, customBadgeKey, customBadgeValue, levelFor, listCustomBadges, longestWeekRun } from './badges';
import { tr } from './i18n';
import { isSeasonalNow, taskHealth } from './schedule';
import { getGlobalVacation, getUserVacation, resolveVacation } from './adminHelpers';
import { localDateStr } from './dateHelpers';
import { boostCovers, toBoost } from './boosts';
import { startOfLocalWeek, weekOfSql, weekStartDay } from './periods';

/**
 * Everything the badges are measured on, for one person. Shared by the Achievements page and the
 * unlock check after a completion.
 */
export function getAchievementStats(userId: number, now: Date = new Date()): AchievementStats | null {
  const user = db.prepare('SELECT id, currentStreak, birthday FROM users WHERE id = ?').get(userId) as { id: number; currentStreak: number; birthday: string | null } | undefined;
  if (!user) return null;
  const vacation = resolveVacation(getGlobalVacation(), getUserVacation(userId));

  const completions = (db.prepare("SELECT COUNT(*) AS n FROM task_completions WHERE userId = ? AND status = 'approved'").get(userId) as { n: number }).n;

  // Coins earned over all time (approved chores plus coins given, e.g. goal bonuses), not today's
  // balance: spending coins on a reward must not take a badge away
  const earnedFromTasks = (db.prepare("SELECT COALESCE(SUM(coinsEarned), 0) AS n FROM task_completions WHERE userId = ? AND status = 'approved'").get(userId) as { n: number }).n;
  const earnedFromAdjustments = (db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM coin_adjustments WHERE userId = ? AND amount > 0').get(userId) as { n: number }).n;

  // Rooms with health >= 70 ("clean") right now
  const tasksByRoom = new Map<number, any[]>();
  for (const t of db.prepare('SELECT * FROM tasks WHERE archivedAt IS NULL AND deletedAt IS NULL AND pausedAt IS NULL AND oneTime = 0').all() as any[]) {
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

  // This week (its first day 00:00 local) and the most recent weekend (Sat + Sun)
  const first = weekStartDay();
  const weekStart = startOfLocalWeek(now, first);
  const weekly = (db.prepare("SELECT COUNT(*) AS n FROM task_completions WHERE userId = ? AND status = 'approved' AND completedAt >= ?").get(userId, weekStart.toISOString()) as { n: number }).n;
  const nowDay = now.getDay();
  const lastSat = new Date(now);
  lastSat.setDate(now.getDate() - (nowDay === 6 ? 0 : nowDay === 0 ? 1 : nowDay + 1));
  lastSat.setHours(0, 0, 0, 0);
  const lastSun = new Date(lastSat);
  lastSun.setDate(lastSat.getDate() + 1);
  lastSun.setHours(23, 59, 59, 999);
  const weekend = (db.prepare("SELECT COUNT(*) AS n FROM task_completions WHERE userId = ? AND status = 'approved' AND completedAt >= ? AND completedAt <= ?")
    .get(userId, lastSat.toISOString(), lastSun.toISOString()) as { n: number }).n;

  // Perfect weeks: full past weeks with at least one completion every day
  const days = (db.prepare("SELECT date(completedAt, 'localtime') AS day FROM task_completions WHERE userId = ? AND status = 'approved' GROUP BY day ORDER BY day")
    .all(userId) as Array<{ day: string }>).map((r) => r.day);
  let perfectWeeks = 0;
  if (days.length > 0) {
    const daySet = new Set(days);
    const check = startOfLocalWeek(new Date(`${days[0]}T00:00:00`), first);
    while (check < weekStart) {
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

  const count = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(userId, ...args) as { n: number }).n;

  // Rewards bought (requested or approved; refunded ones don't count) and chip-ins to a family pot
  const rewardsRedeemed = count("SELECT COUNT(*) AS n FROM reward_redemptions WHERE userId = ? AND status IN ('requested', 'approved')");
  const potContributions = count('SELECT COUNT(*) AS n FROM reward_contributions WHERE userId = ?');
  const cheersGiven = count('SELECT COUNT(*) AS n FROM cheers WHERE fromUserId = ?');
  const teamUps = count("SELECT COUNT(DISTINCT teamupId) AS n FROM task_completions WHERE userId = ? AND status = 'approved' AND teamupId IS NOT NULL");
  const cheersReceived = count('SELECT COUNT(*) AS n FROM cheers ch JOIN task_completions c ON c.id = ch.completionId WHERE c.userId = ?');

  // Chores done while a double coins event covered them
  const boosts = (db.prepare('SELECT * FROM coin_boosts').all() as any[]).map(toBoost);
  let boostCompletions = 0;
  if (boosts.length > 0) {
    const done = db.prepare("SELECT c.completedAt, c.taskId, t.roomId FROM task_completions c JOIN tasks t ON t.id = c.taskId WHERE c.userId = ? AND c.status = 'approved'")
      .all(userId) as Array<{ completedAt: string; taskId: number; roomId: number }>;
    const windows = boosts.map((b) => ({ from: Date.parse(b.startAt), to: Date.parse(b.endAt), b }));
    boostCompletions = done.filter((c) => {
      const at = Date.parse(c.completedAt);
      return windows.some((w) => at >= w.from && at < w.to && boostCovers(w.b, c.taskId, c.roomId));
    }).length;
  }

  // Weekly goals reached in a row (the longest run)
  const goalWeeks = longestWeekRun((db.prepare(
    `SELECT ${weekOfSql('startAt', first)} AS week FROM user_goals WHERE userId = ? AND status = 'completed' AND startAt IS NOT NULL`
  ).all(userId) as Array<{ week: string }>).map((r) => r.week));

  // Secret ones: every scheduled chore of a room (3 or more) done in one day, chores before 8 am,
  // and a chore on your birthday
  const roomSizes = new Map((db.prepare('SELECT roomId, COUNT(*) AS n FROM tasks WHERE onDemand = 0 AND oneTime = 0 AND archivedAt IS NULL AND deletedAt IS NULL AND pausedAt IS NULL GROUP BY roomId').all() as Array<{ roomId: number; n: number }>).map((r) => [r.roomId, r.n]));
  const roomSweeps = (db.prepare(
    `SELECT t.roomId, COUNT(DISTINCT c.taskId) AS n FROM task_completions c JOIN tasks t ON t.id = c.taskId
     WHERE c.userId = ? AND c.status = 'approved' AND t.onDemand = 0 GROUP BY date(c.completedAt, 'localtime'), t.roomId`
  ).all(userId) as Array<{ roomId: number; n: number }>).filter((r) => (roomSizes.get(r.roomId) ?? 0) >= 3 && r.n >= roomSizes.get(r.roomId)!).length;
  const earlyChores = count("SELECT COUNT(*) AS n FROM task_completions WHERE userId = ? AND status = 'approved' AND strftime('%H', completedAt, 'localtime') < '08'");
  const birthdayChores = user.birthday
    ? count("SELECT COUNT(*) AS n FROM task_completions WHERE userId = ? AND status = 'approved' AND strftime('%m-%d', completedAt, 'localtime') = ?", user.birthday)
    : 0;

  return {
    completions,
    streak: user.currentStreak || 0,
    coins: earnedFromTasks + earnedFromAdjustments,
    rooms_clean: roomsClean,
    weekly_tasks: weekly,
    weekend_tasks: weekend,
    perfect_weeks: perfectWeeks,
    rewards_redeemed: rewardsRedeemed,
    pot_contributions: potContributions,
    cheers_given: cheersGiven,
    cheers_received: cheersReceived,
    team_ups: teamUps,
    boost_completions: boostCompletions,
    goal_weeks: goalWeeks,
    room_sweeps: roomSweeps,
    early_chores: earlyChores,
    birthday_chores: birthdayChores,
  };
}

/** When each badge was first earned (user_achievement_notifications records every first unlock). */
export function earnedBadges(userId: number): Map<string, string> {
  const rows = db.prepare('SELECT achievementId, sentAt FROM user_achievement_notifications WHERE userId = ?').all(userId) as Array<{ achievementId: string; sentAt: string }>;
  // SQLite datetime('now') is UTC without a zone
  return new Map(rows.map((r) => [r.achievementId, r.sentAt.includes('T') ? r.sentAt : `${r.sentAt.replace(' ', 'T')}Z`]));
}

/** Coins paid once for each built-in badge (Settings → Badges; 0 = none). */
export function builtinBadgeBonus(): number {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'badgeBonusCoins'").get() as { value: string } | undefined;
  return Math.max(0, Math.round(Number(row?.value) || 0));
}

// Built-in badges in a ladder (several for the same number, e.g. 1, 10, 25 … chores) show as tiers
const LADDERS = new Set(
  Object.entries(ACHIEVEMENTS.filter((a) => !a.secret).reduce<Record<string, number>>((m, a) => ({ ...m, [a.metric]: (m[a.metric] ?? 0) + 1 }), {}))
    .filter(([, n]) => n > 1).map(([metric]) => metric)
);

export interface BadgeItem {
  id: string;
  custom: boolean;
  titleKey: string | null;
  title: string | null;
  descKey: string | null;
  description: string | null;
  icon: string;
  metric: string;
  threshold: number;
  value: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
  secret: boolean;
  bonusCoins: number;
  /** Built-in ladder this badge is a step of (shown as bronze, silver, gold …) */
  ladder: string | null;
}

/**
 * A person's badges: the built-in ones and the parent-made ones meant for them. One earned stays
 * earned (with the date), even if the number it measures goes down later (a broken streak, rooms
 * getting messy). Secret ones show nothing until earned.
 *
 * With `record`, newly reached ones are saved, their coin bonus is paid (and written to the coin
 * history), and their ids are returned in `newlyEarned`; this runs after a completion so the pop-up
 * and notification go out once. Viewing only reads.
 */
export function achievementsFor(userId: number, options: { record?: boolean; now?: Date } = {}) {
  const stats = getAchievementStats(userId, options.now);
  if (!stats) return null;
  const language = (db.prepare('SELECT language FROM users WHERE id = ?').get(userId) as { language: string | null } | undefined)?.language ?? 'en';
  const builtinBonus = builtinBadgeBonus();
  const live: BadgeItem[] = [
    ...buildAchievements(stats).map((a) => ({
      ...a, custom: false, title: null, description: null, unlockedAt: null, bonusCoins: builtinBonus,
      ladder: !a.secret && LADDERS.has(a.metric) ? a.metric : null,
    })),
    ...listCustomBadges().filter((b) => badgeAppliesTo(b, userId)).map((b) => {
      const value = customBadgeValue(b, userId, stats);
      return {
        id: customBadgeKey(b.id), custom: true, titleKey: null, title: b.title, descKey: null, description: b.description,
        icon: b.icon, metric: b.metric, threshold: b.threshold, value, progress: Math.min(100, Math.round((value / b.threshold) * 100)),
        unlocked: value >= b.threshold, unlockedAt: null, secret: b.secret, bonusCoins: b.bonusCoins, ladder: null,
      };
    }),
  ];

  const newlyEarned: string[] = [];
  if (options.record) {
    const save = db.prepare('INSERT OR IGNORE INTO user_achievement_notifications (userId, achievementId) VALUES (?, ?)');
    for (const a of live) {
      if (!a.unlocked || save.run(userId, a.id).changes === 0) continue;
      newlyEarned.push(a.id);
      if (a.bonusCoins > 0) {
        const title = a.titleKey ? tr(language, a.titleKey) : a.title;
        db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(a.bonusCoins, userId);
        db.prepare('INSERT INTO coin_adjustments (userId, amount, reason, createdBy) VALUES (?, ?, ?, NULL)')
          .run(userId, a.bonusCoins, `🏅 ${tr(language, 'badges.bonusReason').replace('{name}', title ?? '')}`);
      }
    }
  }

  const earned = earnedBadges(userId);
  const achievements: BadgeItem[] = live.map((a) => {
    const unlockedAt = earned.get(a.id) ?? null;
    if (unlockedAt) return { ...a, unlocked: true, progress: 100, unlockedAt };
    // Reached but not recorded yet (it will be after the next chore); secret ones stay hidden until then
    if (a.secret && !a.unlocked) {
      return { ...a, titleKey: null, title: null, descKey: null, description: null, icon: '❓', metric: 'secret', threshold: 0, value: 0, progress: 0 };
    }
    return a;
  });

  // The closest badge still to earn (not a secret one), for "Next up" on Home
  const nextBadge = achievements
    .filter((a) => !a.unlocked && !a.secret)
    .sort((a, b) => b.progress - a.progress || (a.threshold - a.value) - (b.threshold - b.value))[0] ?? null;

  return { stats, achievements, newlyEarned, level: levelFor(stats.coins), nextBadge };
}

/** Titles for the unlock pop-up (custom and secret badges aren't in the page data the app already has). */
export function badgeInfo(userId: number, ids: string[]) {
  if (ids.length === 0) return [];
  const all = achievementsFor(userId)?.achievements ?? [];
  return ids.map((id) => {
    const a = all.find((x) => x.id === id);
    return { id, titleKey: a?.titleKey ?? null, title: a?.title ?? null, icon: a?.icon ?? '🏆' };
  });
}
