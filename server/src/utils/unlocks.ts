import db from '../database';
import { ACHIEVEMENTS } from './achievements';
import { customBadgeKey, levelFor } from './badges';

/**
 * Unlockables (round 3): each level unlocks something to show off. All 8 original themes stay free;
 * the unlockable themes are new. Everyone plays, parents too. Levels never go down, so an unlock stays.
 */
export type UnlockKind = 'frame' | 'theme' | 'celebration' | 'title';
export const UNLOCKS: Array<{ level: number; kind: UnlockKind; id: string }> = [
  { level: 2, kind: 'frame', id: 'bronze' },
  { level: 3, kind: 'celebration', id: 'coins' },
  { level: 4, kind: 'theme', id: 'forest' },
  { level: 5, kind: 'title', id: 'title' },
  { level: 6, kind: 'frame', id: 'silver' },
  { level: 7, kind: 'theme', id: 'galaxy' },
  { level: 8, kind: 'celebration', id: 'fireworks' },
  { level: 9, kind: 'frame', id: 'gold' },
  { level: 10, kind: 'frame', id: 'rainbow' },
  { level: 10, kind: 'theme', id: 'lava' },
];
export const UNLOCKABLE_THEMES = UNLOCKS.filter((u) => u.kind === 'theme').map((u) => u.id);
const TITLE_LEVEL = UNLOCKS.find((u) => u.kind === 'title')!.level;
/** The hardest built-in badges (crown and diamond) each unlock a matching frame */
const BADGE_FRAME_ICONS = ['crown', 'diamond'];

/** Coins earned over all time: approved chores plus coins given (the level's measure; it never goes down) */
export function lifetimeCoins(userId: number): number {
  const tasks = (db.prepare("SELECT COALESCE(SUM(coinsEarned), 0) AS n FROM task_completions WHERE userId = ? AND status = 'approved'").get(userId) as { n: number }).n;
  const given = (db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM coin_adjustments WHERE userId = ? AND amount > 0').get(userId) as { n: number }).n;
  return tasks + given;
}
export const levelOf = (userId: number) => levelFor(lifetimeCoins(userId)).level;

const earnedBadges = (userId: number) => new Set((db.prepare('SELECT achievementId FROM user_achievement_notifications WHERE userId = ?').all(userId) as { achievementId: string }[]).map((r) => r.achievementId));

/** Badge frames this person could have: earned ones are unlocked */
export function badgeFrames(userId: number, earned = earnedBadges(userId)) {
  return ACHIEVEMENTS.filter((a) => BADGE_FRAME_ICONS.includes(a.icon) && (!a.secret || earned.has(a.id)))
    .map((a) => ({ id: `badge:${a.id}`, titleKey: a.titleKey, icon: a.icon, unlocked: earned.has(a.id) }));
}

/** Titles to pick from (from level 5): the level's own title, or any badge earned, built-in or the family's */
export function titleOptions(userId: number, earned = earnedBadges(userId)): Array<{ id: string; titleKey?: string; text?: string }> {
  const builtIn = ACHIEVEMENTS.filter((a) => earned.has(a.id)).map((a) => ({ id: `badge:${a.id}`, titleKey: a.titleKey }));
  const custom = (db.prepare('SELECT id, title, icon FROM custom_badges').all() as Array<{ id: number; title: string; icon: string }>)
    .filter((b) => earned.has(customBadgeKey(b.id))).map((b) => ({ id: `badge:${customBadgeKey(b.id)}`, text: `${b.icon} ${b.title}` }));
  return [{ id: 'level' }, ...builtIn, ...custom];
}

/** Whether this person may use an unlockable (null = the default, always allowed) */
export function canUse(userId: number, kind: 'frame' | 'celebration' | 'title' | 'theme', id: string | null): boolean {
  if (id === null || (kind === 'celebration' && id === 'confetti')) return true;
  if (kind === 'theme' && !UNLOCKABLE_THEMES.includes(id)) return true; // the 8 free ones
  const level = levelOf(userId);
  if (kind === 'frame' && id.startsWith('badge:')) return badgeFrames(userId).some((f) => f.id === id && f.unlocked);
  if (kind === 'title') return level >= TITLE_LEVEL && titleOptions(userId).some((o) => o.id === id);
  const u = UNLOCKS.find((x) => x.kind === kind && x.id === id);
  return !!u && level >= u.level;
}

/** What one person has unlocked and picked (Profile's Unlocks card) */
export function unlocksFor(userId: number) {
  const level = levelOf(userId);
  const earned = earnedBadges(userId);
  const me = db.prepare('SELECT avatarFrame, celebration, title, theme FROM users WHERE id = ?').get(userId) as { avatarFrame: string | null; celebration: string | null; title: string | null; theme: string | null };
  return {
    level,
    items: UNLOCKS.map((u) => ({ ...u, unlocked: level >= u.level })),
    badgeFrames: badgeFrames(userId, earned),
    titles: level >= TITLE_LEVEL ? titleOptions(userId, earned) : [],
    titleLevel: TITLE_LEVEL,
    chosen: { frame: me.avatarFrame, celebration: me.celebration ?? 'confetti', title: me.title, theme: me.theme },
    next: UNLOCKS.find((u) => u.level > level) ?? null,
  };
}

/** Everyone's frame, title, celebration and level, for avatars and names across the app */
export function cosmetics(): Record<number, { level: number; frame: string | null; frameIcon?: string; celebration: string; titleKey?: string; titleText?: string }> {
  const users = db.prepare('SELECT id, avatarFrame, celebration, title FROM users').all() as Array<{ id: number; avatarFrame: string | null; celebration: string | null; title: string | null }>;
  const custom = new Map((db.prepare('SELECT id, title, icon FROM custom_badges').all() as Array<{ id: number; title: string; icon: string }>).map((b) => [customBadgeKey(b.id), `${b.icon} ${b.title}`]));
  const out: ReturnType<typeof cosmetics> = {};
  for (const u of users) {
    const level = levelFor(lifetimeCoins(u.id));
    const entry: ReturnType<typeof cosmetics>[number] = { level: level.level, frame: u.avatarFrame, celebration: u.celebration ?? 'confetti' };
    // A badge frame carries its badge's icon (crown or diamond)
    if (u.avatarFrame?.startsWith('badge:')) entry.frameIcon = ACHIEVEMENTS.find((a) => a.id === u.avatarFrame!.slice(6))?.icon;
    if (u.title === 'level') entry.titleKey = level.titleKey;
    else if (u.title?.startsWith('badge:')) {
      const id = u.title.slice(6);
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (def) entry.titleKey = def.titleKey; else if (custom.has(id)) entry.titleText = custom.get(id);
    }
    out[u.id] = entry;
  }
  return out;
}
