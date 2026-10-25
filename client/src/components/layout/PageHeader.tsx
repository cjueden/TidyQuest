import { useContext } from 'react';
import { FireIcon, CoinIcon, PointsIcon } from '../icons/UIIcons';
import { ShieldIcons } from '../shared/StreakShields';
import { SearchContext } from '../shared/searchContext';
import { SearchIcon } from '../shared/SearchOverlay';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCoins } from '../../utils/format';
import type { User } from '../../hooks/useAuth';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  user: User;
  rightContent?: React.ReactNode;
  onCoinsClick?: () => void;
  onStreakClick?: () => void;
  onPointsClick?: () => void;
  userPoints?: number;
  pointsPeriodLabel?: string;
  gamificationEnabled?: boolean;
  /** Streak shields are on: show the ones held next to the streak */
  shieldsOn?: boolean;
}

export function PageHeader({ title, subtitle, user, rightContent, onCoinsClick, onStreakClick, onPointsClick, userPoints, pointsPeriodLabel, gamificationEnabled = true, shieldsOn = false }: PageHeaderProps) {
  const openSearch = useContext(SearchContext);
  const { t } = useTranslation(user.language);
  return (
    <div className="page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 16px', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--warm-text)', margin: 0, letterSpacing: -0.5 }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--warm-text-light)', fontWeight: 600, marginTop: 3 }}>
          {subtitle}
        </p>
      </div>
      <div className="page-header-actions" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
        {openSearch && (
          <button
            onClick={openSearch}
            aria-label={t('search.button')}
            title={`${t('search.button')} (/)`}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              backgroundColor: 'var(--warm-accent-light)', borderRadius: 14, padding: '8px 14px',
              border: '1.5px solid var(--warm-streak-border)', cursor: 'pointer',
              color: 'var(--warm-streak-text)', fontFamily: 'Nunito', fontSize: 14, fontWeight: 800,
            }}
          >
            <SearchIcon size={17} />
            <span className="search-button-label">{t('search.button')}</span>
          </button>
        )}
        {rightContent}
        {gamificationEnabled && (
        <>
        <div
          onClick={onStreakClick}
          role={onStreakClick ? 'button' : undefined}
          tabIndex={onStreakClick ? 0 : -1}
          onKeyDown={(e) => {
            if (!onStreakClick) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onStreakClick();
            }
          }}
          style={{
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundColor: 'var(--warm-accent-light)', borderRadius: 14, padding: '8px 16px',
          border: '1.5px solid var(--warm-streak-border)',
          cursor: onStreakClick ? 'pointer' : 'default',
        }}>
          <FireIcon />
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-streak-text)' }}>{user.currentStreak}</span>
          {shieldsOn && <ShieldIcons count={user.streakShields} language={user.language} style={{ fontSize: 13 }} />}
        </div>
        <div
          onClick={onCoinsClick}
          role={onCoinsClick ? 'button' : undefined}
          tabIndex={onCoinsClick ? 0 : -1}
          onKeyDown={(e) => {
            if (!onCoinsClick) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onCoinsClick();
            }
          }}
          style={{
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundColor: 'var(--warm-accent-light)', borderRadius: 14, padding: '8px 16px',
          border: '1.5px solid var(--warm-streak-border)',
          cursor: onCoinsClick ? 'pointer' : 'default',
        }}>
          <CoinIcon />
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-streak-text)' }}>{formatCoins(user.coins)}</span>
        </div>
        <div
          onClick={onPointsClick}
          role={onPointsClick ? 'button' : undefined}
          tabIndex={onPointsClick ? 0 : -1}
          onKeyDown={(e) => {
            if (!onPointsClick) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPointsClick();
            }
          }}
          style={{
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundColor: 'var(--warm-accent-light)', borderRadius: 14, padding: '8px 16px',
          border: '1.5px solid var(--warm-streak-border)',
          cursor: onPointsClick ? 'pointer' : 'default',
        }}>
          <PointsIcon />
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-streak-text)' }}>{formatCoins(userPoints ?? user.points)}</span>
          {pointsPeriodLabel && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', textTransform: 'uppercase' }}>{pointsPeriodLabel}</span>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
