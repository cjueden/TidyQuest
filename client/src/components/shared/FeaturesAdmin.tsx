import { useEffect, useState } from 'react';
import { api, type FeatureFlags, type FeaturesView } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { Toggle } from './Toggle';
import { localeFor } from '../../utils/locale';
import { SEASONS, setSeasonPreview, useSeasonPreview } from '../../utils/seasons';
import { CREATURE_IDS, CREATURES, type CreatureId } from '../mascot/MascotArt';
import { MascotPicture } from '../mascot/MascotCard';

const ORDER: Array<keyof FeatureFlags> = ['rescue', 'usual', 'forgot', 'todos', 'boardAwards', 'levels', 'nextBadge', 'shields', 'cheers', 'teamups', 'mascot', 'mascotShop', 'focus', 'proofPhotos', 'seasonal'];
const MULTIPLIERS = [1.5, 2, 3];
const SHIELD_PRICES = [10, 15, 20, 25, 30, 40, 50, 75, 100];

/** Settings → Features: optional extras, on or off for the whole family (all on to start). */
export function FeaturesAdmin({ language, onChanged }: { language?: string; onChanged?: () => void }) {
  const { t } = useTranslation(language);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [multiplier, setMultiplier] = useState(2);
  const [holidaysOff, setHolidaysOff] = useState<string[]>([]);
  const [mascot, setMascot] = useState({ creature: 'dog', name: '', bedtimeFrom: '21:00', bedtimeTo: '07:00' });
  const [mascotName, setMascotName] = useState('');
  const [teamBonus, setTeamBonus] = useState(20);
  const [shieldPrice, setShieldPrice] = useState(25);
  const [roster, setRoster] = useState<NonNullable<FeaturesView['mascotRoster']>>([]);
  const previewing = useSeasonPreview();
  const show = (r: FeaturesView) => {
    setFlags(r.features); setMultiplier(r.rescueMultiplier); setHolidaysOff(r.holidaysOff ?? []);
    if (r.mascot) { setMascot(r.mascot); setMascotName(r.mascot.name); }
    if (r.teamBonus) setTeamBonus(r.teamBonus);
    if (r.shieldPrice) setShieldPrice(r.shieldPrice);
    if (r.mascotRoster) setRoster(r.mascotRoster);
  };
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
            {f === 'shields' && flags.shields && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                {t('features.shieldPrice')}
                <select className="tq-input-compact" value={shieldPrice} onChange={(e) => void save({ shieldPrice: Number(e.target.value) })}>
                  {[...new Set([...SHIELD_PRICES, shieldPrice])].sort((a, b) => a - b).map((p) => <option key={p} value={p}>{p} 🪙</option>)}
                </select>
              </label>
            )}
            {f === 'teamups' && flags.teamups && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                {t('features.teamBonus')}
                <select className="tq-input-compact" value={teamBonus} onChange={(e) => void save({ teamBonus: Number(e.target.value) })}>
                  {[10, 20, 30].map((b) => <option key={b} value={b}>+{b}%</option>)}
                </select>
              </label>
            )}
            {f === 'mascot' && flags.mascot && (
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CREATURE_IDS.map((c: CreatureId) => {
                    // Each creature keeps its own growth: a new one starts as an egg, an old one comes back as it was
                    const r = roster.find((x) => x.creature === c);
                    const pick = () => {
                      if (mascot.creature === c) return;
                      if (r?.status === 'new' && !window.confirm(t('mascot.confirmNewEgg').replace('{creature}', t(`mascot.creature_${c}`)).replace('{name}', mascot.name))) return;
                      void save({ mascot: { creature: c } });
                    };
                    return (
                    <button key={c} type="button" aria-pressed={mascot.creature === c} title={CREATURES[c].label} onClick={pick} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 4, borderRadius: 12, cursor: 'pointer', background: 'none',
                      border: `2px solid ${mascot.creature === c ? 'var(--warm-accent)' : 'var(--warm-border)'}`, fontFamily: 'Nunito', fontSize: 10, fontWeight: 800, color: 'var(--warm-text-muted)',
                    }}>
                      <MascotPicture m={{ creature: c, stage: 'grown', mood: 'happy', event: null }} size={44} />
                      {t(`mascot.creature_${c}`)}
                      <span style={{ fontSize: 9, fontWeight: 700, color: r?.status === 'active' ? 'var(--warm-accent)' : 'var(--warm-text-light)' }}>
                        {!r || r.status === 'new' ? `🥚 ${t('mascot.newEgg')}` : `${r.status === 'active' ? '✓ ' : ''}${r.name} · ${t(`mascot.stage_${r.stage}`)}`}
                      </span>
                    </button>
                    );
                  })}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)', flexWrap: 'wrap' }}>
                  😴 {t('mascot.bedtime')}
                  <input type="time" className="tq-input-compact" value={mascot.bedtimeFrom} aria-label={t('mascot.bedtimeFrom')}
                    onChange={(e) => e.target.value && void save({ mascot: { bedtimeFrom: e.target.value } })} />
                  –
                  <input type="time" className="tq-input-compact" value={mascot.bedtimeTo} aria-label={t('mascot.bedtimeTo')}
                    onChange={(e) => e.target.value && void save({ mascot: { bedtimeTo: e.target.value } })} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                  {t('mascot.name')}
                  <input className="tq-input-compact" value={mascotName} maxLength={20} onChange={(e) => setMascotName(e.target.value)}
                    onBlur={() => { if (mascotName.trim() && mascotName.trim() !== mascot.name) void save({ mascot: { name: mascotName.trim() } }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ flex: 1, minWidth: 0 }} />
                </label>
              </div>
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
