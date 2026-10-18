// Shared task helpers used by the room page, the task list and search.
import { localeFor } from './locale';

export function getNextDueDate(lastCompletedAt: string | null, frequencyDays: number): Date {
  if (!lastCompletedAt) return new Date();
  const last = new Date(lastCompletedAt);
  return new Date(last.getTime() + frequencyDays * 24 * 60 * 60 * 1000);
}

/** When a task is next due: the server's nextDueAt (knows set weekdays) when sent, else the rolling interval. */
export function taskNextDue(task: { lastCompletedAt: string | null; frequencyDays: number; nextDueAt?: string | null }): Date {
  return task.nextDueAt ? new Date(task.nextDueAt) : getNextDueDate(task.lastCompletedAt, task.frequencyDays);
}

export function formatNextDue(lastCompletedAt: string | null, frequencyDays: number, t: (k: string) => string, language?: string, health?: number, nextDueAt?: string | null): { text: string; color: string } {
  const nextDue = taskNextDue({ lastCompletedAt, frequencyDays, nextDueAt });
  const now = new Date();

  // Time-based countdown for tasks due within the next 24 hours
  const diffMs = nextDue.getTime() - now.getTime();
  // Only show overdue when health is truly 0 (aligns with server-side calculation)
  if (diffMs < 0 && (health === undefined || health <= 0)) return { text: t('roomDetail.overdue'), color: 'var(--health-red)' };
  if (diffMs < 0) return { text: t('roomDetail.inMinutes').replace('{m}', '1'), color: 'var(--health-yellow)' };

  const diffMinutes = Math.ceil(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const remainingMinutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));

  if (diffMinutes < 60) {
    return { text: t('roomDetail.inMinutes').replace('{m}', `${Math.max(1, diffMinutes)}`), color: 'var(--health-yellow)' };
  }
  if (diffHours < 24) {
    const text = remainingMinutes > 0
      ? t('roomDetail.inHoursMinutes').replace('{h}', `${diffHours}`).replace('{m}', `${remainingMinutes}`)
      : t('roomDetail.inHours').replace('{h}', `${diffHours}`);
    return { text, color: 'var(--health-yellow)' };
  }

  // Day-based display for tasks due further out
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate());
  const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 1) return { text: t('roomDetail.tomorrow'), color: 'var(--health-yellow)' };
  const locale = localeFor(language);
  const text = nextDue.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  return { text, color: diffDays <= 7 ? 'var(--health-yellow)' : 'var(--health-green)' };
}

/** Coins a completion pays: a custom amount wins over the effort default (same rule as the server). */
export function taskCoins(task: { effort: number; customCoins?: number | null }, coinsByEffort?: Record<number, number>): number {
  return task.customCoins != null && task.customCoins > 0 ? task.customCoins : (coinsByEffort?.[task.effort] ?? task.effort * 5);
}

/** Scheduled task whose due date has passed (matches the dashboard's "Ready to complete"). */
export function isTaskDue(task: { onDemand?: boolean | number; isSeasonal?: boolean; lastCompletedAt: string | null; frequencyDays: number; nextDueAt?: string | null }): boolean {
  return !task.onDemand && !task.isSeasonal && taskNextDue(task).getTime() <= Date.now();
}

/** Lower-case and strip accents so "creme" finds "Crème". */
export function normalizeForSearch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Every word of the query must appear somewhere in the given fields. */
export function matchesQuery(query: string, fields: Array<string | null | undefined>): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeForSearch(fields.filter(Boolean).join(' \u0000 '));
  return words.every((w) => haystack.includes(w));
}

/** Can this person do the task? Mirrors the server's assignment rules (room owner or task assignees,
 * "any child" tasks, otherwise open to anyone). */
export function isTaskForUser(task: { effectiveAssignedUserIds?: number[]; assignedToChildren?: boolean }, userId: number, role?: string): boolean {
  const ids = task.effectiveAssignedUserIds || [];
  if (ids.length > 0) return ids.includes(userId);
  if (task.assignedToChildren) return role === 'child';
  return true;
}

