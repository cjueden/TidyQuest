import db from '../database';
import type { AchievementStats } from './achievements';

/**
 * Badges parents make (Settings → Badges), and levels.
 *
 * A parent-made badge counts one thing for each person it's for:
 * - task_count:  times any of the chosen tasks was done (fed the pets 30 times, first A)
 * - room_count:  chores done in one room
 * - task_weeks:  weeks in a row (Mon–Sun) with at least one of the chosen tasks done (homework 4 weeks)
 * - goal_weeks:  weekly goals reached in a row
 * - completions, streak, coins_earned: the same numbers the built-in badges use
 */
export const CUSTOM_METRICS = ['task_count', 'room_count', 'task_weeks', 'goal_weeks', 'completions', 'streak', 'coins_earned'] as const;
export type CustomMetric = typeof CUSTOM_METRICS[number];

export interface CustomBadge {
  id: number;
  title: string;
  description: string | null;
  icon: string;
  metric: CustomMetric;
  taskIds: number[];
  roomId: number | null;
  threshold: number;
  bonusCoins: number;
  /** null = everyone who does chores */
  userIds: number[] | null;
  secret: boolean;
}

const parseIds = (raw: unknown): number[] | null => {
  if (raw == null || raw === '') return null;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : null;
  } catch {
    return null;
  }
};

function fromRow(r: any): CustomBadge {
  return {
    id: r.id, title: r.title, description: r.description ?? null, icon: r.icon || '🏅', metric: r.metric,
    taskIds: parseIds(r.taskIds) ?? [], roomId: r.roomId ?? null, threshold: r.threshold, bonusCoins: r.bonusCoins,
    userIds: parseIds(r.userIds), secret: !!r.secret,
  };
}

export function listCustomBadges(): CustomBadge[] {
  return (db.prepare('SELECT * FROM custom_badges ORDER BY id').all() as any[]).map(fromRow);
}

export const customBadgeKey = (id: number) => `custom_${id}`;

export function badgeAppliesTo(badge: CustomBadge, userId: number): boolean {
  return badge.userIds === null || badge.userIds.length === 0 || badge.userIds.includes(userId);
}

/** Validate a create/update body. Returns the values to store or an error code. */
export function readCustomBadgeInput(body: any): { error: string } | { values: Omit<CustomBadge, 'id'> } {
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 60) : '';
  if (!title) return { error: 'title_required' };
  const metric = body?.metric as CustomMetric;
  if (!CUSTOM_METRICS.includes(metric)) return { error: 'invalid_metric' };
  const taskIds = parseIds(body?.taskIds) ?? [];
  if ((metric === 'task_count' || metric === 'task_weeks') && taskIds.length === 0) return { error: 'tasks_required' };
  const roomId = body?.roomId != null && body.roomId !== '' ? Number(body.roomId) : null;
  if (metric === 'room_count' && !(roomId && db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(roomId))) return { error: 'room_required' };
  const threshold = Math.round(Number(body?.threshold));
  if (!(threshold >= 1 && threshold <= 100000)) return { error: 'invalid_threshold' };
  const bonusCoins = Math.round(Number(body?.bonusCoins ?? 0));
  if (!(bonusCoins >= 0 && bonusCoins <= 100000)) return { error: 'invalid_bonus' };
  const userIds = parseIds(body?.userIds);
  const icon = typeof body?.icon === 'string' && body.icon.trim() ? [...body.icon.trim()].slice(0, 4).join('') : '🏅';
  const description = typeof body?.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 140) : null;
  return {
    values: {
      title, description, icon, metric,
      taskIds: metric === 'task_count' || metric === 'task_weeks' ? taskIds : [],
      roomId: metric === 'room_count' ? roomId : null,
      threshold, bonusCoins, userIds: userIds && userIds.length ? userIds : null, secret: !!body?.secret,
    },
  };
}

export function saveCustomBadge(values: Omit<CustomBadge, 'id'>, id?: number, createdBy?: number): number {
  const cols = {
    title: values.title, description: values.description, icon: values.icon, metric: values.metric,
    taskIds: values.taskIds.length ? JSON.stringify(values.taskIds) : null, roomId: values.roomId,
    threshold: values.threshold, bonusCoins: values.bonusCoins,
    userIds: values.userIds ? JSON.stringify(values.userIds) : null, secret: values.secret ? 1 : 0,
  };
  if (id) {
    db.prepare(`UPDATE custom_badges SET ${Object.keys(cols).map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(cols), id);
    return id;
  }
  return Number(db.prepare(
    `INSERT INTO custom_badges (${Object.keys(cols).join(', ')}, createdBy) VALUES (${Object.keys(cols).map(() => '?').join(', ')}, ?)`
  ).run(...Object.values(cols), createdBy ?? null).lastInsertRowid);
}

/** The longest run of consecutive weeks in a list of week starts ('YYYY-MM-DD', Mondays). */
export function longestWeekRun(weekStarts: string[]): number {
  const days = [...new Set(weekStarts)].map((w) => Math.round(Date.UTC(+w.slice(0, 4), +w.slice(5, 7) - 1, +w.slice(8, 10)) / 86400000)).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && d - days[i - 1] === 7 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

const WEEK_OF = "date(c.completedAt, 'localtime', 'weekday 0', '-6 days')";

/** How far a person is on a parent-made badge. */
export function customBadgeValue(badge: CustomBadge, userId: number, stats: AchievementStats): number {
  const inList = (ids: number[]) => ids.map(() => '?').join(', ');
  switch (badge.metric) {
    case 'task_count':
      return (db.prepare(`SELECT COUNT(*) AS n FROM task_completions c WHERE c.userId = ? AND c.status = 'approved' AND c.taskId IN (${inList(badge.taskIds)})`)
        .get(userId, ...badge.taskIds) as { n: number }).n;
    case 'room_count':
      return (db.prepare("SELECT COUNT(*) AS n FROM task_completions c JOIN tasks t ON t.id = c.taskId WHERE c.userId = ? AND c.status = 'approved' AND t.roomId = ?")
        .get(userId, badge.roomId) as { n: number }).n;
    case 'task_weeks':
      return longestWeekRun((db.prepare(`SELECT DISTINCT ${WEEK_OF} AS week FROM task_completions c WHERE c.userId = ? AND c.status = 'approved' AND c.taskId IN (${inList(badge.taskIds)})`)
        .all(userId, ...badge.taskIds) as Array<{ week: string }>).map((r) => r.week));
    case 'goal_weeks': return stats.goal_weeks;
    case 'completions': return stats.completions;
    case 'streak': return stats.streak;
    case 'coins_earned': return stats.coins;
  }
}

/**
 * Levels from coins earned over all time (never goes down). Level n starts at 25·n·(n−1) coins:
 * 0, 50, 150, 300, 500, 750, 1050, 1400, 1800, 2250, … Titles stop changing at level 10.
 */
export const LEVEL_TITLES = 10;
export function levelFor(coinsEarned: number) {
  const start = (n: number) => 25 * n * (n - 1);
  let level = 1;
  while (start(level + 1) <= coinsEarned) level++;
  const from = start(level);
  const to = start(level + 1);
  return {
    level,
    titleKey: `levels.l${Math.min(level, LEVEL_TITLES)}`,
    coinsEarned,
    levelStartsAt: from,
    nextLevelAt: to,
    progress: Math.round(((coinsEarned - from) / (to - from)) * 100),
  };
}
