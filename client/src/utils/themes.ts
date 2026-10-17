/** The color themes (index.css: html[data-theme=…]; orange is the default, no attribute). */
/** The 8 free themes, then the ones unlocked by levels (utils/unlocks.ts THEME_LEVELS) */
export const THEMES = ['orange', 'blue', 'rose', 'mint', 'grape', 'sunny', 'night', 'ocean', 'forest', 'galaxy', 'lava'] as const;
export type Theme = typeof THEMES[number];

/** Swatches for the picker: page background and accent. */
export const THEME_SWATCHES: Record<Theme, { bg: string; accent: string }> = {
  orange: { bg: '#FFF8F0', accent: '#F97316' },
  blue: { bg: '#F3F9FF', accent: '#3B82F6' },
  rose: { bg: '#FFF5F8', accent: '#EC4899' },
  mint: { bg: '#F2FBF6', accent: '#10B981' },
  grape: { bg: '#F7F4FF', accent: '#8B5CF6' },
  sunny: { bg: '#FFFBEA', accent: '#EAB308' },
  night: { bg: '#0B0F19', accent: '#60A5FA' },
  ocean: { bg: '#071A1F', accent: '#2DD4BF' },
  forest: { bg: '#F3F8F1', accent: '#2F855A' },
  galaxy: { bg: '#0D0B1E', accent: '#A78BFA' },
  lava: { bg: '#170A08', accent: '#F97316' },
};

export const isTheme = (v: unknown): v is Theme => typeof v === 'string' && (THEMES as readonly string[]).includes(v);
export const themeLabelKey = (theme: Theme) => `settings.theme${theme[0].toUpperCase()}${theme.slice(1)}`;
