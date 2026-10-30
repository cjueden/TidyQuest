import db from '../database';
import { isHosted } from '../hosted/context';

/**
 * Optional extras a family can switch off (Settings → Features). On by default; stored as JSON in
 * app_settings 'features', only where a family's choice differs from the default.
 */
export const FEATURES = ['rescue', 'usual', 'forgot', 'todos', 'boardAwards', 'levels', 'nextBadge', 'seasonal', 'cheers', 'mascot', 'teamups', 'mascotShop', 'focus', 'shields', 'proofPhotos'] as const;
export type Feature = typeof FEATURES[number];

/** Proof photos start off in hosted mode until the lawyer signs off on kids' photos (ROADMAP decision 7). */
export const featureDefault = (f: Feature) => !(f === 'proofPhotos' && isHosted());

export function getFeatures(): Record<Feature, boolean> {
  let stored: Partial<Record<Feature, boolean>> = {};
  try {
    const raw = (db.prepare("SELECT value FROM app_settings WHERE key = 'features'").get() as { value: string } | undefined)?.value;
    if (raw) stored = JSON.parse(raw);
  } catch { /* fall back to the defaults */ }
  return Object.fromEntries(FEATURES.map((f) => [f, typeof stored[f] === 'boolean' ? stored[f] : featureDefault(f)])) as Record<Feature, boolean>;
}

export const isFeatureOn = (f: Feature) => getFeatures()[f];

/** The Rescue Mission's multiplier (Settings → Features; 2 by default). */
export function rescueMultiplier(): number {
  const v = Number((db.prepare("SELECT value FROM app_settings WHERE key = 'rescueMultiplier'").get() as { value: string } | undefined)?.value);
  return v >= 1.5 && v <= 5 ? v : 2;
}

/** Holidays the seasonal styling knows (client/src/utils/seasons.ts has their looks and dates). */
export const HOLIDAYS = ['halloween', 'thanksgiving', 'christmas'] as const;

/** Holidays the family switched off one by one (app_settings 'holidaysOff', a JSON array). */
export function holidaysOff(): string[] {
  try {
    const raw = (db.prepare("SELECT value FROM app_settings WHERE key = 'holidaysOff'").get() as { value: string } | undefined)?.value;
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((h) => (HOLIDAYS as readonly string[]).includes(h)) : [];
  } catch { return []; }
}
