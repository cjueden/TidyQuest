import db from '../database';

export interface PrimaryGoal {
  id: number;
  goalCoins: number;
  startAt: string | null;
  endAt: string | null;
  status: string;
}

/**
 * Auto-completes reached goals and caches the user's primary goal on the users row
 * (goalCoins / goalStartAt / goalEndAt).
 *
 * Primary goal, in order of preference:
 *   1. the goal whose window contains now — including a completed one, so a goal that is
 *      reached mid-week stays on the dashboard as "completed" until its window ends
 *   2. the next upcoming active goal
 * Active goals whose window has already ended are never primary.
 *
 * Safe to call on every dashboard load: completion (and its rewardCoins bonus) happens
 * at most once per goal.
 */
export function syncPrimaryGoal(userId: number): PrimaryGoal | null {
  const nowIso = new Date().toISOString();

  // Auto-complete any active goals where coins >= target
  const activeGoals = db.prepare(
    `SELECT id, goalCoins, rewardCoins, startAt, endAt, createdAt FROM user_goals WHERE userId = ? AND status = 'active'`
  ).all(userId) as { id: number; goalCoins: number; rewardCoins: number; startAt: string | null; endAt: string | null; createdAt: string }[];
  for (const g of activeGoals) {
    // Use startAt if set, otherwise fall back to createdAt so that goals without an
    // explicit start date only count coins earned after the goal was created — prevents
    // goals from auto-completing instantly when the user already has enough coins.
    const from = g.startAt || g.createdAt || '1970-01-01T00:00:00.000Z';
    const to = g.endAt || '9999-12-31T23:59:59.999Z';
    const row = db.prepare(
      "SELECT COALESCE(SUM(coinsEarned), 0) as total FROM task_completions WHERE userId = ? AND status = 'approved' AND completedAt >= ? AND completedAt <= ?"
    ).get(userId, from, to) as { total: number };
    if (row.total >= g.goalCoins) {
      const changed = db.prepare("UPDATE user_goals SET status = 'completed', completedAt = ? WHERE id = ? AND status = 'active'").run(nowIso, g.id);
      // Award bonus coins if configured (only on the call that actually completed it)
      if (changed.changes > 0 && g.rewardCoins > 0) {
        db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(g.rewardCoins, userId);
      }
    }
  }

  const primary = db.prepare(
    `SELECT id, goalCoins, startAt, endAt, status
     FROM user_goals
     WHERE userId = ?
       AND (endAt IS NULL OR endAt >= ?)
       AND (
         status = 'active'
         OR (status = 'completed' AND endAt IS NOT NULL AND (startAt IS NULL OR startAt <= ?))
       )
     ORDER BY
       CASE WHEN startAt IS NULL OR startAt <= ? THEN 0 ELSE 1 END,
       CASE WHEN startAt > ? THEN startAt END ASC,
       CASE WHEN status = 'active' THEN 0 ELSE 1 END,
       COALESCE(startAt, createdAt) ASC,
       id DESC
     LIMIT 1`
  ).get(userId, nowIso, nowIso, nowIso, nowIso) as PrimaryGoal | undefined;

  if (!primary) {
    db.prepare('UPDATE users SET goalCoins = NULL, goalStartAt = NULL, goalEndAt = NULL WHERE id = ?').run(userId);
    return null;
  }

  db.prepare('UPDATE users SET goalCoins = ?, goalStartAt = ?, goalEndAt = ? WHERE id = ?')
    .run(primary.goalCoins, primary.startAt || null, primary.endAt || null, userId);
  return primary;
}
