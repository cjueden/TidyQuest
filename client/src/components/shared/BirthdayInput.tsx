import { useTranslation } from '../../hooks/useTranslation';
import { localeFor } from '../../utils/locale';

/** Month and day of a birthday (no year), as 'MM-DD'; empty = not set. */
export function BirthdayInput({ value, onChange, language }: { value: string; onChange: (v: string) => void; language?: string }) {
  const { t } = useTranslation(language);
  const [month, day] = /^\d\d-\d\d$/.test(value) ? value.split('-') : ['', ''];
  const pad = (n: number) => String(n).padStart(2, '0');
  const set = (m: string, d: string) => onChange(m && d ? `${m}-${d}` : m ? `${m}-01` : '');
  const daysIn = month ? new Date(2024, Number(month), 0).getDate() : 31; // 2024: leap year, so Feb 29 works
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
      🎂 {t('badges.birthday')}
      <select className="tq-input-compact" value={month} aria-label={t('badges.birthdayMonth')} onChange={(e) => set(e.target.value, e.target.value ? day || '01' : '')}>
        <option value="">—</option>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i} value={pad(i + 1)}>{new Date(2024, i, 1).toLocaleDateString(localeFor(language), { month: 'long' })}</option>
        ))}
      </select>
      {month && (
        <select className="tq-input-compact" value={day} aria-label={t('badges.birthdayDay')} onChange={(e) => set(month, e.target.value)}>
          {Array.from({ length: daysIn }, (_, i) => <option key={i} value={pad(i + 1)}>{i + 1}</option>)}
        </select>
      )}
    </label>
  );
}
