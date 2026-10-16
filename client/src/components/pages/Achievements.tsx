import { SparkleIcon, FireIcon, CoinIcon, StarIcon } from '../icons/UIIcons';
import { useTranslation } from '../../hooks/useTranslation';
import { LevelStrip } from '../shared/LevelStrip';
import { localeFor } from '../../utils/locale';
import { badgeDescription, badgeTitle, BUILTIN_ICONS, TIER_COLORS, TIER_KEYS, tierIndex, type BadgeItem, type LevelInfo } from '../../utils/badges';

function AchievementIcon({ type }: { type: string }) {
  // Parent-made badges use an emoji
  if (!BUILTIN_ICONS.has(type)) return <span style={{ fontSize: 18, lineHeight: 1 }}>{type}</span>;
  if (type === 'fire') return <FireIcon />;
  if (type === 'coin') return <CoinIcon />;
  if (type === 'star') return <StarIcon />;
  if (type === 'crown') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M3 15L5 6L10 10L15 6L17 15H3Z" fill="#F59E0B" />
      </svg>
    );
  }
  if (type === 'broom') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <rect x="9" y="2" width="2" height="10" rx="1" fill="#B45309" />
        <path d="M6 12H14L13 18H7L6 12Z" fill="#F59E0B" />
        <line x1="8" y1="13" x2="8" y2="17" stroke="#B45309" strokeWidth="0.5" />
        <line x1="10" y1="13" x2="10" y2="17" stroke="#B45309" strokeWidth="0.5" />
        <line x1="12" y1="13" x2="12" y2="17" stroke="#B45309" strokeWidth="0.5" />
      </svg>
    );
  }
  if (type === 'heart') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M10 16L5.5 11.8C4 10.3 4 8 5.5 6.5C6.8 5.2 9 5.2 10 6.5C11 5.2 13.2 5.2 14.5 6.5C16 8 16 10.3 14.5 11.8L10 16Z" fill="#F87171" />
      </svg>
    );
  }
  if (type === 'shield') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L4 5V10C4 14 7 17 10 18C13 17 16 14 16 10V5L10 2Z" fill="#60A5FA" />
        <path d="M9 11L7.5 9.5L8.5 8.5L9 9L11.5 6.5L12.5 7.5L9 11Z" fill="#fff" />
      </svg>
    );
  }
  if (type === 'rocket') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M10 3C10 3 14 6 14 12L12 14H8L6 12C6 6 10 3 10 3Z" fill="#F59E0B" />
        <circle cx="10" cy="9" r="2" fill="#fff" />
        <path d="M8 14L7 17H9L8 14Z" fill="#EF4444" />
        <path d="M12 14L13 17H11L12 14Z" fill="#EF4444" />
      </svg>
    );
  }
  if (type === 'diamond') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M10 3L16 8L10 17L4 8L10 3Z" fill="#A78BFA" />
        <path d="M4 8H16L10 3L4 8Z" fill="#C4B5FD" />
        <line x1="10" y1="3" x2="10" y2="17" stroke="#7C3AED" strokeWidth="0.5" opacity="0.3" />
      </svg>
    );
  }
  return <SparkleIcon />;
}

interface AchUser {
  id: number;
  displayName: string;
  role: 'admin' | 'member' | 'child';
  avatarColor: string;
  achievements: BadgeItem[];
  level?: LevelInfo | null;
  nextBadge?: BadgeItem | null;
}

interface Props {
  data: { me: AchUser; family: AchUser[] } | null;
  language?: string;
}

const card = (earned: boolean) => ({
  borderRadius: 14, padding: 12, minWidth: 0,
  border: `1.5px solid ${earned ? 'var(--warm-streak-border)' : 'var(--warm-border)'}`,
  backgroundColor: earned ? 'var(--warm-accent-light)' : 'var(--warm-bg-subtle)',
});
const bar = (pct: number, color: string) => (
  <div style={{ height: 6, borderRadius: 999, background: 'var(--health-bar-track)', overflow: 'hidden', margin: '6px 0' }}>
    <div style={{ width: `${pct}%`, height: '100%', background: color }} />
  </div>
);

export function Achievements({ data, language }: Props) {
  const { t } = useTranslation(language);
  if (!data) return null;
  const locale = localeFor(language);
  const earnedOn = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return t('badges.earnedOn').replace('{date}', d.toLocaleDateString(locale, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }));
  };

  // One card per ladder (1, 10, 25 … chores): the best step reached as a medal, and the next one
  const renderLadder = (metric: string, steps: BadgeItem[]) => {
    const sorted = [...steps].sort((a, b) => a.threshold - b.threshold);
    const reached = sorted.filter((a) => a.unlocked);
    const top = reached[reached.length - 1];
    const next = sorted.find((a) => !a.unlocked);
    const tier = top ? tierIndex(sorted.indexOf(top)) : -1;
    return (
      <div key={metric} style={card(!!top)}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--warm-text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(`badges.ladder_${metric}`)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
          <AchievementIcon type={(top ?? sorted[0]).icon} />
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)', flex: 1, minWidth: 0 }}>{top ? badgeTitle(top, t) : t('badges.notStarted')}</div>
          {top && (
            <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', backgroundColor: TIER_COLORS[tier], padding: '2px 8px', borderRadius: 99 }}>{t(TIER_KEYS[tier])}</span>
          )}
        </div>
        {top && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)' }}>{earnedOn(top.unlockedAt)}</div>}
        {next ? (
          <>
            {bar(next.progress, 'var(--warm-coin)')}
            <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 700 }}>
              {t('badges.nextStep').replace('{name}', badgeTitle(next, t))} · {next.value}/{next.threshold}
            </div>
          </>
        ) : <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--health-green)', marginTop: 6 }}>{t('badges.ladderDone')}</div>}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }} aria-hidden>
          {sorted.map((a, i) => (
            <span key={a.id} title={`${badgeTitle(a, t)} (${a.threshold})`} style={{
              width: 12, height: 12, borderRadius: 99, display: 'inline-block',
              backgroundColor: a.unlocked ? TIER_COLORS[tierIndex(i)] : 'transparent', border: `2px solid ${a.unlocked ? TIER_COLORS[tierIndex(i)] : 'var(--warm-border)'}`,
            }} />
          ))}
        </div>
      </div>
    );
  };

  const renderBadge = (a: BadgeItem) => (
    <div key={a.id} style={card(a.unlocked)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <AchievementIcon type={a.icon} />
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{badgeTitle(a, t)}</div>
        {a.custom && <span title={t('badges.familyBadge')} style={{ fontSize: 12 }}>🏠</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--warm-text-muted)', fontWeight: 600 }}>{badgeDescription(a, t)}</div>
      {!(a.secret && !a.unlocked) && (
        <>
          {bar(a.unlocked ? 100 : a.progress, a.unlocked ? 'var(--health-green)' : 'var(--warm-coin)')}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 700 }}>
            <span>{a.unlocked ? earnedOn(a.unlockedAt) : `${a.value}/${a.threshold}`}</span>
            {(a.bonusCoins ?? 0) > 0 && <span style={{ color: a.unlocked ? 'var(--health-green)' : 'var(--warm-accent)' }}>+{a.bonusCoins} {t('settings.coins')}</span>}
          </div>
        </>
      )}
    </div>
  );

  const renderUser = (u: AchUser) => {
    const earned = u.achievements.filter((a) => a.unlocked).length;
    const ladders = new Map<string, BadgeItem[]>();
    for (const a of u.achievements) if (a.ladder) ladders.set(a.ladder, [...(ladders.get(a.ladder) ?? []), a]);
    const singles = u.achievements.filter((a) => !a.ladder).sort((a, b) =>
      Number(b.unlocked) - Number(a.unlocked)
      || (a.unlocked ? String(b.unlockedAt ?? '').localeCompare(String(a.unlockedAt ?? '')) : 0)
      || Number(!!a.secret) - Number(!!b.secret)
      || b.progress - a.progress);
    const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(210px, 100%), 1fr))', gap: 10 };
    return (
      <div key={u.id} className="tq-card tq-card-padded" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 900, color: 'var(--warm-text)', margin: 0 }}>{u.displayName}</h3>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-accent)', backgroundColor: 'var(--warm-accent-light)', padding: '4px 12px', borderRadius: 99 }}>
            {earned}/{u.achievements.length}
          </span>
        </div>
        <LevelStrip level={u.level ?? null} nextBadge={u.nextBadge ?? null} language={language} />
        <div style={grid}>{[...ladders].map(([metric, steps]) => renderLadder(metric, steps))}</div>
        <div style={grid}>{singles.map(renderBadge)}</div>
      </div>
    );
  };

  return (
    <div className="page-enter" style={{ display: 'grid', gap: 16 }}>
      {renderUser(data.me)}
      {data.family.length > 0 && (
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text-muted)' }}>{t('achievements.familyProgress')}</div>
      )}
      {data.family.map(renderUser)}
    </div>
  );
}
