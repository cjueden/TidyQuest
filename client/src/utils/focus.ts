// One thing at a time (components/pages/Focus.tsx): steps and today's skipped chores.

const today = () => new Date().toLocaleDateString('en-CA');
const skipKey = (userId: number) => `tq-focus-skips-${userId}`;

export function loadSkips(userId: number): number[] {
  try {
    const s = JSON.parse(localStorage.getItem(skipKey(userId)) || 'null');
    return s && s.day === today() && Array.isArray(s.ids) ? s.ids : [];
  } catch {
    return [];
  }
}

export function choreSteps(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string' && s.trim()) : [];
  } catch {
    return [];
  }
}

/** Today's line with skipped chores moved to the back, in the order they were skipped */
export function orderLine<T extends { id: number }>(line: T[], skips: number[]): T[] {
  const skipped = skips.map((id) => line.find((t) => t.id === id)).filter((t): t is T => !!t);
  return [...line.filter((t) => !skips.includes(t.id)), ...skipped];
}

export function saveSkips(userId: number, ids: number[]) {
  try { localStorage.setItem(skipKey(userId), JSON.stringify({ day: today(), ids })); } catch { /* still skipped until a reload */ }
}
