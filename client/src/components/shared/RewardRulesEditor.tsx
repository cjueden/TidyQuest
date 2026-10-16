import { useState } from 'react';
import { api, type RewardRules } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';

interface Member { id: number; displayName: string; role?: string; isParticipant?: number | boolean }

type Period = RewardRules['limitPeriod'];
type Scope = RewardRules['limitScope'];

/**
 * A reward's rules, for parents: who can see it and what it costs each person, how often it can be
 * redeemed, when it's on offer, the weekly rotation and shared saving.
 */
export function RewardRulesEditor({ reward, family, language, onSaved }: {
  reward: { id: number; costCoins: number } & Partial<RewardRules>;
  family: Member[];
  language?: string;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useTranslation(language);
  const people = family.filter((m) => m.role !== 'admin' || m.isParticipant);
  const [visibleTo, setVisibleTo] = useState<number[]>(reward.visibleTo ?? []);
  const [prices, setPrices] = useState<Record<number, string>>(
    Object.fromEntries(Object.entries(reward.prices ?? {}).map(([k, v]) => [Number(k), String(v)]))
  );
  const [limitOn, setLimitOn] = useState(!!reward.limitCount);
  const [limitCount, setLimitCount] = useState(String(reward.limitCount ?? 1));
  const [limitPeriod, setLimitPeriod] = useState<Period>(reward.limitPeriod ?? 'week');
  const [limitScope, setLimitScope] = useState<Scope>(reward.limitScope ?? 'person');
  const [from, setFrom] = useState(reward.availableFrom ?? '');
  const [until, setUntil] = useState(reward.availableUntil ?? '');
  const [isRotating, setIsRotating] = useState(!!reward.isRotating);
  const [isShared, setIsShared] = useState(!!reward.isShared);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const toggleVisible = (id: number) => setVisibleTo((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    setError(''); setSaved(false);
    try {
      await api.updateRewardRules(reward.id, {
        visibleTo,
        prices: Object.fromEntries(people.map((m) => [m.id, prices[m.id]?.trim() ? Number(prices[m.id]) : null])),
        limit: limitOn ? { count: Number(limitCount), period: limitPeriod, scope: limitScope } : null,
        availableFrom: from || null,
        availableUntil: until || null,
        isRotating,
        isShared,
      });
      setSaved(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const label = { fontSize: 11, fontWeight: 800, color: 'var(--warm-text-light)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' };
  const chip = (on: boolean) => ({
    padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer',
    border: `1.5px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
    backgroundColor: on ? 'var(--warm-accent-light)' : 'var(--warm-bg-input)', color: on ? 'var(--warm-accent)' : 'var(--warm-text)',
  });
  const row = { display: 'flex', flexWrap: 'wrap' as const, gap: 6, alignItems: 'center' };

  return (
    <div style={{ display: 'grid', gap: 12, padding: '12px 4px 4px', borderTop: '1px dashed var(--warm-border)' }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={label}>{t('rewardRules.whoCanSee')}</div>
        <div style={row}>
          <button type="button" style={chip(visibleTo.length === 0)} onClick={() => setVisibleTo([])}>{t('rewardRules.everyone')}</button>
          {people.map((m) => (
            <button type="button" key={m.id} style={chip(visibleTo.includes(m.id))} onClick={() => toggleVisible(m.id)}>{m.displayName}</button>
          ))}
        </div>
      </div>

      {!isShared && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={label}>{t('rewardRules.pricePerPerson')}</div>
          <div style={row}>
            {people.filter((m) => visibleTo.length === 0 || visibleTo.includes(m.id)).map((m) => (
              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>
                {m.displayName}
                <input type="number" min={1} className="tq-input-compact" value={prices[m.id] ?? ''} placeholder={String(reward.costCoins)}
                  onChange={(e) => setPrices((p) => ({ ...p, [m.id]: e.target.value }))} style={{ width: 80 }} />
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        <label style={{ ...row, ...label, cursor: 'pointer' }}>
          <input type="checkbox" checked={limitOn} onChange={(e) => setLimitOn(e.target.checked)} style={{ accentColor: 'var(--warm-accent)' }} />
          {t('rewardRules.limit')}
        </label>
        {limitOn && (
          <div style={row}>
            <input type="number" min={1} max={1000} className="tq-input-compact" value={limitCount} onChange={(e) => setLimitCount(e.target.value)} style={{ width: 64 }} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>×</span>
            <select className="tq-input-compact" value={limitPeriod} onChange={(e) => setLimitPeriod(e.target.value as Period)}>
              <option value="ever">{t('rewardRules.periodEver')}</option>
              <option value="day">{t('rewardRules.periodDay')}</option>
              <option value="week">{t('rewardRules.periodWeek')}</option>
              <option value="month">{t('rewardRules.periodMonth')}</option>
            </select>
            {!isShared && (
              <select className="tq-input-compact" value={limitScope} onChange={(e) => setLimitScope(e.target.value as Scope)}>
                <option value="person">{t('rewardRules.scopePerson')}</option>
                <option value="everyone">{t('rewardRules.scopeEveryone')}</option>
              </select>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <div style={label}>{t('rewardRules.onOffer')}</div>
        <div style={row}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
            {t('rewardRules.from')}
            <input type="date" className="tq-input-compact" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
            {t('rewardRules.until')}
            <input type="date" className="tq-input-compact" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <input type="checkbox" checked={isRotating} onChange={(e) => setIsRotating(e.target.checked)} style={{ accentColor: 'var(--warm-accent)', marginTop: 2 }} />
          <span>{t('rewardRules.rotating')}<span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' }}>{t('rewardRules.rotatingDesc')}</span></span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} style={{ accentColor: 'var(--warm-accent)', marginTop: 2 }} />
          <span>{t('rewardRules.shared')}<span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' }}>{t('rewardRules.sharedDesc')}</span></span>
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={save}>{t('common.save')}</button>
        {saved && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--health-green)' }}>{t('common.saved')}</span>}
        {error && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</span>}
      </div>
    </div>
  );
}
