// Each person's Home layout (ENH-6): the card order and hidden cards, saved on the server
// (users.homeLayout via the profile route) so it follows them to every device.

export interface HomeLayout { order: string[]; hidden: string[] }

/** Home's cards in their default order (Dashboard.tsx renders them from this list) */
export const HOME_CARDS = [
  'focus', 'mascot', 'teamups', 'houseHealth', 'pendingApprovals', 'rescue', 'usual', 'forgot', 'todaysQuests',
  'todo', 'scheduled', 'completedToday', 'rooms', 'streak', 'coins', 'myGoal', 'childrenGoals', 'rewardRequests',
  'leaderboard', 'recentActivity',
] as const;
export type HomeCardId = typeof HOME_CARDS[number];

/** Kid mode keeps Home to the essentials; kids arrange and hide within these */
export const KID_CARDS: ReadonlySet<string> = new Set(['focus', 'mascot', 'teamups', 'rescue', 'usual', 'forgot', 'todaysQuests', 'todo', 'completedToday']);

/**
 * The saved order with unknown ids dropped and any card it doesn't mention (added in a later version)
 * slotted in after the card it follows by default.
 */
export function resolveOrder(saved: readonly string[], defaults: readonly string[] = HOME_CARDS): string[] {
  const known = new Set(defaults);
  const order = [...new Set(saved.filter((id) => known.has(id)))];
  defaults.forEach((id, i) => {
    if (order.includes(id)) return;
    const before = defaults.slice(0, i).reverse().find((d) => order.includes(d));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  return order;
}

/** Move one card up or down among the cards in `among` (the ones in the Customise list) */
export function moveCard(order: readonly string[], id: string, dir: -1 | 1, among: readonly string[]): string[] {
  const listed = order.filter((c) => among.includes(c));
  const i = listed.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= listed.length) return [...order];
  return placeCard(order, id, listed[j], dir > 0 ? 'after' : 'before');
}

/** Put a card right before or after another one */
export function placeCard(order: readonly string[], id: string, target: string, where: 'before' | 'after'): string[] {
  if (id === target) return [...order];
  const rest = order.filter((c) => c !== id);
  const at = rest.indexOf(target);
  if (at < 0) return [...order];
  rest.splice(where === 'after' ? at + 1 : at, 0, id);
  return rest;
}

/** The hidden set the old Customise kept in this browser (before layouts were saved per person) */
export const LEGACY_HIDDEN_KEY = 'tq-dashboard-cards';
export function legacyHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LEGACY_HIDDEN_KEY) || '[]');
    return Array.isArray(v) ? v.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
