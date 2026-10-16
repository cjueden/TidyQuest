import { useTranslation } from '../../hooks/useTranslation';
import { useCosmetic } from '../../utils/unlocks';

/** The title someone picked (level 5 unlock): their level's title or a badge they earned. Nothing if none. */
export function UserTitle({ userId, language, style }: { userId?: number | null; language?: string; style?: React.CSSProperties }) {
  const { t } = useTranslation(language);
  const c = useCosmetic(userId);
  const text = c?.titleKey ? t(c.titleKey) : c?.titleText;
  if (!text) return null;
  return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-accent)', ...style }}>🏷️ {text}</span>;
}
