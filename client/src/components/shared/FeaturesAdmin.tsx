import { useEffect, useState } from 'react';
import { api, type FeatureFlags } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { Toggle } from './Toggle';

const ORDER: Array<keyof FeatureFlags> = ['rescue', 'usual', 'forgot', 'todos', 'boardAwards', 'levels', 'nextBadge'];
const MULTIPLIERS = [1.5, 2, 3];

/** Settings → Features: optional extras, on or off for the whole family (all on to start). */
export function FeaturesAdmin({ language, onChanged }: { language?: string; onChanged?: () => void }) {
  const { t } = useTranslation(language);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [multiplier, setMultiplier] = useState(2);
  useEffect(() => {
    api.getFeatures().then((r) => { setFlags(r.features); setMultiplier(r.rescueMultiplier); }).catch(() => setFlags(null));
  }, []);
  if (!flags) return null;

  const save = async (data: { features?: Partial<FeatureFlags>; rescueMultiplier?: number }) => {
    const r = await api.updateFeatures(data);
    setFlags(r.features); setMultiplier(r.rescueMultiplier);
    onChanged?.();
  };
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, marginBottom: 6 }}>{t('features.desc')}</div>
      {ORDER.map((f, i) => (
        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < ORDER.length - 1 ? '1px solid var(--warm-border)' : 'none' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>{t(`features.${f}`)}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' }}>{t(`features.${f}Desc`)}</div>
            {f === 'rescue' && flags.rescue && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                {t('features.multiplier')}
                <select className="tq-input-compact" value={multiplier} onChange={(e) => void save({ rescueMultiplier: Number(e.target.value) })}>
                  {MULTIPLIERS.map((m) => <option key={m} value={m}>{m}×</option>)}
                </select>
              </label>
            )}
          </div>
          <Toggle checked={flags[f]} label={t(`features.${f}`)} onChange={(on) => void save({ features: { [f]: on } })} />
        </div>
      ))}
    </div>
  );
}
