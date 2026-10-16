import { useState } from 'react';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { CoinIcon } from '../icons/UIIcons';
import { formatCoins } from '../../utils/format';

export interface GoalItem {
  id: number;
  title: string;
  goalCoins: number;
  rewardCoins?: number;
  repeatWeekly?: number | boolean;
  status?: string;
  startAt?: string | null;
  endAt?: string | null;
}

/** One goal in Settings: shows the target, bonus and "repeats weekly", and can be edited in place. */
export function GoalRow({ goal, language, formatDate, onChanged, onDelete }: {
  goal: GoalItem;
  language?: string;
  formatDate: (iso?: string | null) => string;
  onChanged: () => void | Promise<void>;
  onDelete: () => void;
}) {
  const { t } = useTranslation(language);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [coins, setCoins] = useState(String(goal.goalCoins));
  const [bonus, setBonus] = useState(String(goal.rewardCoins ?? 0));
  const [repeat, setRepeat] = useState(!!goal.repeatWeekly);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    try {
      await api.updateGoal(goal.id, {
        title: title.trim(), goalCoins: Math.max(1, Math.round(Number(coins))),
        startAt: goal.startAt ?? null, endAt: goal.endAt ?? null,
        rewardCoins: Math.max(0, Math.round(Number(bonus) || 0)), repeatWeekly: repeat,
      });
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const box = { padding: '6px 8px', borderRadius: 10, backgroundColor: 'var(--warm-card)', border: '1px solid var(--warm-border)' };
  if (editing) {
    return (
      <div style={{ ...box, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <input className="tq-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: '2 1 160px', minWidth: 0 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700 }}>
          {t('settings.goalCoins')}
          <input type="number" min={1} className="tq-input-compact" value={coins} onChange={(e) => setCoins(e.target.value)} style={{ width: 70 }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700 }} title={t('settings.goalRewardDesc')}>
          {t('settings.goalReward')}
          <input type="number" min={0} className="tq-input-compact" value={bonus} onChange={(e) => setBonus(e.target.value)} style={{ width: 64 }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} style={{ accentColor: 'var(--warm-accent)' }} />
          {t('goals.repeatWeekly')}
        </label>
        <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={save}>{t('common.save')}</button>
        <button className="tq-btn tq-btn-sm" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
        {error && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</span>}
      </div>
    );
  }
  return (
    <div style={{ ...box, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <div style={{ flex: '2 1 160px', minWidth: 0, fontSize: 11, fontWeight: 800, color: 'var(--warm-text)' }}>
        {goal.title}{goal.status === 'completed' ? ' ✓' : ''}
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)' }}>
          {goal.endAt ? formatDate(goal.endAt) : ''}{goal.repeatWeekly ? ` · ↻ ${t('goals.repeatWeekly')}` : ''}
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <CoinIcon /> {formatCoins(goal.goalCoins)}
        {(goal.rewardCoins ?? 0) > 0 && <span style={{ color: 'var(--health-green)' }}>· +{formatCoins(goal.rewardCoins)} {t('goals.bonus')}</span>}
      </div>
      <button className="tq-btn tq-btn-sm" onClick={() => setEditing(true)}>{t('common.edit')}</button>
      <button className="tq-btn tq-btn-sm" onClick={onDelete} style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>
        {t('common.delete')}
      </button>
    </div>
  );
}
