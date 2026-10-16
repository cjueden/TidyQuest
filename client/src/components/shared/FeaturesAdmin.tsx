import { useEffect, useState } from 'react';
import { api, type FeatureFlags, type FeaturesView } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { Toggle } from './Toggle';
import { localeFor } from '../../utils/locale';
import { SEASONS, setSeasonPreview, useSeasonPreview } from '../../utils/seasons';

const ORDER: Array<keyof FeatureFlags> = ['rescue', 'usual', 'forgot', 'todos', 'boardAwards', 'levels', 'nextBadge', 'cheers', 'seasonal'];
const MULTIPLIERS = [1.5, 2, 3];

/** Settings → Features: optional extras, on or off for the whole family (all on to start). */
export function FeaturesAdmin({ language, onChanged }: { language?: string; onChanged?: () => void }) {
  const { t } = useTranslation(language);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [multiplier, setMultiplier] = useState(2);
  const [holidaysOff, setHolidaysOff] = useState<string[]>([]);
  const previewing = useSeasonPreview();
  const show = (r: FeaturesView) => { setFlags(r.features); setMultiplier(r.rescueMultiplier); setHolidaysOff(r.holidaysOff ?? []); };
  useEffect(() => {
    api.getFeatures().then(show).catch(() => setFlags(null));
  }, []);
  if (!flags) return null;

  const save = async (data: Parameters<typeof api.updateFeatures>[0]) => {
    show(await api.updateFeatures(data));
    onChanged?.();
  };
  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleString(localeFor(language), { month: 'long' });
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
            {f === 'seasonal' && flags.seasonal && (
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {SEASONS.map((h) => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 7, background: h.swatch.bg, border: `3px solid ${h.swatch.accent}`, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, color: 'var(--warm-text-muted)' }}>
                      {h.strip[0]} {t(`seasons.${h.id}`)} <span style={{ fontWeight: 600, color: 'var(--warm-text-light)' }}>· {h.months.map(monthName).join(', ')}</span>
                    </div>
                    <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setSeasonPreview(previewing === h.id ? null : h.id)}>
                      {t(previewing === h.id ? 'seasons.stop' : 'seasons.preview')}
                    </button>
                    <Toggle checked={!holidaysOff.includes(h.id)} label={t(`seasons.${h.id}`)}
                      onChange={(on) => void save({ holidaysOff: on ? holidaysOff.filter((x) => x !== h.id) : [...holidaysOff, h.id] })} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <Toggle checked={flags[f]} label={t(`features.${f}`)} onChange={(on) => void save({ features: { [f]: on } })} />
        </div>
      ))}
    </div>
  );
}
