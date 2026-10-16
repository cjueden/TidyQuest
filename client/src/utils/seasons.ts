import { useSyncExternalStore } from 'react';

/**
 * Seasonal styling: the whole app dresses up for the holidays. One entry per holiday; to add one, add it here,
 * add its palette to index.css (html[data-season-colors='<id>']), its name to the i18n `seasons` section and its id
 * to HOLIDAYS in server/src/utils/features.ts.
 */
export type SeasonId = 'halloween' | 'thanksgiving' | 'christmas';

export interface Season {
  id: SeasonId;
  /** Months it's on (1–12; whole months for now) */
  months: number[];
  /** The day the Home greeting counts down to */
  day: (year: number) => Date;
  /** Dark palette (inputs get the dark styling) */
  dark: boolean;
  /** For the Settings list: page background and accent */
  swatch: { bg: string; accent: string };
  /** Decoration strip under the header, repeated across the width */
  strip: string[];
  /** Background pattern: a small SVG tile, drawn faintly behind the page */
  pattern: string;
  /** Light falling or flying things; 'fall' drifts down, 'fly' crosses the screen */
  particles: { emoji: string[]; style: 'fall' | 'fly' };
  /** Celebration shapes and colors */
  confetti: { emoji: string[]; colors: string[] };
  /** The house mascot's costume (round 3 item 7) */
  costume: string;
}

/** The nth weekday (0 = Sunday) of a month (0-based), e.g. Thanksgiving = 4th Thursday of November */
const nthWeekday = (year: number, month: number, weekday: number, n: number) => {
  const first = new Date(year, month, 1).getDay();
  return new Date(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
};

const svg = (body: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'>${body}</svg>`)}")`;

export const SEASONS: Season[] = [
  {
    id: 'halloween',
    months: [10],
    day: (y) => new Date(y, 9, 31),
    dark: true,
    swatch: { bg: '#17111F', accent: '#F97316' },
    strip: ['🎃', '🦇', '🕸️', '👻', '🍬', '🦇'],
    pattern: svg(
      // a bat and a pumpkin
      `<g fill='#A78BFA' fill-opacity='0.09'><path d='M20 34c4-6 9-8 12-4 1-3 3-4 5-4s4 1 5 4c3-4 8-2 12 4-4-1-7 0-9 3-1-2-3-2-4 0-1-1-2-2-4-2s-3 1-4 2c-1-2-3-2-4 0-2-3-5-4-9-3z'/></g>` +
      `<g fill='#F97316' fill-opacity='0.06'><ellipse cx='98' cy='102' rx='17' ry='14'/><rect x='96' y='83' width='4' height='7' rx='1.5' fill='#65A30D'/></g>`,
    ),
    particles: { emoji: ['🦇'], style: 'fly' },
    confetti: { emoji: ['🎃', '🦇', '👻', '🍬'], colors: ['#F97316', '#A855F7', '#84CC16', '#FBBF24'] },
    costume: 'witch',
  },
  {
    id: 'thanksgiving',
    months: [11],
    day: (y) => nthWeekday(y, 10, 4, 4),
    dark: false,
    swatch: { bg: '#FBF3E6', accent: '#C2410C' },
    strip: ['🍂', '🦃', '🍁', '🌽', '🥧', '🍁'],
    pattern: svg(
      // two leaves
      `<g fill='#C2410C' fill-opacity='0.07'><path d='M30 20c14 2 22 12 20 28-16-2-24-12-20-28z'/><path d='M100 88c-12 6-16 18-10 30 12-6 16-18 10-30z' fill='#B45309'/></g>`,
    ),
    particles: { emoji: ['🍂', '🍁'], style: 'fall' },
    confetti: { emoji: ['🍂', '🍁', '🦃'], colors: ['#C2410C', '#D97706', '#92400E', '#EAB308'] },
    costume: 'pilgrim',
  },
  {
    id: 'christmas',
    months: [12],
    day: (y) => new Date(y, 11, 25),
    dark: false,
    swatch: { bg: '#F7FAFC', accent: '#DC2626' },
    strip: ['🎄', '❄️', '🎁', '⭐', '🔔', '❄️'],
    pattern: svg(
      // two snowflakes
      `<g stroke='#3B82F6' stroke-opacity='0.12' stroke-width='2' stroke-linecap='round'><path d='M35 20v30M22 27l26 16M22 43l26-16'/><path d='M105 92v24M95 98l20 12M95 110l20-12'/></g>`,
    ),
    particles: { emoji: ['❄️'], style: 'fall' },
    confetti: { emoji: ['❄️', '⭐', '🎄', '🎁'], colors: ['#DC2626', '#16A34A', '#FBBF24', '#FFFFFF'] },
    costume: 'santa',
  },
];

export const seasonById = (id: string | null | undefined) => SEASONS.find((s) => s.id === id) ?? null;

/** Parents can preview a holiday outside its month (Settings → Features). Kept for this browser tab only. */
const PREVIEW_KEY = 'tidyquest_season_preview';
const listeners = new Set<() => void>();
const readPreview = () => { try { return sessionStorage.getItem(PREVIEW_KEY); } catch { return null; } };
let preview = readPreview();

export function setSeasonPreview(id: SeasonId | null) {
  preview = id;
  try {
    if (id) sessionStorage.setItem(PREVIEW_KEY, id); else sessionStorage.removeItem(PREVIEW_KEY);
  } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

export const useSeasonPreview = () => useSyncExternalStore(
  (l) => { listeners.add(l); return () => listeners.delete(l); },
  () => preview,
);

/** The holiday showing now: a preview wins; otherwise the device's date, if the family has it on. */
export function activeSeason(opts: { enabled: boolean; off: string[]; preview: string | null; now?: Date }): Season | null {
  const previewed = seasonById(opts.preview);
  if (previewed) return previewed;
  if (!opts.enabled) return null;
  const month = (opts.now ?? new Date()).getMonth() + 1;
  return SEASONS.find((s) => s.months.includes(month) && !opts.off.includes(s.id)) ?? null;
}

/** Whole days from today until the season's day (0 = today, negative = it's passed). */
export function daysUntil(season: Season, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((season.day(now.getFullYear()).getTime() - today.getTime()) / 86400000);
}
