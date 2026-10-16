/** Badges, levels and the "next badge" line: the wording shared by the Achievements page, Home and Settings. */

export interface BadgeItem {
  id: string;
  custom?: boolean;
  titleKey?: string | null;
  title?: string | null;
  descKey?: string | null;
  description?: string | null;
  icon: string;
  metric?: string;
  threshold: number;
  value: number;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string | null;
  secret?: boolean;
  bonusCoins?: number;
  /** Built-in ladder (several badges for the same number) this one is a step of */
  ladder?: string | null;
}

export interface LevelInfo {
  level: number;
  titleKey: string;
  coinsEarned: number;
  levelStartsAt: number;
  nextLevelAt: number;
  progress: number;
}

type T = (key: string) => string;

export function badgeTitle(a: BadgeItem, t: T): string {
  if (a.secret && !a.unlocked && !a.titleKey && !a.title) return t('badges.secret');
  return a.titleKey ? t(a.titleKey) : a.title ?? a.id;
}

/** What it takes: the description, or for a parent-made badge without one, its rule. */
export function badgeDescription(a: BadgeItem, t: T): string {
  if (a.secret && !a.unlocked && !a.descKey && !a.description) return t('badges.secretDesc');
  if (a.descKey) return t(a.descKey);
  if (a.description) return a.description;
  return badgeRule(a.metric ?? '', a.threshold, t);
}

/** "Do it 10 times", "Do it once", "A 7-day streak" … */
export function badgeRule(metric: string, threshold: number, t: T): string {
  const one = `badges.rule_${metric}_one`;
  if (threshold === 1 && t(one) !== one) return t(one);
  return t(`badges.rule_${metric}`).replace('{n}', String(threshold));
}

/** "7 more chores" for the next-badge line. */
export function badgeRemaining(a: BadgeItem, t: T): string {
  const n = Math.max(0, a.threshold - a.value);
  const key = `badges.more_${a.metric}`;
  const text = n === 1 && t(`${key}_one`) !== `${key}_one` ? t(`${key}_one`) : t(key);
  return (text === key ? t('badges.more_default') : text).replace('{n}', String(n));
}

/** Medal names for the steps of a ladder: bronze, silver, gold, platinum, then legend. */
export const TIER_KEYS = ['achievements.badge_bronze', 'achievements.badge_silver', 'achievements.badge_gold', 'achievements.badge_platinum', 'achievements.badge_legend'];
export const TIER_COLORS = ['#CD7F32', '#94A3B8', '#F59E0B', '#7DD3FC', '#A78BFA'];
export const tierIndex = (step: number) => Math.min(step, TIER_KEYS.length - 1);

/** Built-in icon names the page draws itself; anything else is an emoji from a parent-made badge. */
export const BUILTIN_ICONS = new Set(['spark', 'fire', 'coin', 'star', 'crown', 'broom', 'heart', 'shield', 'rocket', 'diamond']);
