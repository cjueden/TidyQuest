import db from '../database';
import { achievementsFor, badgeInfo } from './achievementStats';
import { notifyBadge } from './notifyMessages';

/**
 * Synchronously checks which achievements are newly unlocked for a user,
 * records them in user_achievement_notifications (where earned badges are kept), and returns their IDs.
 * Safe to call inline before sending a response.
 */
export function checkAndRecordNewAchievements(userId: number): string[] {
  const gamifRow = db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  if (gamifRow && gamifRow.value === '0') return [];
  return achievementsFor(userId, { record: true })?.newlyEarned ?? [];
}

/**
 * Async: sends Telegram/ntfy notifications for newly unlocked achievements.
 * Calls checkAndRecordNewAchievements internally.
 */
export async function notifyAchievementUnlocksForUser(userId: number): Promise<void> {
  const newIds = checkAndRecordNewAchievements(userId);
  for (const badge of badgeInfo(userId, newIds)) await notifyBadge(userId, badge);
}
