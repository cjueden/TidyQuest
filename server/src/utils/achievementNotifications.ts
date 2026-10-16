import db from '../database';
import { ACHIEVEMENTS } from './achievements';
import { achievementsFor } from './achievementStats';
import { isNotificationTypeEnabled, sendNotification } from './notifications';
import { tr } from './i18n';

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
  if (!isNotificationTypeEnabled('achievementUnlocked')) {
    checkAndRecordNewAchievements(userId);
    return;
  }
  const newIds = checkAndRecordNewAchievements(userId);
  if (newIds.length === 0) return;
  const user = db.prepare('SELECT displayName FROM users WHERE id = ?').get(userId) as { displayName: string } | undefined;
  const name = user?.displayName || 'User';
  for (const id of newIds) {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    await sendNotification(`🏆 ${name} unlocked an achievement: ${def ? tr('en', def.titleKey) : id}`);
  }
}
