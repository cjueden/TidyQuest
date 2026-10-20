import { useState, type CSSProperties } from 'react';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { CoinIcon } from '../icons/UIIcons';

export interface ShieldConfig { price: number; max: number; every: number }

/** 🛡️ for each streak shield held, next to the streak (nothing when there are none) */
export function ShieldIcons({ count, language, style }: { count?: number; language?: string; style?: CSSProperties }) {
  const { t } = useTranslation(language);
  if (!count) return null;
  const label = t('shields.held').replace('{n}', String(count));
  return <span role="img" aria-label={label} title={label} style={{ letterSpacing: -2, ...style }}>{'🛡️'.repeat(count)}</span>;
}

/**
 * The streak card's shield row: the shields held (empty slots faded), when the next one is earned,
 * and buying one with coins.
 */
export function ShieldPanel({ shields, streak, coins, config, language, onChanged }: {
  shields: number; streak: number; coins: number; config: ShieldConfig; language?: string; onChanged?: () => void;
}) {
  const { t } = useTranslation(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const full = shields >= config.max;
  const nextIn = config.every - (streak % config.every);
  const canAfford = coins >= config.price;

  const buy = async () => {
    if (!window.confirm(t('shields.buyConfirm').replace('{n}', String(config.price)))) return;
    setBusy(true);
    setError('');
    try {
      await api.buyShield();
      onChanged?.();
    } catch {
      setError(t('shields.buyFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span role="img" aria-label={t('shields.held').replace('{n}', String(shields))} style={{ fontSize: 18, letterSpacing: 1 }}>
          {Array.from({ length: config.max }, (_, i) => (
            <span key={i} aria-hidden="true" style={i < shields ? undefined : { opacity: 0.25, filter: 'grayscale(1)' }}>🛡️</span>
          ))}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: 'var(--warm-streak-subtext)' }}>
          {full ? t('shields.full') : nextIn === 1 ? t('shields.nextInOne') : t('shields.nextIn').replace('{n}', String(nextIn))}
        </span>
        {!full && (
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" disabled={busy || !canAfford} onClick={() => void buy()}
            title={canAfford ? undefined : t('shields.notEnough')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...(canAfford ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}>
            {t('shields.buy')} · {config.price} <CoinIcon />
          </button>
        )}
      </div>
      {shields === 0 && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-streak-subtext)', marginTop: 4 }}>{t('shields.what')}</div>}
      {error && <div role="alert" style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-danger)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}
