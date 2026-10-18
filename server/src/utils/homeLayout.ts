/**
 * Each person's Home layout (ENH-6): the card order and the hidden cards, saved on the server so it
 * follows them to every device. Card ids are the client's (Dashboard.tsx HOME_CARDS); unknown ids are
 * kept (a newer client may know them) and the client drops what it doesn't have.
 */
export interface HomeLayout { order: string[]; hidden: string[] }

const MAX_CARDS = 60;
const CARD_ID = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

/** A layout from a request: { order, hidden }, or null to go back to the default. */
export function readHomeLayout(v: unknown): { value: string | null } | { error: string } {
  if (v === null) return { value: null };
  if (typeof v !== 'object' || Array.isArray(v)) return { error: 'invalid_home_layout' };
  const { order, hidden } = v as Record<string, unknown>;
  const ids = (list: unknown) => Array.isArray(list) && list.length <= MAX_CARDS && list.every((id) => typeof id === 'string' && CARD_ID.test(id));
  if (!ids(order ?? []) || !ids(hidden ?? [])) return { error: 'invalid_home_layout' };
  const layout: HomeLayout = { order: [...new Set((order ?? []) as string[])], hidden: [...new Set((hidden ?? []) as string[])] };
  return { value: JSON.stringify(layout) };
}

/** The stored layout, or null when the person never changed it */
export function parseHomeLayout(raw: unknown): HomeLayout | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && Array.isArray(v.order) && Array.isArray(v.hidden) ? { order: v.order, hidden: v.hidden } : null;
  } catch {
    return null;
  }
}
