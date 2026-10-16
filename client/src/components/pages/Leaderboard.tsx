import { useEffect, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserAvatar } from '../shared/UserAvatar';
import { formatCoins } from '../../utils/format';
import { localeFor } from '../../utils/locale';
import { FireIcon } from '../icons/UIIcons';
import { useTranslation } from '../../hooks/useTranslation';
import { api, type BoardData, type BoardMode, type BoardPeriod, type BoardPerson } from '../../hooks/useApi';

const PERIODS: BoardPeriod[] = ['week', 'lastWeek', 'month', 'quarter', 'year'];
const MODES: BoardMode[] = ['coins', 'goal', 'improved'];

/**
 * The Board: ranking by coins, by each person's own weekly goal, or by how much they improved; the
 * period's awards (so everyone can win something); the family team goal; and the trophy shelf.
 */
export function Leaderboard({ language }: { language?: string }) {
  const { t } = useTranslation(language);
  const locale = localeFor(language);
  const [params, setParams] = useSearchParams();
  const period = (PERIODS as string[]).includes(params.get('period') || '') ? params.get('period') as BoardPeriod : 'week';
  const mode = (MODES as string[]).includes(params.get('mode') || '') ? params.get('mode') as BoardMode : 'coins';
  const [data, setData] = useState<BoardData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.getBoard(period, mode).then((d) => { if (live) { setData(d); setFailed(false); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [period, mode]);

  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };

  const people = data?.people ?? [];
  const nameOf = (id: number) => people.find((p) => p.id === id)?.displayName ?? '?';
  const names = (ids: number[]) => ids.map(nameOf).join(' & ');
  const periodLabel = (p: BoardPeriod) => t(p === 'week' ? 'leaderboard.thisWeek' : p === 'lastWeek' ? 'board.lastWeek' : p === 'month' ? 'leaderboard.thisMonth' : p === 'quarter' ? 'leaderboard.thisQuarter' : 'leaderboard.thisYear');

  // What the big number is in each mode, and the small line under it
  const score = (p: BoardPerson): string => {
    if (mode === 'goal') return p.goalPct === null ? '—' : `${p.goalPct}%`;
    if (mode === 'improved') return `${p.improvement > 0 ? '+' : p.improvement < 0 ? '−' : ''}${formatCoins(Math.abs(p.improvement), locale)}`;
    return formatCoins(p.points, locale);
  };
  const detail = (p: BoardPerson): string => {
    if (mode === 'goal') return p.goalTarget ? `${formatCoins(p.points, locale)} / ${formatCoins(p.goalTarget, locale)}` : t('board.noGoal');
    if (mode === 'improved') return `${formatCoins(p.comparePoints, locale)} → ${formatCoins(p.points, locale)}`;
    return t('leaderboard.points');
  };

  // No podium until someone has actually scored (otherwise everyone ties for #1 on zero)
  const scored = people.filter((p) => (p.score ?? 0) > 0);
  const podium = [scored[1], scored[0], scored[2]].filter(Boolean);
  const podiumHeights = [100, 140, 75];
  const podiumAvatarSizes = [64, 80, 56];
  const podiumGradients = ['linear-gradient(180deg, #E2E8F0, #94A3B8)', 'linear-gradient(180deg, #FDE68A, #F59E0B)', 'linear-gradient(180deg, #FED7AA, #EA580C)'];
  const chip = (on: boolean): CSSProperties => ({
    padding: '8px 12px', borderRadius: 11, fontSize: 13, fontWeight: 800, border: 'none', fontFamily: 'Nunito', cursor: 'pointer',
    backgroundColor: on ? 'var(--warm-accent)' : 'transparent', color: on ? '#fff' : 'var(--warm-text-light)',
  });
  const cardTitle: CSSProperties = { fontSize: 15, fontWeight: 900, color: 'var(--warm-text)', margin: '0 0 10px' };

  const goal = data?.familyGoal;
  const awardText = (a: BoardData['awards'][number]) => {
    if (a.key === 'room') return { icon: '👑', title: t('board.roomChampion').replace('{room}', a.roomName ?? ''), value: t('board.choresCount').replace('{n}', String(a.value)) };
    if (a.key === 'earlyBird') return { icon: '🌅', title: t('board.earlyBird'), value: t('board.earlyBirdValue').replace('{n}', String(a.value)) };
    if (a.key === 'bountyHunter') return { icon: '🎯', title: t('board.bountyHunter'), value: t('board.bountyHunterValue').replace('{n}', String(a.value)) };
    return { icon: '🧭', title: t('board.allRounder'), value: t('board.allRounderValue').replace('{n}', String(a.value)) };
  };
  const shortDate = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' });

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div role="group" aria-label={t('board.period')} style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, backgroundColor: 'var(--warm-accent-light)', borderRadius: 14, padding: 4,
          border: '1.5px solid var(--warm-border)', maxWidth: '100%',
        }}>
          {PERIODS.map((p) => (
            <button key={p} style={chip(period === p)} aria-pressed={period === p} onClick={() => setParam('period', p, 'week')}>{periodLabel(p)}</button>
          ))}
        </div>
        <select className="tq-input-compact" value={mode} aria-label={t('board.mode')} onChange={(e) => setParam('mode', e.target.value, 'coins')}
          style={{ padding: '9px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <option value="coins">{t('board.modeCoins')}</option>
          <option value="goal">{t('board.modeGoal')}</option>
          <option value="improved">{t('board.modeImproved')}</option>
        </select>
      </div>
      {mode !== 'coins' && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)', marginTop: -8 }}>
          {t(mode === 'goal' ? 'board.modeGoalDesc' : 'board.modeImprovedDesc')}
        </div>
      )}

      {goal && (period === 'week' || period === 'lastWeek') && (
        <div className="tq-card tq-card-padded">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <h3 style={{ ...cardTitle, margin: 0 }}>🤝 {t('board.familyGoal')}{goal.prize ? `: ${goal.prize}` : ''}</h3>
            <span style={{ fontSize: 12, fontWeight: 800, color: goal.reached ? 'var(--health-green)' : 'var(--warm-text-light)' }}>
              {goal.reached ? t('board.familyGoalReached') : t('board.familyGoalProgress').replace('{total}', formatCoins(goal.total, locale)).replace('{target}', formatCoins(goal.target, locale))}
            </span>
          </div>
          <div style={{ height: 14, borderRadius: 8, backgroundColor: 'var(--warm-bg-subtle)', border: '1px solid var(--warm-border)', overflow: 'hidden', marginTop: 10 }}>
            <div style={{ width: `${Math.min(100, Math.round((goal.total / goal.target) * 100))}%`, height: '100%', background: 'linear-gradient(90deg, var(--warm-accent), #F59E0B)', transition: 'width 0.6s' }} />
          </div>
          {period === 'lastWeek' && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)', marginTop: 6 }}>{t('board.familyGoalThisWeek')}</div>}
        </div>
      )}

      {podium.length > 0 && (
        <div className="tq-card" style={{ padding: '28px 16px', background: 'var(--warm-streak-bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12 }}>
            {podium.map((u, i) => (
              <div key={u.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, maxWidth: 150, minWidth: 0 }}>
                <UserAvatar name={u.displayName} color={u.avatarColor} size={podiumAvatarSizes[i]} avatarType={u.avatarType as 'letter' | 'preset' | 'photo' | undefined} avatarPreset={u.avatarPreset ?? undefined} avatarPhotoUrl={u.avatarPhotoUrl ?? undefined} />
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)', margin: '6px 0', textAlign: 'center', overflowWrap: 'anywhere' }}>{u.displayName}</div>
                <div style={{
                  width: '100%', height: podiumHeights[i], borderRadius: '18px 18px 0 0', background: podiumGradients[i],
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#fff', opacity: 0.8 }}>#{u.rank}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>{score(u)}</div>
                  <div style={{ fontSize: 10, color: '#ffffffcc', fontWeight: 700, textAlign: 'center', padding: '0 4px' }}>{detail(u)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        {people.map((u) => (
          <div key={u.id} className="tq-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--card-padding)', marginBottom: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900,
                backgroundColor: u.rank === 1 ? 'var(--warm-accent-light)' : 'var(--warm-bg-subtle)',
                color: u.rank === 1 ? 'var(--warm-accent)' : 'var(--warm-text-light)',
                border: u.rank === 1 ? '1.5px solid var(--warm-accent)' : '1px solid var(--warm-border)',
              }}>{u.score === null ? '–' : `#${u.rank}`}</div>
              <span title={u.movement > 0 ? t('board.movedUp').replace('{n}', String(u.movement)) : u.movement < 0 ? t('board.movedDown').replace('{n}', String(-u.movement)) : undefined}
                style={{ fontSize: 10, fontWeight: 900, color: u.movement > 0 ? 'var(--health-green)' : u.movement < 0 ? 'var(--health-red)' : 'var(--warm-text-light)' }}>
                {u.movement > 0 ? `▲${u.movement}` : u.movement < 0 ? `▼${-u.movement}` : '–'}
              </span>
            </div>
            <UserAvatar name={u.displayName} color={u.avatarColor} size={48} avatarType={u.avatarType as 'letter' | 'preset' | 'photo' | undefined} avatarPreset={u.avatarPreset ?? undefined} avatarPhotoUrl={u.avatarPhotoUrl ?? undefined} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>
                {u.displayName}{(data?.trophies.wins[u.id] ?? 0) > 0 && <span style={{ fontSize: 12, marginLeft: 6 }} title={t('board.trophyShelf')}>🏆×{data!.trophies.wins[u.id]}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, flexWrap: 'wrap', fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><FireIcon /> {u.currentStreak}d {t('leaderboard.streak')}</span>
                <span>{t('board.choresCount').replace('{n}', String(u.chores))}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--warm-accent)' }}>{score(u)}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)' }}>{detail(u)}</div>
            </div>
          </div>
        ))}
        {data && people.length === 0 && <div className="tq-card tq-empty-state">{t('leaderboard.noData')}</div>}
        {failed && <div className="tq-card tq-empty-state">{t('common.error')}</div>}
      </div>

      {data && (
        <div className="tq-card tq-card-padded">
          <h3 style={cardTitle}>🏅 {period === 'week' ? t('board.awardsWeek') : period === 'lastWeek' ? t('board.awardsLastWeek') : `${t('board.awards')} · ${periodLabel(period)}`}</h3>
          {data.awards.length === 0 && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)' }}>{t('board.noAwards')}</div>}
          <div style={{ display: 'grid', gap: 8 }}>
            {data.awards.map((a, i) => {
              const text = awardText(a);
              return (
                <div key={`${a.key}-${a.roomId ?? i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, backgroundColor: 'var(--warm-bg-subtle)', border: '1px solid var(--warm-border)' }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{text.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{text.title}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' }}>{text.value}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--warm-accent)', textAlign: 'right', overflowWrap: 'anywhere', minWidth: 0 }}>{names(a.userIds)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data && (
        <div className="tq-card tq-card-padded">
          <h3 style={cardTitle}>🏆 {t('board.trophyShelf')}</h3>
          {data.trophies.weeks.length === 0
            ? <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)' }}>{t('board.noTrophies')}</div>
            : (
              <div style={{ display: 'grid', gap: 6 }}>
                {data.trophies.weeks.map((w) => (
                  <div key={w.weekStart} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--warm-text)', padding: '4px 0', borderBottom: '1px dashed var(--warm-border)' }}>
                    <span style={{ color: 'var(--warm-text-light)' }}>{t('board.weekOf').replace('{date}', shortDate(w.weekStart))}</span>
                    <span style={{ textAlign: 'right', overflowWrap: 'anywhere', minWidth: 0 }}>{names(w.userIds)} · {formatCoins(w.coins, locale)}</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
