import db from '../database';
import { addLocalDays, currentLocalWeek } from './periods';

export interface PrimaryGoal {
  id: number;
  title: string;
  goalCoins: number;
  /** Bonus coins paid once when the goal is reached */
  rewardCoins: number;
  startAt: string | null;
  endAt: string | null;
  status: string;
}

/** Safety cap on how many missed weeks one sync fills in. */
const MAX_CATCH_UP_WEEKS = 520;

/** "Weekly Win · week of Oct 12" -> "Weekly Win" (titles without a week suffix stay as they are). */
export function goalTitleBase(title: string): string {
  return title.replace(/\s*·\s*week of\s.*$/i, '').trim() || title;
}

function weekTitle(previous: string, startAt: string): string {
  if (goalTitleBase(previous) === previous) return previous;
  const day = new Date(startAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${goalTitleBase(previous)} · week of ${day}`;
}

/**
 * "Repeat weekly" goals: once a repeating goal's window has ended, set up the following week's
 * goal (same title base, target and bonus) and move the repeat flag onto it. If a parent already
 * made that week's goal (same title base, starting the same day), the flag moves onto that one
 * instead of creating a duplicate. Loops so several missed weeks are all filled in, each one still
 * getting its own completion check (and bonus) afterwards. Idempotent: only the newest goal of a
 * chain carries the flag, and only an ended one is rolled over.
 */
export function rollOverRepeatingGoals(userId: number, now: Date = new Date()): void {
  const nowIso = now.toISOString();
  db.transaction(() => {
    for (let i = 0; i < MAX_CATCH_UP_WEEKS; i++) {
      const head = db.prepare(
        `SELECT id, title, goalCoins, rewardCoins, startAt, endAt, createdBy FROM user_goals
         WHERE userId = ? AND repeatWeekly = 1 AND endAt IS NOT NULL AND endAt < ?
         ORDER BY endAt ASC, id ASC LIMIT 1`
      ).get(userId, nowIso) as { id: number; title: string; goalCoins: number; rewardCoins: number; startAt: string | null; endAt: string; createdBy: number | null } | undefined;
      if (!head) return;

      const startAt = head.startAt ? addLocalDays(head.startAt, 7) : new Date(new Date(head.endAt).getTime() + 1).toISOString();
      const endAt = addLocalDays(head.endAt, 7);
      const base = goalTitleBase(head.title).toLowerCase();
      const existing = (db.prepare(
        `SELECT id, title FROM user_goals
         WHERE userId = ? AND id != ? AND startAt IS NOT NULL AND ABS(julianday(startAt) - julianday(?)) < 0.5`
      ).all(userId, head.id, startAt) as { id: number; title: string }[]).find((g) => goalTitleBase(g.title).toLowerCase() === base);

      db.prepare('UPDATE user_goals SET repeatWeekly = 0 WHERE id = ?').run(head.id);
      if (existing) {
        db.prepare('UPDATE user_goals SET repeatWeekly = 1 WHERE id = ?').run(existing.id);
      } else {
        db.prepare(
          'INSERT INTO user_goals (userId, title, goalCoins, startAt, endAt, rewardCoins, repeatWeekly, createdBy) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
        ).run(userId, weekTitle(head.title, startAt), head.goalCoins, startAt, endAt, head.rewardCoins, head.createdBy);
      }
    }
  })();
}

/**
 * The family changed the week's first day (Settings → General): each "repeat weekly" goal still
 * running that covers a whole old calendar week moves to the new week sharing six of its days (the
 * one holding its Thursday or Wednesday), so the chain follows the new weeks from then on. Goals a
 * parent gave their own dates stay as they are. Returns the people whose goal moved.
 */
export function realignWeeklyGoals(oldFirst: number, newFirst: number, now: Date = new Date()): number[] {
  if (oldFirst === newFirst) return [];
  const heads = db.prepare(
    'SELECT id, userId, title, startAt, endAt FROM user_goals WHERE repeatWeekly = 1 AND startAt IS NOT NULL AND endAt IS NOT NULL AND endAt >= ?'
  ).all(now.toISOString()) as { id: number; userId: number; title: string; startAt: string; endAt: string }[];
  const moved = new Set<number>();
  for (const g of heads) {
    const old = currentLocalWeek(new Date(g.startAt), oldFirst);
    if (Date.parse(old.startAt) !== Date.parse(g.startAt) || Date.parse(old.endAt) !== Date.parse(g.endAt)) continue;
    const { startAt, endAt } = currentLocalWeek(new Date(addLocalDays(g.startAt, 3)), newFirst);
    db.prepare('UPDATE user_goals SET startAt = ?, endAt = ?, title = ? WHERE id = ?').run(startAt, endAt, weekTitle(g.title, startAt), g.id);
    moved.add(g.userId);
  }
  return [...moved];
}

/**
 * Rolls repeating goals over to the current week, auto-completes reached goals and caches the user's primary goal on the users row
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
  rollOverRepeatingGoals(userId);

  // Auto-complete any active goals where coins >= target
  const activeGoals = db.prepare(
    `SELECT id, title, goalCoins, rewardCoins, startAt, endAt, createdAt FROM user_goals WHERE userId = ? AND status = 'active'`
  ).all(userId) as { id: number; title: string; goalCoins: number; rewardCoins: number; startAt: string | null; endAt: string | null; createdAt: string }[];
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
        // Shows up in Activity like a parent's coin adjustment
        db.prepare('INSERT INTO coin_adjustments (userId, amount, reason, createdBy, createdAt) VALUES (?, ?, ?, NULL, ?)')
          .run(userId, g.rewardCoins, `Goal reached: ${goalTitleBase(g.title)}`, nowIso);
      }
    }
  }

  const primary = db.prepare(
    `SELECT id, title, goalCoins, rewardCoins, startAt, endAt, status
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
