import { useEffect, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface AchievementUnlockToastProps {
  achievementIds: string[];
  onDismiss: () => void;
  language?: string;
  /** Achievement id -> its title's translation key (ids like 'first_task' aren't translation keys) */
  titleKeys?: Record<string, string>;
}

// Positioned with inline styles: this app has no Tailwind, so the old utility classes
// (fixed, top-4, ...) did nothing and the toast landed in the page flow, shifting the layout (#123).
export function AchievementUnlockToast({ achievementIds, onDismiss, language, titleKeys = {} }: AchievementUnlockToastProps) {
  const { t } = useTranslation(language);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!achievementIds.length) return null;

  const title = (id: string) => {
    if (titleKeys[id]) return t(titleKeys[id]);
    const direct = t(`achievements.${id}`);
    return direct.startsWith('achievements.') ? id : direct;
  };

  return (
    <div
      className="achievement-toast"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
        width: 'min(360px, calc(100vw - 32px))', display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'opacity 0.3s', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {achievementIds.map((id) => (
        <div
          key={id}
          className="tq-card tq-card-padded"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, borderLeft: '4px solid var(--warm-accent)', boxShadow: '0 8px 24px var(--warm-shadow)' }}
        >
          <span style={{ fontSize: 24, lineHeight: 1 }}>🏆</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-accent)' }}>
              {t('achievements.unlocked')}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>
              {title(id)}
            </div>
          </div>
          <button
            onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-text-muted)', fontSize: 14, padding: 2 }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
