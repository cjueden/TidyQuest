import { useTranslation } from '../../hooks/useTranslation';
import { THEMES, THEME_SWATCHES, themeLabelKey, type Theme } from '../../utils/themes';

/** Color theme swatches (Profile, and a parent setting a kid's theme in Settings). */
export function ThemePicker({ value, onChange, language }: { value: Theme | null; onChange: (t: Theme) => void; language?: string }) {
  const { t } = useTranslation(language);
  return (
    <div role="radiogroup" aria-label={t('settings.theme')} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
      {THEMES.map((theme) => {
        const on = value === theme;
        const sw = THEME_SWATCHES[theme];
        return (
          <button key={theme} type="button" role="radio" aria-checked={on} onClick={() => onChange(theme)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 12, cursor: 'pointer',
            fontFamily: 'Nunito', fontSize: 11, fontWeight: 800, color: 'var(--warm-text)', background: 'none',
            border: `2px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
          }}>
            <span style={{ width: 36, height: 36, borderRadius: 99, background: `linear-gradient(135deg, ${sw.bg} 50%, ${sw.accent} 50%)`, border: '1px solid var(--warm-border)', display: 'block' }} />
            {t(themeLabelKey(theme))}
          </button>
        );
      })}
    </div>
  );
}
