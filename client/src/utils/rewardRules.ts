import type { RewardRules } from '../hooks/useApi';

/** A one-line summary of a reward's rules for the admin list, e.g. "Cecil · 1×/week · Shared". */
export function rulesSummary(r: Partial<RewardRules>, family: Array<{ id: number; displayName: string }>, t: (k: string) => string): string {
  const parts: string[] = [];
  if (r.visibleTo && r.visibleTo.length) parts.push(r.visibleTo.map((id) => family.find((m) => m.id === id)?.displayName ?? '?').join(', '));
  if (r.prices && Object.keys(r.prices).length) parts.push(t('rewardRules.customPrices'));
  if (r.limitCount) parts.push(`${r.limitCount}× ${t(`rewardRules.per_${r.limitPeriod ?? 'ever'}`)}`);
  if (r.availableFrom || r.availableUntil) parts.push(`${r.availableFrom ?? '…'} – ${r.availableUntil ?? '…'}`);
  if (r.isRotating) parts.push(t('rewardRules.rotating'));
  if (r.isShared) parts.push(t('rewardRules.shared'));
  return parts.join(' · ');
}

/** The parents' "Featured" order: placed rewards first (sortOrder 1, 2, …), then the rest by price. */
export function byFeatured(a: { sortOrder?: number | null; costCoins: number; id: number }, b: { sortOrder?: number | null; costCoins: number; id: number }): number {
  const rank = (r: { sortOrder?: number | null }) => (r.sortOrder && r.sortOrder > 0 ? r.sortOrder : Number.MAX_SAFE_INTEGER);
  return rank(a) - rank(b) || a.costCoins - b.costCoins || a.id - b.id;
}
