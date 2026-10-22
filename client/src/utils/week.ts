import { createContext, useContext } from 'react';

/**
 * The family's first day of the week, like Date.getDay(): 1 = Monday (the default), 0 = Sunday.
 * Chosen in Settings → General, sent with the dashboard (weekStart) and provided by App.
 */
export const WeekStartContext = createContext(1);

export const useWeekStart = () => useContext(WeekStartContext);

/** The weekdays in display order, starting with `first`, as getDay() numbers. */
export const weekOrder = (first: number) => Array.from({ length: 7 }, (_, i) => (first + i) % 7);

/** Local midnight on the first day of the week holding `d`. */
export function startOfWeek(d: Date, first: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() - first + 7) % 7));
}
