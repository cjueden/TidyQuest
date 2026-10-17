import { createContext, useContext } from 'react';

/** Unlockables (server/src/utils/unlocks.ts has the rules; these are the looks). */
export interface Cosmetic { level: number; frame: string | null; frameIcon?: string; celebration: string; titleKey?: string; titleText?: string }
export type Celebration = 'confetti' | 'coins' | 'fireworks';

/** The level each new theme unlocks at (the 8 original themes are free) */
export const THEME_LEVELS: Record<string, number> = { forest: 4, galaxy: 7, lava: 10 };

/** Avatar frame rings */
export const FRAME_RINGS: Record<string, string> = {
  bronze: 'linear-gradient(135deg, #F0B27A, #A0522D)',
  silver: 'linear-gradient(135deg, #F8FAFC, #94A3B8)',
  gold: 'linear-gradient(135deg, #FDE68A, #D97706)',
  rainbow: 'conic-gradient(#EF4444, #F59E0B, #EAB308, #22C55E, #3B82F6, #8B5CF6, #EC4899, #EF4444)',
};
export const BADGE_FRAME_RING = 'linear-gradient(135deg, #FEF3C7, #F59E0B 60%, #B45309)';
export const BADGE_FRAME_EMOJI: Record<string, string> = { crown: '👑', diamond: '💎' };

/** Everyone's frame, title and celebration, from the dashboard (App provides it) */
export const CosmeticsContext = createContext<Record<number, Cosmetic>>({});
export const useCosmetic = (userId?: number | null) => {
  const all = useContext(CosmeticsContext);
  return userId != null ? all[userId] : undefined;
};

/** "the Galaxy theme", "a silver frame": i18n key for what an unlock gives */
export const unlockLabelKey = (kind: string, id: string) => `unlocks.${kind}_${id}`;
