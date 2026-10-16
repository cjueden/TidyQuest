import db from '../database';
import { tr } from './i18n';
import { notifyPeople, type Audience } from './notify';
import { rotationTurnFor } from './schedule';

/**
 * Every notification the app sends, in each person's language (texts: the "notify" section of the
 * app's translations). Routes call these; utils/notify.ts decides who gets what where.
 */

const nameOf = (userId: number | null | undefined) =>
  (db.prepare('SELECT displayName FROM users WHERE id = ?').get(userId ?? -1) as { displayName: string } | undefined)?.displayName ?? '?';

/** Who a task is for: whose turn it is, its people, the room's owner, or everyone. */
export function taskAudience(task: { id: number; roomId: number; assignmentMode?: string | null; rotationPeriod?: string | null; rotationCurrentUserId?: number | null }): Audience {
  const ids = (db.prepare('SELECT userId FROM task_assignees WHERE taskId = ?').all(task.id) as Array<{ userId: number }>).map((a) => a.userId);
  if (task.assignmentMode === 'rotating' && ids.length > 0) {
    const turn = rotationTurnFor(task, ids);
    if (turn) return [turn];
  }
  if (ids.length > 0) return ids;
  const owner = (db.prepare('SELECT assignedUserId FROM rooms WHERE id = ?').get(task.roomId) as { assignedUserId: number | null } | undefined)?.assignedUserId;
  return owner ? [owner] : 'everyone';
}

const room = (name: string | null | undefined) => (name ? ` (${name})` : '');

export function notifyTaskDue(task: { id: number; name: string; roomId: number; roomName: string | null; assignmentMode?: string | null; rotationPeriod?: string | null; rotationCurrentUserId?: number | null }, day: string) {
  return notifyPeople(taskAudience(task), 'taskDue', (lang) => tr(lang, 'notify.taskDue', { task: task.name }) + room(task.roomName), { dedupeKey: `due:${task.id}:${day}` });
}

export function notifyChoreWaiting(childId: number, taskName: string) {
  const name = nameOf(childId);
  return notifyPeople('parents', 'choreApproval', (lang) => tr(lang, 'notify.choreApproval', { name, task: taskName }));
}

export function notifyRewardRequest(userId: number, reward: string, coins: number) {
  const name = nameOf(userId);
  return notifyPeople('parents', 'rewardRequest', (lang) => tr(lang, 'notify.rewardRequest', { name, reward, coins }));
}

export function notifyPotFull(reward: string, coins: number) {
  return notifyPeople('parents', 'rewardRequest', (lang) => tr(lang, 'notify.potFull', { reward, coins }));
}

/** To the person ("You earned …") and the parents ("Cecil earned …"). */
export function notifyBadge(userId: number, badge: { titleKey: string | null; title: string | null }) {
  const name = nameOf(userId);
  const title = (lang: string) => (badge.titleKey ? tr(lang, badge.titleKey) : badge.title ?? '');
  const parents = (db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as Array<{ id: number }>).map((p) => p.id);
  return notifyPeople([userId, ...parents.filter((id) => id !== userId)], 'achievementUnlocked',
    (lang, p) => (p?.id === userId ? tr(lang, 'notify.badgeYou', { badge: title(lang) }) : tr(lang, 'notify.badgeOther', { name, badge: title(lang) })));
}

// ---------- Outcomes, to the kid only ----------

export function notifyChoreApproved(childId: number, parentId: number, taskName: string, coins: number) {
  const parent = nameOf(parentId);
  return notifyPeople([childId], 'outcome', (lang) => tr(lang, 'notify.choreApproved', { parent, task: taskName, coins }));
}

export function notifyChoreRejected(childId: number, parentId: number, taskName: string) {
  const parent = nameOf(parentId);
  return notifyPeople([childId], 'outcome', (lang) => tr(lang, 'notify.choreRejected', { parent, task: taskName }));
}

export function notifyRewardDecision(childId: number, parentId: number, reward: string, approved: boolean) {
  const parent = nameOf(parentId);
  return notifyPeople([childId], 'outcome', (lang) => tr(lang, approved ? 'notify.rewardApproved' : 'notify.rewardRejected', { parent, reward }));
}

export function notifyCoinsAdjusted(childId: number, parentId: number, amount: number, reason: string | null) {
  const parent = nameOf(parentId);
  return notifyPeople([childId], 'outcome', (lang) =>
    tr(lang, amount > 0 ? 'notify.coinsAdded' : 'notify.coinsRemoved', { parent, coins: Math.abs(amount) }) + (reason ? ` — ${reason}` : ''));
}
