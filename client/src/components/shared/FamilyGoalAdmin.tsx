import { useEffect, useState } from 'react';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCoins } from '../../utils/format';

/** Settings: the family team goal shown on the Board (one weekly coin target for everyone together). */
export function FamilyGoalAdmin({ language }: { language?: string }) {
  const { t } = useTranslation(language);
  const [target, setTarget] = useState('');
  const [prize, setPrize] = useState('');
  const [progress, setProgress] = useState<{ total: number; target: number } | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getFamilyGoal().then((g) => { setTarget(g.target ? String(g.target) : ''); setPrize(g.prize); setProgress(g.progress); }).catch(() => {});
  }, []);

  const save = async () => {
    setMessage('');
    try {
      const g = await api.setFamilyGoal(Math.max(0, Math.round(Number(target) || 0)), prize);
      setProgress(g.progress);
      setMessage(t('common.saved'));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('board.familyGoalAdminDesc')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
          {t('board.familyGoalTarget')}
          <input type="number" min={0} className="tq-input-compact" value={target} placeholder="0" onChange={(e) => setTarget(e.target.value)} style={{ width: 90 }} />
        </label>
        <input className="tq-input-compact" value={prize} maxLength={80} placeholder={t('board.familyGoalPrizePlaceholder')} aria-label={t('board.familyGoalPrize')}
          onChange={(e) => setPrize(e.target.value)} style={{ flex: '1 1 160px', minWidth: 0 }} />
        <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={save}>{t('common.save')}</button>
      </div>
      {progress && (
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
          {t('board.familyGoalProgress').replace('{total}', formatCoins(progress.total)).replace('{target}', formatCoins(progress.target))}
        </div>
      )}
      {message && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-accent)' }}>{message}</div>}
    </div>
  );
}
