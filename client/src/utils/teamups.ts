import type { TeamUpInfo } from '../hooks/useApi';

/** "🤝 Cecil + Cylis": the Done button's label on a chore another team has claimed */
export const claimedLabel = (info?: TeamUpInfo | null) => (info?.claimedBy ? `🤝 ${info.claimedBy.join(' + ')}` : null);
