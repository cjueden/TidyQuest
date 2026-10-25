import db from '../database';
import { dateStr, daySql, endOfDay } from './clock';

/**
 * "One thing at a time" (NEW-2): today's line of chores for one person, shown one at a time.
 * Order: your own chores due today, then the Rescue Mission, then a few open chores that are due
 * (OPEN_PER_DAY, so the line can end and be celebrated). The client moves skipped ones to the back.
 */

export const FOCUS_MODES = ['off', 'button', 'home'] as const;
export type FocusMode = typeof FOCUS_MODES[number];

/** Open (anyone's) chores in the line per day, counting the ones you already did today */
export const OPEN_PER_DAY = 3;

/** Steps a chore can list, and how long each can be */
export const MAX_STEPS = 12;
export const MAX_STEP_LENGTH = 120;

/** A parent's choice per person; nothing chosen = a button on Home for kids, off for everyone else */
export function focusModeFor(user: { role: string; focusMode?: string | null }): FocusMode {
  if (user.focusMode && (FOCUS_MODES as readonly string[]).includes(user.focusMode)) return user.focusMode as FocusMode;
  return user.role === 'child' ? 'button' : 'off';
}

/** A chore's steps from the database (a JSON array), always an array */
export function parseSteps(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string' && s.trim()) : [];
  } catch {
    return [];
  }
}

/** Steps from a request: an array, or one step per line. Returns null for none, or an error code. */
export function readSteps(v: unknown): { value: string | null } | { error: string } {
  if (v === undefined || v === null || v === '') return { value: null };
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : null;
  if (!list || !list.every((s) => typeof s === 'string')) return { error: 'invalid_steps' };
  const steps = list.map((s) => s.trim()).filter(Boolean);
  if (steps.length > MAX_STEPS || steps.some((s) => s.length > MAX_STEP_LENGTH)) return { error: 'invalid_steps' };
  return { value: steps.length ? JSON.stringify(steps) : null };
}

interface LineTask {
  id: number; health: number; dueDate: string; onDemand?: number | boolean; isSeasonal?: boolean;
  oneTime?: number | boolean; doBy?: string | null; allowEarlyCompletion?: number | boolean; effectiveAssignedUserIds: number[];
  assignmentMode?: string; completedTodayBy?: { userId: number } | null; myPendingCount?: number;
  teamUp?: { claimedBy: string[] | null } | null;
}

/**
 * The line for userId from the dashboard's tasks (with health, due date and today's completions).
 * Returns the chores still to do, in order, and how many in the line were already done today.
 */
export function focusLine<T extends LineTask>(tasks: T[], userId: number, missionTaskId: number | null, now = new Date()) {
  const doneToday = new Set((db.prepare(
    `SELECT DISTINCT taskId FROM task_completions
     WHERE userId = ? AND status IN ('approved', 'pending') AND ${daySql('completedAt')} = ?`
  ).all(userId, dateStr(now)) as { taskId: number }[]).map((r) => r.taskId));
  const endOfToday = endOfDay(now).getTime();
  const today = dateStr(now);

  const mine = (t: T) => t.effectiveAssignedUserIds.includes(userId);
  const open = (t: T) => t.effectiveAssignedUserIds.length === 0;
  const dueToday = (t: T) => {
    if (t.onDemand || t.isSeasonal) return false;
    if (t.oneTime) return !t.doBy || t.doBy <= today;
    // Due now, or later today when it may be done early (otherwise Done would refuse it)
    const due = new Date(t.dueDate).getTime();
    return due <= now.getTime() || (!!t.allowEarlyCompletion && due <= endOfToday);
  };
  // Can this person still do it today? (someone else finished a first-one-wins chore, or a team claimed it)
  const available = (t: T) => !doneToday.has(t.id) && !(t.myPendingCount ?? 0)
    && !(t.assignmentMode !== 'shared' && t.completedTodayBy)
    && !t.teamUp?.claimedBy;
  const byNeed = (a: T, b: T) => a.health - b.health || a.id - b.id;

  const own = tasks.filter((t) => mine(t) && t.id !== missionTaskId);
  const mission = missionTaskId !== null ? tasks.find((t) => t.id === missionTaskId && (mine(t) || open(t))) ?? null : null;
  const anyones = tasks.filter((t) => open(t) && !t.oneTime && t.id !== missionTaskId);

  const openDone = anyones.filter((t) => doneToday.has(t.id)).length;
  const line: T[] = [
    ...own.filter((t) => dueToday(t) && available(t)).sort(byNeed),
    ...(mission && available(mission) ? [mission] : []),
    ...anyones.filter((t) => dueToday(t) && available(t)).sort(byNeed).slice(0, Math.max(0, OPEN_PER_DAY - openDone)),
  ];
  const done = own.filter((t) => doneToday.has(t.id)).length + (mission && doneToday.has(mission.id) ? 1 : 0) + Math.min(openDone, OPEN_PER_DAY);
  return { line, done };
}
