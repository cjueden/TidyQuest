import db from '../database';
import { localDateStr } from './dateHelpers';
import { startOfLocalDay, startOfLocalWeek } from './periods';
import { addDays, at as atTime, dayAt, familyZone, startOfDay, wall } from './clock';
import { beforeStart, isSeasonalNow, nextDueAt, type ScheduledTask } from './schedule';
import { getGlobalVacation } from './adminHelpers';

// Insights for parents (NEW-7): chores done per period, a weekday × time-of-day heatmap, and a nightly
// record of chores left overdue. Everything is grouped by completedAt in the family's time zone (utils/clock).

export type InsightsPeriod = 'day' | 'week' | 'month' | 'year';
export const INSIGHTS_PERIODS: InsightsPeriod[] = ['day', 'week', 'month', 'year'];
/** What one bar covers */
export type Grain = 'hour' | 'day' | 'week' | 'month';
export interface InsightsWindow { start: Date; end: Date; grain: Grain; buckets: string[] }

const DAY_MS = 86400000;

/** Bar starts from `start` to `end`: whole hours, days, week starts or 1sts of the month (the first starts at `start`). */
function bucketStarts(start: Date, end: Date, grain: Grain): string[] {
  const out: string[] = [];
  const tz = familyZone();
  let b = new Date(start);
  while (b < end) {
    out.push(b.toISOString());
    const w = wall(b, tz);
    if (grain === 'hour') b = atTime(w.year, w.month, w.date, w.hours + 1, 0, 0, 0, tz);
    else if (grain === 'day') b = startOfDay(b, 1, tz);
    else if (grain === 'week') b = startOfDay(startOfLocalWeek(b, undefined, tz), 7, tz);
    else b = atTime(w.year, w.month + 1, 1, 0, 0, 0, 0, tz);
  }
  return out;
}

/** The period `offset` steps from the one holding `now` (0 = that one), in the family's time. */
export function periodWindow(period: InsightsPeriod, offset: number, now: Date = new Date()): InsightsWindow {
  const w = wall(now);
  const start = period === 'day' ? startOfDay(now, offset)
    : period === 'week' ? startOfDay(startOfLocalWeek(now), offset * 7)
    : period === 'month' ? atTime(w.year, w.month + offset, 1)
    : atTime(w.year + offset, 0, 1);
  const s = wall(start);
  const end = period === 'day' ? startOfDay(start, 1)
    : period === 'week' ? startOfDay(start, 7)
    : period === 'month' ? atTime(s.year, s.month + 1, 1)
    : atTime(s.year + 1, 0, 1);
  const grain: Grain = period === 'day' ? 'hour' : period === 'year' ? 'month' : 'day';
  return { start, end, grain, buckets: bucketStarts(start, end, grain) };
}

/** Bars sized to the range: hours up to 2 days, days up to 62, weeks up to a year, then months. */
export function grainFor(days: number): Grain {
  return days <= 2 ? 'hour' : days <= 62 ? 'day' : days <= 366 ? 'week' : 'month';
}

/** A From–To range in the family's days, both included, at most 3 years (the oldest part is cut). */
export function customWindow(from: Date, to: Date): InsightsWindow {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const end = startOfDay(b, 1);
  let start = startOfLocalDay(a);
  const e = wall(end);
  const oldest = atTime(e.year - 3, e.month, e.date);
  if (start < oldest) start = oldest;
  const grain = grainFor(daysBetween(start, end));
  return { start, end, grain, buckets: bucketStarts(start, end, grain) };
}

/** Whole days (the family's) from a to b (midnights). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()) / DAY_MS);
}

/** Finds the bar a moment falls in: the last one starting at or before it. */
export function bucketFinder(win: InsightsWindow): (at: Date) => number {
  const starts = win.buckets.map((b) => new Date(b).getTime());
  return (at: Date) => {
    const t = at.getTime();
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  };
}

/** The same moment one period earlier (this time yesterday, last week, last month or last year). */
export function samePointBefore(period: InsightsPeriod, now: Date = new Date()): Date {
  if (period === 'day') return addDays(now, -1);
  if (period === 'week') return addDays(now, -7);
  const w = wall(now);
  if (period === 'month') {
    const daysIn = new Date(Date.UTC(w.year, w.month, 0)).getUTCDate(); // last month's length
    return atTime(w.year, w.month - 1, Math.min(w.date, daysIn), w.hours, w.minutes, w.seconds, w.ms);
  }
  return atTime(w.year - 1, w.month, w.date, w.hours, w.minutes, w.seconds, w.ms);
}

/** Heatmap columns: 6–9, 9–12, 12–3, 3–6, 6–9, and 9 pm to 6 am. */
export const HEAT_SLOTS = [6, 9, 12, 15, 18, 21];
export function heatSlot(at: Date, tz: string = familyZone()): number {
  const h = wall(at, tz).hours;
  if (h < 6) return 5;
  return Math.min(5, Math.floor((h - 6) / 3));
}

/** Stored times are ISO, but SQLite defaults ('YYYY-MM-DD HH:MM:SS') are UTC without a zone. */
export function parseDbTime(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
}

/** late: logged late ("Done earlier…"), so the day is known but not the time */
export interface DoneRow { at: Date; userId: number; taskId: number; coins: number; effort: number; late: boolean }

/** Chores done in [start, end): approved and waiting for approval. Coins count only once paid. */
export function choresDone(start: Date, end: Date): DoneRow[] {
  // Widen the text range by a day, then filter on parsed times (mixed stored formats)
  const rows = db.prepare(
    `SELECT tc.completedAt, tc.userId, tc.taskId, tc.status, tc.coinsEarned, tc.loggedAt, t.effort
     FROM task_completions tc JOIN tasks t ON t.id = tc.taskId
     WHERE tc.status IN ('approved', 'pending') AND tc.completedAt >= ? AND tc.completedAt < ?`
  ).all(new Date(start.getTime() - DAY_MS).toISOString(), new Date(end.getTime() + DAY_MS).toISOString()) as Array<{
    completedAt: string; userId: number; taskId: number; status: string; coinsEarned: number; loggedAt: string | null; effort: number;
  }>;
  const out: DoneRow[] = [];
  for (const r of rows) {
    const at = parseDbTime(r.completedAt);
    if (at < start || at >= end) continue;
    out.push({ at, userId: r.userId, taskId: r.taskId, coins: r.status === 'approved' ? r.coinsEarned : 0, effort: r.effort || 1, late: !!r.loggedAt });
  }
  return out;
}

const SNAPSHOT_KEY = 'overdueSnapshotDay';
/** The first day the snapshot covers ('YYYY-MM-DD'): "left overdue" has no history before it. */
const SNAPSHOT_SINCE_KEY = 'overdueSnapshotSince';

/**
 * Once a day, record which chores were left overdue at the end of yesterday (date, chore, days overdue).
 * "Due and never done" isn't stored anywhere else, so its history starts the day this runs.
 */
export function snapshotOverdueChores(now: Date = new Date()): number {
  const at = startOfLocalDay(now);
  const yesterday = startOfDay(at, -1);
  const day = localDateStr(yesterday);
  const last = (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SNAPSHOT_KEY) as { value: string } | undefined)?.value;
  if (last && last >= day) return 0;

  let recorded = 0;
  const run = db.transaction(() => {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(SNAPSHOT_KEY, day);
    db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(SNAPSHOT_SINCE_KEY, day);
    if (getGlobalVacation().isVacation) return;
    const tasks = db.prepare(
      `SELECT * FROM tasks WHERE archivedAt IS NULL AND deletedAt IS NULL AND pausedAt IS NULL AND onDemand = 0 AND (oneTime = 0 OR doBy IS NOT NULL)`
    ).all() as Array<ScheduledTask & { id: number; roomId: number; createdAt?: string | null }>;
    const insert = db.prepare('INSERT OR IGNORE INTO chore_overdue_days (day, taskId, roomId, dueAt, daysOverdue) VALUES (?, ?, ?, ?, ?)');
    const noon = dayAt(day, 12);
    for (const t of tasks) {
      if (!t.oneTime && isSeasonalNow(t, noon)) continue;
      if (beforeStart(t, at)) continue;
      const due = nextDueAt(t, at) ?? (t.createdAt ? parseDbTime(t.createdAt) : null);
      if (!due || due >= at) continue;
      const days = Math.max(1, Math.round((at.getTime() - startOfLocalDay(due).getTime()) / DAY_MS));
      recorded += insert.run(day, t.id, t.roomId, due.toISOString(), days).changes;
    }
  });
  run();
  return recorded;
}

export function snapshotSince(): string | null {
  return (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SNAPSHOT_SINCE_KEY) as { value: string } | undefined)?.value ?? null;
}

type ChoreRow = ScheduledTask & {
  id: number; roomId: number; name: string; translationKey: string | null; onDemand: number;
  assignmentMode: string | null; createdAt?: string | null; archivedAt?: string | null; deletedAt?: string | null; pausedAt?: string | null;
};

/** Whole calendar days (the family's) from the due day to the day it was done (0 = on time). */
export function lateDays(due: Date, done: Date): number {
  return Math.round((startOfLocalDay(done).getTime() - startOfLocalDay(due).getTime()) / DAY_MS);
}

/** When the chore was due again after `prev` (the completion before); null when there's nothing to be late for. */
export function dueAfter(task: ChoreRow, prev: Date | null): Date | null {
  if (task.onDemand) return null;
  if (task.oneTime) return task.doBy && /^\d{4}-\d{2}-\d{2}$/.test(task.doBy) ? dayAt(task.doBy) : null;
  if (!prev) return null;
  const due = nextDueAt({ ...task, lastCompletedAt: prev.toISOString() }, prev);
  return due && !isSeasonalNow(task, due) ? due : null;
}

/** Shared and custom chores are done by each assignee; the others once by whoever takes them. */
const perPerson = (t: ChoreRow) => t.assignmentMode === 'shared' || t.assignmentMode === 'custom';
const HOUR_MS = 3600000;

/**
 * Skipped and late chores in [start, end):
 * - late: per chore and person, [taskId, userId, times done, times late, days late added up, most days late]
 * - undone: from the nightly snapshot, [taskId, days left overdue, most days overdue]
 * - waits: open-pool chores, [taskId, times done, hours waited added up, longest wait in hours]
 * - waitingNow: open-pool chores overdue right now (current period only), [taskId, hours since due]
 */
export function skippedChores(start: Date, end: Date, now: Date = new Date()) {
  const done = db.prepare(
    `SELECT taskId, userId, completedAt FROM task_completions
     WHERE status IN ('approved', 'pending') AND completedAt >= ? AND completedAt < ?`
  ).all(new Date(start.getTime() - DAY_MS).toISOString(), new Date(end.getTime() + DAY_MS).toISOString()) as Array<{ taskId: number; userId: number; completedAt: string }>;
  const inPeriod = done.map((r) => ({ ...r, at: parseDbTime(r.completedAt) }))
    .filter((r) => r.at >= start && r.at < end)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  // The last completion before the period, per chore and per chore + person
  const before = db.prepare(
    `SELECT taskId, userId, MAX(completedAt) AS last FROM task_completions
     WHERE status IN ('approved', 'pending') AND completedAt < ? GROUP BY taskId, userId`
  ).all(start.toISOString()) as Array<{ taskId: number; userId: number; last: string }>;
  const lastByTask = new Map<number, Date>();
  const lastByPerson = new Map<string, Date>();
  for (const b of before) {
    const at = parseDbTime(b.last);
    if (at >= start) continue;
    lastByPerson.set(`${b.taskId}:${b.userId}`, at);
    if (!(lastByTask.get(b.taskId)! > at)) lastByTask.set(b.taskId, at);
  }

  const tasks = new Map((db.prepare('SELECT * FROM tasks').all() as ChoreRow[]).map((t) => [t.id, t]));
  const assignees = new Map<number, number[]>();
  for (const a of db.prepare('SELECT taskId, userId FROM task_assignees ORDER BY userId').all() as Array<{ taskId: number; userId: number }>) {
    assignees.set(a.taskId, [...(assignees.get(a.taskId) ?? []), a.userId]);
  }
  const isPool = (t: ChoreRow) => (t.assignmentMode ?? 'first') === 'first' && (assignees.get(t.id)?.length ?? 0) !== 1;

  const late = new Map<string, number[]>();
  const waits = new Map<number, number[]>();
  for (const r of inPeriod) {
    const task = tasks.get(r.taskId);
    if (!task) continue;
    const own = perPerson(task);
    const prev = own ? lastByPerson.get(`${r.taskId}:${r.userId}`) : lastByTask.get(r.taskId);
    lastByPerson.set(`${r.taskId}:${r.userId}`, r.at);
    lastByTask.set(r.taskId, r.at);
    // A team-up partner's row for the same chore
    if (!own && prev && r.at.getTime() - prev.getTime() < 60000) continue;
    const due = dueAfter(task, prev ?? null);
    if (!due) continue;
    const key = `${r.taskId}:${r.userId}`;
    const row = late.get(key) ?? [r.taskId, r.userId, 0, 0, 0, 0];
    const days = lateDays(due, r.at);
    row[2] += 1;
    if (days >= 1) { row[3] += 1; row[4] += days; row[5] = Math.max(row[5], days); }
    late.set(key, row);
    if (isPool(task)) {
      const hours = Math.max(0, (r.at.getTime() - due.getTime()) / HOUR_MS);
      const w = waits.get(r.taskId) ?? [r.taskId, 0, 0, 0];
      w[1] += 1; w[2] += hours; w[3] = Math.max(w[3], hours);
      waits.set(r.taskId, w);
    }
  }

  const undone = db.prepare(
    `SELECT taskId, COUNT(*) AS days, MAX(daysOverdue) AS worst FROM chore_overdue_days
     WHERE day >= ? AND day < ? GROUP BY taskId`
  ).all(localDateStr(start), localDateStr(end)) as Array<{ taskId: number; days: number; worst: number }>;

  // Open-pool chores still waiting: overdue since before today
  const waitingNow: number[][] = [];
  if (end > now && start <= now) {
    const today = startOfLocalDay(now);
    for (const t of tasks.values()) {
      if (t.archivedAt || t.deletedAt || t.pausedAt || t.onDemand || t.oneTime || !isPool(t)) continue;
      if (isSeasonalNow(t, now) || beforeStart(t, now)) continue;
      const due = nextDueAt(t, now) ?? (t.createdAt ? parseDbTime(t.createdAt) : null);
      if (due && due < today) waitingNow.push([t.id, (now.getTime() - due.getTime()) / HOUR_MS]);
    }
  }

  const round = (v: number) => Math.round(v * 10) / 10;
  const ids = new Set<number>([
    ...[...late.values()].map((r) => r[0]), ...undone.map((u) => u.taskId), ...waitingNow.map((w) => w[0]),
  ]);
  return {
    tasks: [...ids].map((id) => tasks.get(id)!).filter(Boolean).map((t) => ({
      id: t.id, name: t.name, translationKey: t.translationKey, roomId: t.roomId, pool: isPool(t), assignees: assignees.get(t.id) ?? [],
    })),
    late: [...late.values()],
    undone: undone.map((u) => [u.taskId, u.days, u.worst]),
    waits: [...waits.values()].map((w) => [w[0], w[1], round(w[2]), round(w[3])]),
    waitingNow: waitingNow.map((w) => [w[0], round(w[1])]),
  };
}

/** Where coins come from and go. In: chores, bonuses (any coin adjustment above 0). Out: the rest. */
export type CoinCategory = 'chores' | 'bonus' | 'rewards' | 'chipins' | 'mascot' | 'shields' | 'adjust';
export interface LedgerEntry { at: Date; userId: number; category: CoinCategory; coins: number }

const REFUNDED = "('rejected', 'cancelled')";

/**
 * Every coin that came in or went out in [start, end), gathered from the tables that hold them. Coins are
 * positive either way; the category says which. Refunded rewards and chip-ins are left out (the coins came
 * back), and a shared pot's reward isn't counted again on top of its chip-ins.
 */
export function coinLedger(start: Date, end: Date): LedgerEntry[] {
  const from = new Date(start.getTime() - DAY_MS).toISOString();
  const to = new Date(end.getTime() + DAY_MS).toISOString();
  const rows: Array<{ at: string; userId: number; category: CoinCategory; coins: number }> = [
    ...db.prepare(`SELECT completedAt AS at, userId, 'chores' AS category, coinsEarned AS coins FROM task_completions
      WHERE status = 'approved' AND coinsEarned > 0 AND completedAt >= ? AND completedAt < ?`).all(from, to),
    ...db.prepare(`SELECT createdAt AS at, userId, CASE WHEN amount > 0 THEN 'bonus' ELSE 'adjust' END AS category, ABS(amount) AS coins
      FROM coin_adjustments WHERE amount <> 0 AND createdAt >= ? AND createdAt < ?`).all(from, to),
    ...db.prepare(`SELECT rr.redeemedAt AS at, rr.userId, 'rewards' AS category, rr.costCoins AS coins FROM reward_redemptions rr
      WHERE rr.status NOT IN ${REFUNDED} AND rr.costCoins > 0 AND rr.redeemedAt >= ? AND rr.redeemedAt < ?
        AND NOT EXISTS (SELECT 1 FROM reward_contributions c WHERE c.redemptionId = rr.id)`).all(from, to),
    ...db.prepare(`SELECT c.createdAt AS at, c.userId, 'chipins' AS category, c.amount AS coins FROM reward_contributions c
      LEFT JOIN reward_redemptions rr ON rr.id = c.redemptionId
      WHERE (rr.id IS NULL OR rr.status NOT IN ${REFUNDED}) AND c.createdAt >= ? AND c.createdAt < ?`).all(from, to),
    ...db.prepare(`SELECT createdAt AS at, userId, 'mascot' AS category, price AS coins FROM mascot_purchases
      WHERE price > 0 AND createdAt >= ? AND createdAt < ?`).all(from, to),
    ...db.prepare(`SELECT createdAt AS at, userId, 'shields' AS category, coins FROM streak_shield_events
      WHERE kind = 'bought' AND coins > 0 AND createdAt >= ? AND createdAt < ?`).all(from, to),
  ] as Array<{ at: string; userId: number; category: CoinCategory; coins: number }>;
  return rows.map((r) => ({ ...r, at: parseDbTime(r.at) })).filter((r) => r.at >= start && r.at < end);
}

/**
 * Coins per person and week over the `weeks` weeks ending with the one holding `at` (the family's weeks): flows
 * [week, userId, category, coins], weekly goals [week, userId, goal], everyone's balance now with the net change
 * since the last week ended [userId, net] (end-of-week balances are worked back from them), and rewards bought
 * [rewardId, userId, redemptionId, coins] for "bought most or never".
 */
export function coinsByWeek(weeks: number, at: Date = new Date(), now: Date = new Date()) {
  const start = startOfDay(startOfLocalWeek(at), -(weeks - 1) * 7);
  const starts: Date[] = [];
  for (let i = 0; i <= weeks; i++) starts.push(startOfDay(start, i * 7));
  const end = starts[weeks];
  const weekOf = (at: Date) => { let w = 0; while (w < weeks - 1 && at >= starts[w + 1]) w++; return w; };

  const flows = new Map<string, [number, number, CoinCategory, number]>();
  for (const e of coinLedger(start, end)) {
    const w = weekOf(e.at);
    const key = `${w}:${e.userId}:${e.category}`;
    const row = flows.get(key) ?? [w, e.userId, e.category, 0];
    row[3] += e.coins;
    flows.set(key, row);
  }

  // Weekly goals: a goal that repeats weekly, or one set for a single week. A repeating goal's flag moves on
  // to next week's copy when it rolls over, so past weeks are found by their one-week window.
  const goals: number[][] = [];
  for (const g of db.prepare(`SELECT userId, goalCoins, startAt, endAt, createdAt, repeatWeekly FROM user_goals
      WHERE goalCoins > 0 ORDER BY id`).all() as Array<{ userId: number; goalCoins: number; startAt: string | null; endAt: string | null; createdAt: string; repeatWeekly: number }>) {
    const at = parseDbTime(g.startAt || g.createdAt);
    const days = g.startAt && g.endAt ? (parseDbTime(g.endAt).getTime() - at.getTime()) / DAY_MS : null;
    if (!g.repeatWeekly && !(days != null && days >= 5 && days <= 8)) continue;
    if (at < start || at >= end) continue;
    const w = weekOf(at);
    const i = goals.findIndex((x) => x[0] === w && x[1] === g.userId);
    if (i >= 0) goals[i][2] = g.goalCoins; else goals.push([w, g.userId, g.goalCoins]);
  }

  const bought: number[][] = [];
  const redemptions = db.prepare(`SELECT id, rewardId, userId, costCoins, redeemedAt FROM reward_redemptions
    WHERE status NOT IN ${REFUNDED}`).all() as Array<{ id: number; rewardId: number; userId: number; costCoins: number; redeemedAt: string }>;
  const chipIns = db.prepare('SELECT redemptionId, userId, SUM(amount) AS amount FROM reward_contributions WHERE redemptionId IS NOT NULL GROUP BY redemptionId, userId')
    .all() as Array<{ redemptionId: number; userId: number; amount: number }>;
  for (const r of redemptions) {
    const at = parseDbTime(r.redeemedAt);
    if (at < start || at >= end) continue;
    const pot = chipIns.filter((c) => c.redemptionId === r.id);
    if (pot.length) for (const c of pot) bought.push([r.rewardId, c.userId, r.id, c.amount]);
    else bought.push([r.rewardId, r.userId, r.id, r.costCoins]);
  }

  const after = new Map<number, number>();
  if (end < now) {
    for (const e of coinLedger(end, now)) {
      const sign = e.category === 'chores' || e.category === 'bonus' ? 1 : -1;
      after.set(e.userId, (after.get(e.userId) ?? 0) + sign * e.coins);
    }
  }

  return {
    weeks, starts: starts.slice(0, weeks).map((d) => d.toISOString()), end: end.toISOString(),
    afterNet: [...after.entries()],
    people: db.prepare('SELECT id, displayName AS name, avatarColor AS color, coins AS balance FROM users ORDER BY id').all(),
    flows: [...flows.values()],
    goals,
    rewards: db.prepare('SELECT id, title, costCoins, isActive FROM rewards ORDER BY sortOrder, id').all(),
    bought,
  };
}
