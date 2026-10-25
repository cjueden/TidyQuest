import { useMemo, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { localeFor } from '../../utils/locale';
import { allTimeZones, deviceZone, offsetLabel } from '../../utils/clock';

/**
 * Settings → General → Time zone (parents): when the family's days start. A search over the
 * browser's own list of zones, "Use this device's zone", and, while none has been picked (the
 * server's TZ is in use), a one-tap offer of this device's zone when it differs.
 */

const pretty = (tz: string) => tz.replace(/_/g, ' ').replace(/\//g, ' / ');
const normal = (s: string) => s.toLowerCase().replace(/[_/]/g, ' ').replace(/\s+/g, ' ').trim();

interface Props {
  zone: string;
  /** false while the server's own zone is used */
  zoneSet: boolean;
  language: string;
  onChange: (zone: string) => Promise<void>;
}

export function TimeZonePicker({ zone, zoneSet, language, onChange }: Props) {
  const { t } = useTranslation(language);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const device = deviceZone();
  const zones = useMemo(() => (open ? allTimeZones() : []), [open]);
  const matches = useMemo(() => {
    const q = normal(query);
    return q ? zones.filter((z) => normal(z).includes(q)).slice(0, 60) : zones.slice(0, 60);
  }, [zones, query]);
  const nowThere = new Date().toLocaleTimeString(localeFor(language), { hour: 'numeric', minute: '2-digit', timeZone: zone });

  const pick = (z: string) => {
    if (z === zone && zoneSet) { setOpen(false); return; }
    setSaving(true);
    onChange(z).then(() => { setOpen(false); setQuery(''); }).catch(() => {}).finally(() => setSaving(false));
  };

  const small = { fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 } as const;
  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--warm-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" stroke="var(--warm-text-light)" strokeWidth="1.5" />
          <path d="M2.5 10h15M10 2.5c2 2.2 3 4.7 3 7.5s-1 5.3-3 7.5c-2-2.2-3-4.7-3-7.5s1-5.3 3-7.5z" stroke="var(--warm-text-light)" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.timeZone')}</div>
          <div style={small}>{t('settings.timeZoneDesc')}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)', marginTop: 4, overflowWrap: 'anywhere' }}>
            {pretty(zone)} · {offsetLabel(zone)} · {t('settings.timeZoneNow').replace('{time}', nowThere)}
          </div>
          {!zoneSet && <div style={small}>{t('settings.timeZoneServer')}</div>}
        </div>
        <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={saving}>
          {t('settings.timeZoneChange')}
        </button>
      </div>

      {!zoneSet && device !== zone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)' }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>
            {t('settings.timeZoneOffer').replace('{zone}', `${pretty(device)} (${offsetLabel(device)})`)}
          </div>
          <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={() => pick(device)} disabled={saving}>{t('settings.timeZoneUseIt')}</button>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {device !== zone && zoneSet && (
            <button className="tq-btn tq-btn-secondary tq-btn-sm" style={{ alignSelf: 'flex-start', maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => pick(device)} disabled={saving}>
              📍 {t('settings.timeZoneUseDevice')}: {pretty(device)}
            </button>
          )}
          <input className="tq-input-compact" type="search" value={query} placeholder={t('settings.timeZoneSearch')} aria-label={t('settings.timeZoneSearch')}
            onChange={(e) => setQuery(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} autoFocus />
          <div role="listbox" aria-label={t('settings.timeZone')} style={{ maxHeight: 240, overflowY: 'auto', border: '1.5px solid var(--warm-border)', borderRadius: 12 }}>
            {matches.length === 0 && <div style={{ ...small, padding: 12 }}>{t('settings.timeZoneNone')}</div>}
            {matches.map((z) => (
              <button key={z} role="option" aria-selected={z === zone} onClick={() => pick(z)} disabled={saving}
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: 10, width: '100%', padding: '10px 12px', border: 'none',
                  borderBottom: '1px solid var(--warm-border)', background: z === zone ? 'var(--warm-bg-subtle)' : 'transparent',
                  color: 'var(--warm-text)', fontFamily: 'Nunito', fontSize: 13, fontWeight: z === zone ? 800 : 600, textAlign: 'left', cursor: 'pointer',
                }}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{pretty(z)}</span>
                <span style={{ color: 'var(--warm-text-light)', whiteSpace: 'nowrap' }}>{offsetLabel(z)}</span>
              </button>
            ))}
          </div>
          <div style={small}>{t('settings.timeZoneNote')}</div>
        </div>
      )}
    </div>
  );
}
