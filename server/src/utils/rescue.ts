import db from '../database';
import { localDateStr } from './dateHelpers';
import { isFeatureOn, rescueMultiplier } from './features';
import { intervalDays } from './homeSections';
import { isSeasonalNow, nextDueAt, oneTimeDeadline } from './schedule';

/**
 * The Rescue Mission: once a day the most-forgotten chore pays extra (2× by default) to the first
 * person who does it, until midnight. Chores open to anyone and assigned ones both count (an
 * assigned one only shows to its people). The first completion claims it, so two people can't both
 * get the bonus; a rejected or undone completion gives it back.
 */

const DAY_MS = 86400000;
const parseStored = (v: string) => new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`);

export interface RescueRow { day: string; taskId: number | null; multiplier: number; completedBy: number | null; completionId: number | null; skipped: number }

/** How many of its own intervals a chore is behind (1+ = forgotten); a to-do counts weeks past its date. */
function behind(t: any, now: Date): number {
  if (t.oneTime) {
    const late = (now.getTime() - oneTimeDeadline(t, now).getTime()) / DAY_MS;
    return late > 0 ? 1 + late / 7 : 0;
  }
  const due = nextDueAt(t, now) ?? (t.createdAt ? parseStored(t.createdAt) : now);
  return (now.getTime() - due.getTime()) / DAY_MS / intervalDays(t);
}

/** Chores that could be today's mission, most forgotten first. */
export function rescueCandidates(now: Date = new Date(), exclude: Set<number> = new Set()): Array<{ id: number; name: string; behind: number }> {
  return (db.prepare('SELECT * FROM tasks WHERE archivedAt IS NULL AND deletedAt IS NULL AND pausedAt IS NULL AND onDemand = 0').all() as any[])
    .filter((t) => !exclude.has(t.id) && !isSeasonalNow(t, now))
    .map((t) => ({ id: t.id as number, name: t.name as string, behind: behind(t, now) }))
    .filter((c) => c.behind >= 1)
    .sort((a, b) => b.behind - a.behind || a.id - b.id);
}

const getRow = (day: string) => db.prepare('SELECT * FROM rescue_missions WHERE day = ?').get(day) as RescueRow | undefined;

/**
 * Today's mission, picked the first time anyone asks (null when switched off, skipped, or nothing is
 * overdue enough). Picked again if its chore was deleted before anyone did it.
 */
export function todaysMission(now: Date = new Date()): RescueRow | null {
  if (!isFeatureOn('rescue')) return null;
  const day = localDateStr(now);
  let row = getRow(day);
  if (!row || (!row.skipped && !row.completedBy && row.taskId === null)) {
    const pick = rescueCandidates(now)[0];
    if (!pick) return null;
    db.prepare(`INSERT INTO rescue_missions (day, taskId, multiplier) VALUES (?, ?, ?)
                ON CONFLICT(day) DO UPDATE SET taskId = excluded.taskId, multiplier = excluded.multiplier, completedBy = NULL, completionId = NULL`)
      .run(day, pick.id, rescueMultiplier());
    row = getRow(day);
  }
  return row && !row.skipped && row.taskId !== null ? row : null;
}

/** The extra multiplier a completion of this task gets right now (1 = none). */
export function rescueMultiplierFor(taskId: number, now: Date = new Date()): number {
  const m = todaysMission(now);
  return m && m.taskId === taskId && !m.completedBy ? m.multiplier : 1;
}

/** The first completion claims the bonus; returns whether this one did. */
export function claimRescue(taskId: number, userId: number, now: Date = new Date()): boolean {
  const m = todaysMission(now);
  if (!m || m.taskId !== taskId || m.completedBy) return false;
  return db.prepare('UPDATE rescue_missions SET completedBy = ? WHERE day = ? AND taskId = ? AND completedBy IS NULL')
    .run(userId, m.day, taskId).changes > 0;
}

export function setRescueCompletion(day: string, completionId: number) {
  db.prepare('UPDATE rescue_missions SET completionId = ? WHERE day = ?').run(completionId, day);
}

/** A rejected or undone completion gives the bonus back (if its day is still today). */
export function releaseRescue(completionId: number) {
  db.prepare('UPDATE rescue_missions SET completedBy = NULL, completionId = NULL WHERE completionId = ?').run(completionId);
}

/** Parents: another chore, a chosen one, or none today. */
export function rerollRescue(now: Date = new Date()): RescueRow | null {
  const current = todaysMission(now);
  const pick = rescueCandidates(now, new Set(current?.taskId ? [current.taskId] : []))[0];
  if (!pick) return current;
  return chooseRescue(pick.id, now);
}
export function chooseRescue(taskId: number, now: Date = new Date()): RescueRow | null {
  const day = localDateStr(now);
  db.prepare(`INSERT INTO rescue_missions (day, taskId, multiplier, skipped) VALUES (?, ?, ?, 0)
              ON CONFLICT(day) DO UPDATE SET taskId = excluded.taskId, multiplier = excluded.multiplier, completedBy = NULL, completionId = NULL, skipped = 0`)
    .run(day, taskId, rescueMultiplier());
  return todaysMission(now);
}
export function skipRescue(now: Date = new Date()) {
  db.prepare(`INSERT INTO rescue_missions (day, taskId, multiplier, skipped) VALUES (?, NULL, ?, 1)
              ON CONFLICT(day) DO UPDATE SET taskId = NULL, completedBy = NULL, completionId = NULL, skipped = 1`)
    .run(localDateStr(now), rescueMultiplier());
}
