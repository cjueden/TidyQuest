import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { badgeRemaining, badgeTitle, BUILTIN_ICONS, type BadgeItem, type LevelInfo } from '../../utils/badges';
import { formatCoins } from '../../utils/format';

/** Home: the person's level and the closest badge still to earn; tapping opens Achievements. */
export function LevelStrip({ level, nextBadge, language, big = false }: {
  level: LevelInfo | null;
  nextBadge: BadgeItem | null;
  language?: string;
  /** Kid mode: larger text */
  big?: boolean;
}) {
  const { t } = useTranslation(language);
  const navigate = useNavigate();
  if (!level && !nextBadge) return null;
  return (
    <button onClick={() => navigate('/achievements')} className="level-strip" style={{
      display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left', padding: 0, border: 'none',
      background: 'none', cursor: 'pointer', fontFamily: 'Nunito', color: 'inherit',
    }}>
      {level && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: big ? 16 : 13, fontWeight: 900, color: 'var(--warm-text)' }}>
            <span>⭐ {t('levels.level').replace('{n}', String(level.level))} · {t(level.titleKey)}</span>
            <span style={{ fontSize: big ? 13 : 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
              {t('levels.toNext').replace('{n}', formatCoins(level.nextLevelAt - level.coinsEarned)).replace('{level}', String(level.level + 1))}
            </span>
          </span>
          <span style={{ height: big ? 10 : 6, borderRadius: 99, background: 'var(--health-bar-track)', overflow: 'hidden', display: 'block' }}>
            <span style={{ display: 'block', width: `${level.progress}%`, height: '100%', background: 'linear-gradient(90deg, #A78BFA, #7C3AED)' }} />
          </span>
        </span>
      )}
      {nextBadge && (
        <span style={{ fontSize: big ? 14 : 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
          {t('badges.nextUp')}{' '}
          <strong style={{ color: 'var(--warm-text)' }}>{BUILTIN_ICONS.has(nextBadge.icon) ? '🏅' : nextBadge.icon} {badgeTitle(nextBadge, t)}</strong>
          {' · '}{badgeRemaining(nextBadge, t)}
        </span>
      )}
    </button>
  );
}
