import { useState } from 'react';
import type { InsightsCoins } from '../../hooks/useApi';
import { localeFor } from '../../utils/locale';
import { CoinBars } from './CoinBars';
import { coinColor, coinWeeks, formatValue, rewardStats } from './insightsData';
import { Segmented } from './Segmented';

const muted = { fontSize: 12, color: 'var(--warm-text-muted)' } as const;
const cardTitle = { fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--warm-text)' } as const;
const subTitle = { fontSize: 14, fontWeight: 800, margin: '16px 0 2px', color: 'var(--warm-text)' } as const;
const linkButton = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--warm-accent)', fontFamily: 'inherit' } as const;
const cell = { padding: '4px 6px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const };

interface Props {
  data: InsightsCoins | null;
  weeks: 8 | 26;
  onWeeks: (w: 8 | 26) => void;
  personId: number | null;
  language: string;
  t: (k: string) => string;
}

/** Coins in and out per week (NEW-7 part 3): earned vs spent, the weekly goal, the balance, and rewards bought. */
export function CoinsCard({ data, weeks, onWeeks, personId, language, t }: Props) {
  const [picked, setPicked] = useState<{ key: string; index: number } | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [allNever, setAllNever] = useState(false);
  const fmt = (v: number) => formatValue(v, language);
  const signed = (v: number, sign: '+' | '−') => (v > 0 ? `${sign}${fmt(v)}` : '0');
  const locale = localeFor(language);
  const key = `${weeks}:${personId ?? ''}`;
  const selected = picked?.key === key ? picked.index : null;

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <h2 id="insights-coins" style={cardTitle}>{t('insights.coinsTitle')}</h2>
      <Segmented label={t('insights.heatRange')} value={String(weeks) as '8' | '26'} onChange={(v) => onWeeks(v === '26' ? 26 : 8)}
        options={[{ value: '8', label: t('insights.weeks8') }, { value: '26', label: t('insights.weeks26') }]} />
    </div>
  );
  if (!data || data.weeks !== weeks) {
    return <section className="tq-card tq-card-padded" aria-labelledby="insights-coins">{header}<p style={muted}>{t('insights.loading')}</p></section>;
  }

  const w = coinWeeks(data, personId);
  const person = data.people.find((p) => p.id === personId);
  const labels = data.starts.map((iso) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }));
  const cat = (c: string) => t(`insights.cat_${c}`);
  const hasGoals = w.goals.some((g) => g != null);
  const goalWeeks = w.goals.map((g, i) => [g, w.choreCoins[i]] as const).filter(([g]) => g != null);
  const met = goalWeeks.filter(([g, c]) => c >= (g as number)).length;
  const empty = w.earned.every((v) => v === 0) && w.spent.every((v) => v === 0);
  const rewards = rewardStats(data, personId);
  const maxTimes = Math.max(1, ...rewards.most.map((r) => r.times));

  return (
    <section className="tq-card tq-card-padded" aria-labelledby="insights-coins">
      {header}
      <p style={{ ...muted, margin: '6px 0 8px' }}>{t('insights.coinsHint')}{hasGoals ? ` ${t('insights.goalHint')}` : ''}</p>
      {empty ? <p style={muted}>{t('insights.coinsEmpty')}</p> : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 8 }}>
            {[...w.inCats, ...w.outCats].map((c) => (
              <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--warm-text)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: coinColor(c) }} />{cat(c)}
              </span>
            ))}
            {hasGoals && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--warm-text)' }}>
                <span style={{ width: 14, height: 2, borderRadius: 1, background: 'var(--warm-text)' }} />{t('insights.weeklyGoal')}
              </span>
            )}
          </div>
          <CoinBars labels={labels} weeks={w} language={language} selected={selected}
            onSelect={(i) => setPicked({ key, index: i })} ariaLabel={t('insights.coinsTitle')}
            balanceColor={person?.color ?? 'var(--warm-text-muted)'} balanceLabel={t('insights.balance')} />

          <div aria-live="polite" style={{ minHeight: 40, marginTop: 6 }}>
            {selected == null ? <p style={{ ...muted, margin: 0 }}>{t('insights.tapWeek')}</p> : (
              <div style={{ fontSize: 12 }}>
                <div style={{ fontSize: 13, color: 'var(--warm-text)', marginBottom: 4 }}>
                  <strong>{t('insights.weekOf').replace('{date}', labels[selected])}</strong>
                  {' · '}{t('insights.in')} <strong>{signed(w.earned[selected], '+')}</strong>
                  {' · '}{t('insights.out')} <strong>{signed(w.spent[selected], '−')}</strong>
                  {' · '}{t('insights.balance')} <strong>{fmt(w.balance[selected])}</strong>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                  {[...w.inCats.map((c, j) => [c, w.up[selected][j], '+'] as const), ...w.outCats.map((c, j) => [c, w.down[selected][j], '−'] as const)]
                    .filter(([, v]) => v > 0).map(([c, v, sign]) => (
                      <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 12, height: 3, borderRadius: 2, background: coinColor(c) }} />
                        <strong style={{ color: 'var(--warm-text)' }}>{sign}{fmt(v)}</strong>
                        <span style={{ color: 'var(--warm-text-muted)' }}>{cat(c)}</span>
                      </span>
                    ))}
                </div>
                {w.goals[selected] != null && (
                  <div style={{ ...muted, marginTop: 3 }}>
                    {t('insights.goalLine').replace('{goal}', fmt(w.goals[selected]!)).replace('{chores}', fmt(w.choreCoins[selected]))}
                  </div>
                )}
              </div>
            )}
          </div>
          {goalWeeks.length > 0 && (
            <p style={{ fontSize: 13, color: 'var(--warm-text)', margin: '2px 0 6px' }}>
              {t('insights.goalMet').replace('{met}', String(met)).replace('{n}', String(goalWeeks.length))}
            </p>
          )}
          <button type="button" style={linkButton} aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
            {showTable ? t('insights.hideTable') : t('insights.showTable')}
          </button>
          {showTable && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8, color: 'var(--warm-text)' }}>
              <thead>
                <tr style={{ color: 'var(--warm-text-muted)' }}>
                  <th style={{ ...cell, textAlign: 'left', paddingLeft: 0 }}>{t('insights.week')}</th>
                  <th style={cell}>{t('insights.in')}</th>
                  <th style={cell}>{t('insights.out')}</th>
                  <th style={cell}>{t('insights.balance')}</th>
                  {hasGoals && <th style={{ ...cell, paddingRight: 0 }}>{t('insights.weeklyGoal')}</th>}
                </tr>
              </thead>
              <tbody>
                {labels.map((l, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--warm-border-subtle)' }}>
                    <td style={{ ...cell, textAlign: 'left', paddingLeft: 0 }}>{l}</td>
                    <td style={cell}>{signed(w.earned[i], '+')}</td>
                    <td style={cell}>{signed(w.spent[i], '−')}</td>
                    <td style={{ ...cell, fontWeight: 700 }}>{fmt(w.balance[i])}</td>
                    {hasGoals && <td style={{ ...cell, paddingRight: 0 }}>{w.goals[i] == null ? '' : `${fmt(w.choreCoins[i])} / ${fmt(w.goals[i]!)}`}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Everyone: each person's totals for the window */}
      {personId == null && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 14, color: 'var(--warm-text)' }}>
          <thead>
            <tr style={{ color: 'var(--warm-text-muted)', fontSize: 12 }}>
              <th style={{ ...cell, textAlign: 'left', paddingLeft: 0 }}>{t('insights.person')}</th>
              <th style={cell}>{t('insights.in')}</th>
              <th style={cell}>{t('insights.out')}</th>
              <th style={{ ...cell, paddingRight: 0 }}>{t('insights.balanceNow')}</th>
            </tr>
          </thead>
          <tbody>
            {data.people.map((p) => {
              const pw = coinWeeks(data, p.id);
              const inSum = pw.earned.reduce((a, b) => a + b, 0);
              const outSum = pw.spent.reduce((a, b) => a + b, 0);
              if (!inSum && !outSum && !p.balance) return null;
              return (
                <tr key={p.id} style={{ borderTop: '1px solid var(--warm-border-subtle)' }}>
                  <td style={{ ...cell, textAlign: 'left', paddingLeft: 0, whiteSpace: 'normal' }}>
                    <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 99, background: p.color, marginRight: 6 }} />{p.name}
                  </td>
                  <td style={cell}>{signed(inSum, '+')}</td>
                  <td style={cell}>{signed(outSum, '−')}</td>
                  <td style={{ ...cell, paddingRight: 0, fontWeight: 700 }}>{fmt(p.balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3 style={subTitle}>{t('insights.boughtMost')}</h3>
      {rewards.most.length === 0 ? <p style={{ ...muted, fontStyle: 'italic', margin: '4px 0 0' }}>{t('insights.boughtNone')}</p> : (
        <ul style={{ margin: 0, padding: 0 }}>
          {rewards.most.slice(0, 5).map((r) => (
            <li key={r.key} style={{ listStyle: 'none', padding: '7px 0', borderTop: '1px solid var(--warm-border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{r.name}</span>
                <strong style={{ fontSize: 14, color: 'var(--warm-text)', whiteSpace: 'nowrap' }}>{r.times}×</strong>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--viz-heat-0)', margin: '5px 0 3px' }}>
                <div style={{ height: 4, borderRadius: 2, width: `${(r.times / maxTimes) * 100}%`, background: 'var(--viz-heat-4)' }} />
              </div>
              <div style={muted}>{t('insights.coinsSpent').replace('{n}', fmt(r.coins))}</div>
            </li>
          ))}
        </ul>
      )}
      <h3 style={subTitle}>{t('insights.neverBought').replace('{n}', String(rewards.never.length))}</h3>
      {rewards.never.length === 0 ? <p style={{ ...muted, fontStyle: 'italic', margin: '4px 0 0' }}>{t('insights.neverNone')}</p> : (
        <p style={{ fontSize: 13, color: 'var(--warm-text)', margin: '4px 0 0', lineHeight: 1.5 }}>
          {(allNever ? rewards.never : rewards.never.slice(0, 8)).join(' · ')}
          {rewards.never.length > 8 && (
            <> {' '}<button type="button" style={linkButton} aria-expanded={allNever} onClick={() => setAllNever((v) => !v)}>
              {allNever ? t('insights.showFewer') : t('insights.showAll').replace('{n}', String(rewards.never.length))}
            </button></>
          )}
        </p>
      )}
    </section>
  );
}
