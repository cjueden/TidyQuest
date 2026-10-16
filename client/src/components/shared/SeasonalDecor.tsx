import { useTranslation } from '../../hooks/useTranslation';
import { daysUntil, setSeasonPreview, type Season } from '../../utils/seasons';

// Spread the particles out evenly but not in a grid (same every render)
const jitter = (i: number, k: number) => ((i * 7919 + k * 104729) % 1000) / 1000;

/** Light falling leaves or snow, or bats flying across. Hidden for people who ask for less motion (index.css). */
export function SeasonParticles({ season }: { season: Season }) {
  const { emoji, style } = season.particles;
  const count = style === 'fly' ? 5 : 12;
  return (
    <div className={`season-particles ${style}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const duration = style === 'fly' ? 16 + jitter(i, 1) * 10 : 11 + jitter(i, 1) * 9;
        return (
          <span
            key={i}
            style={style === 'fly'
              ? { top: `${6 + jitter(i, 2) * 50}vh`, fontSize: 16 + jitter(i, 3) * 8, animationDuration: `${duration}s`, animationDelay: `${-jitter(i, 4) * duration}s` }
              : { left: `${(i / count) * 100 + jitter(i, 2) * 6}vw`, fontSize: 12 + jitter(i, 3) * 9, animationDuration: `${duration}s`, animationDelay: `${-jitter(i, 4) * duration}s` }}
          >
            {emoji[i % emoji.length]}
          </span>
        );
      })}
    </div>
  );
}

/** The decoration strip at the top of the page, plus a way out of a parent's preview. */
export function SeasonStrip({ season, previewing, language }: { season: Season; previewing: boolean; language?: string }) {
  const { t } = useTranslation(language);
  return (
    <>
      {previewing && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, margin: '-8px 0 14px', fontSize: 12, fontWeight: 800, color: 'var(--warm-text-muted)' }}>
          👀 {t('seasons.previewing').replace('{name}', t(`seasons.${season.id}`))}
          <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setSeasonPreview(null)}>{t('seasons.stop')}</button>
        </div>
      )}
      <div className="season-strip" aria-hidden="true">
        {Array.from({ length: 30 }, (_, i) => <span key={i}>{season.strip[i % season.strip.length]}</span>)}
      </div>
    </>
  );
}

/** Home's holiday greeting with a countdown to the day. */
export function SeasonGreeting({ season, language }: { season: Season; language?: string }) {
  const { t } = useTranslation(language);
  const name = t(`seasons.${season.id}`);
  const days = daysUntil(season);
  const line = days > 1 ? t('seasons.daysUntil').replace('{n}', String(days))
    : days === 1 ? t('seasons.tomorrow')
    : days === 0 ? t('seasons.today')
    : t('seasons.after');
  return (
    <div className="tq-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 16, background: 'var(--warm-accent-light)', border: '1.5px solid var(--warm-accent)' }}>
      <div style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">{season.strip[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--warm-text)' }}>{t(`seasons.${season.id}Greeting`)}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>{line.replace('{name}', name)}</div>
      </div>
      {days > 0 && (
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--warm-accent)', lineHeight: 1 }}>{days}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--warm-text-light)', textTransform: 'uppercase' }}>{t(days === 1 ? 'seasons.day' : 'seasons.days')}</div>
        </div>
      )}
    </div>
  );
}
