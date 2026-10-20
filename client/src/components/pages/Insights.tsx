import { useEffect, useState } from 'react';
import { api, type InsightsBars, type InsightsCoins, type InsightsHeatmap, type InsightsRange, type InsightsSkipped } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import {
  addDays, bucketLabels, daysIncl, formatValue, fromYmd, heatGrid, lastDayOf, periodLabel, shares, shiftDay, skippedLists, stackBars, ymd,
  type ListBy, type Measure, type StackBy,
} from '../insights/insightsData';
import { DatePick } from '../insights/DatePick';
import { SkippedLists } from '../insights/SkippedLists';
import { Segmented } from '../insights/Segmented';
import { CoinsCard } from '../insights/CoinsCard';
import { localeFor } from '../../utils/locale';
import { LegendRow, PeriodBars } from '../insights/PeriodBars';
import { HeatScale, WeekHeatmap, type HeatCell } from '../insights/WeekHeatmap';
import { weekdayName, WEEK_ORDER } from '../../utils/schedule';

interface Props {
  language: string;
  gamificationEnabled: boolean;
}

const cardTitle = { fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--warm-text)' } as const;
const muted = { fontSize: 12, color: 'var(--warm-text-muted)' } as const;
const linkButton = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--warm-accent)', fontFamily: 'inherit' } as const;

/** Parents' Insights page (NEW-7): when chores get done, by whom, and in which rooms. Charts only. */
export function Insights({ language, gamificationEnabled }: Props) {
  const { t, taskName, roomDisplayName } = useTranslation(language);
  const today = ymd(new Date());
  const [period, setPeriod] = useState<InsightsRange>('week');
  /** A day inside the period shown (Day/Week/Month/Year) */
  const [day, setDay] = useState(today);
  /** Custom: From–To, both days included */
  const [range, setRange] = useState<{ from: string; to: string }>({ from: addDays(today, -29), to: today });
  const [measureChoice, setMeasure] = useState<Measure>('chores');
  const [stack, setStack] = useState<StackBy>('person');
  const [person, setPerson] = useState<number | null>(null);
  const [heatWeeks, setHeatWeeks] = useState<4 | 12>(4);
  const [bars, setBars] = useState<InsightsBars | null>(null);
  const [heat, setHeat] = useState<InsightsHeatmap | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<{ key: string; index: number } | null>(null);
  const [cell, setCell] = useState<HeatCell | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [skipped, setSkipped] = useState<InsightsSkipped | null>(null);
  const [listBy, setListBy] = useState<ListBy>('chore');
  const [coinRange, setCoinRange] = useState<8 | 26>(8);
  const [coins, setCoins] = useState<InsightsCoins | null>(null);

  const measure: Measure = !gamificationEnabled && measureChoice === 'coins' ? 'chores' : measureChoice;
  const query = period === 'custom' ? `period=custom&from=${range.from}&to=${range.to}` : `period=${period}&date=${day}`;
  const selected = picked?.key === query ? picked.index : null;
  // The heatmap and coins card end where the picked dates end (never after today)
  const lastDay = (() => { const d = period === 'custom' ? range.to : lastDayOf(period, day); return d > today ? today : d; })();

  useEffect(() => {
    let live = true;
    api.getInsightsBars(query)
      .then((d) => { if (live) { setBars(d); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [query]);

  useEffect(() => {
    let live = true;
    api.getInsightsSkipped(query)
      .then((d) => { if (live) setSkipped(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [query]);

  useEffect(() => {
    if (!gamificationEnabled) return;
    let live = true;
    api.getInsightsCoins(coinRange, lastDay)
      .then((d) => { if (live) setCoins(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [coinRange, gamificationEnabled, lastDay]);

  useEffect(() => {
    let live = true;
    api.getInsightsHeatmap(heatWeeks, lastDay)
      .then((d) => { if (live) setHeat(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [heatWeeks, lastDay]);

  const measureName = t(`insights.${measure}`);
  // The last loaded period stays on screen until the next one arrives (no flash while stepping)
  const current = bars;
  const tasks = new Map((current?.tasks ?? []).map((x) => [x.id, x]));
  const rooms = new Map((current?.rooms ?? []).map((x) => [x.id, x]));
  const names = {
    task: (id: number) => { const x = tasks.get(id); return x ? taskName(x.name, x.translationKey) : '?'; },
    room: (id: number) => { const x = rooms.get(id); return x ? roomDisplayName(x.name, x.roomType) : '?'; },
  };
  const stacked = current ? stackBars(current, stack, measure, person, names, t('insights.other')) : null;
  const labels = current ? bucketLabels(current.grain, current.buckets, language, t('insights.weekOf')) : [];
  const grid = heat ? heatGrid(heat, measure, person) : null;
  const people = current?.people ?? heat?.people ?? [];
  const shareRows = current ? shares(current, measure) : [];

  // Skipped lists carry their own chores and rooms (not only the ones done this period)
  const skipTasks = new Map((skipped?.tasks ?? []).map((x) => [x.id, x]));
  const skipRooms = new Map((skipped?.rooms ?? []).map((x) => [x.id, x]));
  const lists = skipped ? skippedLists(skipped, listBy, person, {
    task: (id) => { const x = skipTasks.get(id); return x ? taskName(x.name, x.translationKey) : '?'; },
    room: (id) => { const x = skipRooms.get(id); return x ? roomDisplayName(x.name, x.roomType) : '?'; },
  }) : null;
  const undoneNote = (() => {
    if (!skipped) return null;
    if (!skipped.snapshotSince) return t('insights.undoneNotYet');
    const firstDay = new Date(skipped.start).toLocaleDateString('en-CA');
    if (skipped.snapshotSince <= firstDay) return null;
    const since = new Date(`${skipped.snapshotSince}T12:00:00`).toLocaleDateString(localeFor(language), { day: 'numeric', month: 'short' });
    return t('insights.undoneSince').replace('{date}', since);
  })();
  const personName = people.find((p) => p.id === person)?.name;

  const canGoBack = !!current?.earliest && new Date(current.earliest) < new Date(current.start);
  const running = !!current?.previousSoFar;
  const rangeDays = daysIncl(range.from, range.to);
  const earliestDay = current?.earliest ? ymd(new Date(current.earliest)) : undefined;
  const shortDate = (s: string) => fromYmd(s).toLocaleDateString(localeFor(language), { day: 'numeric', month: 'short', ...(s.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) });
  /** ◀ ▶: a period at a time, or a custom range by its own length (never past today) */
  const step = (dir: -1 | 1) => {
    if (period === 'custom') {
      let to = addDays(range.to, dir * rangeDays);
      if (to > today) to = today;
      setRange({ from: addDays(to, -(rangeDays - 1)), to });
    } else {
      const next = shiftDay(period, day, dir);
      setDay(next > today ? today : next);
    }
  };
  const pickPeriod = (p: InsightsRange) => {
    if (p === 'custom' && period !== 'custom' && current) {
      // Start the range on what's showing
      const last = ymd(new Date(new Date(current.end).getTime() - 1));
      setRange({ from: ymd(new Date(current.start)), to: last > today ? today : last });
    }
    if (p !== 'custom' && period === 'custom') setDay(range.to);
    setPeriod(p);
  };
  const backToToday = () => (period === 'custom' ? setRange({ from: addDays(today, -(rangeDays - 1)), to: today }) : setDay(today));
  const total = stacked ? stacked.totals.reduce((a, b) => a + b, 0) : 0;
  const fmt = (v: number, d = 0) => formatValue(v, language, d);
  const prevName = current ? t(`insights.${current.previousSoFar ? 'sofar' : 'prev'}_${current.period}`).replace('{n}', String(rangeDays)) : '';
  const slotLabels = [0, 1, 2, 3, 4, 5].map((i) => t(`insights.slot${i}`));
  const dayLabels = WEEK_ORDER.map((d) => weekdayName(d, language, 'short'));

  const measures: Array<{ value: Measure; label: string }> = [
    { value: 'chores', label: t('insights.chores') },
    ...(gamificationEnabled ? [{ value: 'coins' as const, label: t('insights.coins') }] : []),
    { value: 'effort', label: t('insights.effort') },
  ];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters scope everything below them */}
      <div className="tq-card tq-card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Segmented label={t('insights.period')} value={period} onChange={pickPeriod}
          options={(['day', 'week', 'month', 'year', 'custom'] as const).map((p) => ({ value: p, label: t(`insights.${p}`) }))} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="tq-btn-secondary" aria-label={t('insights.earlier')} disabled={!canGoBack}
            onClick={() => step(-1)} style={{ padding: '6px 12px', opacity: canGoBack ? 1 : 0.4 }}>◀</button>
          <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
            {period === 'custom' ? (
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--warm-text)' }}>
                {current ? periodLabel('custom', current.start, current.end, language) : '…'}
              </div>
            ) : (
              <DatePick value={day} min={earliestDay} max={today} label={t('insights.pickDate')} onChange={setDay}
                text={current ? periodLabel(current.period, current.start, current.end, language) : '…'} />
            )}
            <div style={muted}>
              {period === 'custom' && t('insights.nDays').replace('{n}', String(rangeDays))}
              {period === 'custom' && !running && ' · '}
              {running ? (period !== 'custom' && t(`insights.this_${period}`)) : (
                <button type="button" style={linkButton} onClick={backToToday}>{t('insights.today')}</button>
              )}
            </div>
          </div>
          <button type="button" className="tq-btn-secondary" aria-label={t('insights.later')} disabled={running}
            onClick={() => step(1)} style={{ padding: '6px 12px', opacity: running ? 0.4 : 1 }}>▶</button>
        </div>
        {period === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
            {(['from', 'to'] as const).map((k) => (
              <label key={k} style={{ flex: 1, minWidth: 0, ...muted, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {t(`insights.${k}`)}
                <input type="date" className="tq-input-compact" value={range[k]} min={earliestDay} max={today}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const picked = v > today ? today : v;
                    // Moving one end past the other drags the other one along
                    setRange(k === 'from' ? { from: picked, to: picked > range.to ? picked : range.to }
                      : { from: picked < range.from ? picked : range.from, to: picked });
                  }}
                  style={{ width: '100%', minWidth: 0, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }} />
              </label>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <Segmented label={t('insights.measure')} value={measure} onChange={setMeasure} options={measures} />
          </div>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <Segmented label={t('insights.stackBy')} value={stack} onChange={setStack}
              options={(['person', 'room', 'chore'] as const).map((s) => ({ value: s, label: t(`insights.by_${s}`) }))} />
          </div>
          <select className="tq-input-compact" aria-label={t('insights.person')} value={person ?? ''}
            onChange={(e) => setPerson(e.target.value ? Number(e.target.value) : null)}
            style={{ flex: '1 1 140px', minWidth: 0, padding: '6px 10px', fontSize: 13 }}>
            <option value="">{t('insights.everyone')}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {failed && <div className="tq-card tq-card-padded" role="alert" style={{ color: 'var(--warm-text)' }}>{t('insights.loadError')}</div>}

      {/* Period bars */}
      <section className="tq-card tq-card-padded" aria-labelledby="insights-bars">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <h2 id="insights-bars" style={cardTitle}>{t('insights.whenTitle')}</h2>
          <span style={muted}>{measureName}: <strong style={{ color: 'var(--warm-text)' }}>{fmt(total)}</strong></span>
        </div>
        {!stacked ? <p style={muted}>{t('insights.loading')}</p> : total === 0 ? (
          <p style={muted}>{t('insights.noData')}</p>
        ) : (
          <>
            <LegendRow series={stacked.series} />
            <PeriodBars labels={labels} stacked={stacked} language={language} wideLabels={current?.grain === 'hour' || current?.grain === 'week'}
              selected={selected} onSelect={(i) => setPicked(i == null ? null : { key: query, index: i })}
              ariaLabel={`${measureName} · ${current ? periodLabel(current.period, current.start, current.end, language) : ''}`} />
            <div aria-live="polite" style={{ minHeight: 44, marginTop: 6 }}>
              {selected == null ? <p style={{ ...muted, margin: 0 }}>{t('insights.tapBar')}</p> : (
                <div>
                  <div style={{ fontSize: 13, color: 'var(--warm-text)', marginBottom: 4 }}>
                    <strong>{labels[selected]?.full}</strong> · {measureName} <strong>{fmt(stacked.totals[selected])}</strong>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                    {stacked.series.map((s, j) => stacked.values[selected][j] > 0 && (
                      <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                        <span style={{ width: 12, height: 3, borderRadius: 2, background: s.color }} />
                        <strong style={{ color: 'var(--warm-text)' }}>{fmt(stacked.values[selected][j])}</strong>
                        <span style={{ color: 'var(--warm-text-muted)' }}>{s.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button type="button" style={linkButton} aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
              {showTable ? t('insights.hideTable') : t('insights.showTable')}
            </button>
            {showTable && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--warm-text-muted)' }}>
                    <th style={{ padding: '4px 6px 4px 0', fontWeight: 700 }}>{t('insights.when')}</th>
                    <th style={{ padding: '4px 6px', fontWeight: 700, textAlign: 'right' }}>{measureName}</th>
                    <th style={{ padding: '4px 0 4px 6px', fontWeight: 700 }}>{t(`insights.by_${stack}`)}</th>
                  </tr>
                </thead>
                <tbody>
                  {stacked.totals.map((tot, i) => tot > 0 && (
                    <tr key={i} style={{ borderTop: '1px solid var(--warm-border-subtle)', color: 'var(--warm-text)' }}>
                      <td style={{ padding: '4px 6px 4px 0', whiteSpace: 'nowrap' }}>{labels[i]?.full}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>{fmt(tot)}</td>
                      <td style={{ padding: '4px 0 4px 6px', color: 'var(--warm-text-muted)' }}>
                        {stacked.series.map((s, j) => stacked.values[i][j] > 0 ? `${s.label} ${fmt(stacked.values[i][j])}` : null).filter(Boolean).join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* Weekday × time of day */}
      <section className="tq-card tq-card-padded" aria-labelledby="insights-heat">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <h2 id="insights-heat" style={cardTitle}>{t('insights.heatTitle')}</h2>
          <Segmented label={t('insights.heatRange')} value={String(heatWeeks) as '4' | '12'}
            onChange={(v) => { setHeatWeeks(v === '12' ? 12 : 4); setCell(null); }}
            options={[{ value: '4', label: t('insights.weeks4') }, { value: '12', label: t('insights.weeks12') }]} />
        </div>
        <p style={{ ...muted, margin: '0 0 10px' }}>
          {t('insights.heatHint')}{' '}
          <strong style={{ color: 'var(--warm-text)', fontWeight: 700 }}>{t('insights.weeksTo').replace('{n}', String(heatWeeks)).replace('{date}', shortDate(lastDay))}</strong>
        </p>
        {!grid ? <p style={muted}>{t('insights.loading')}</p> : (
          <>
            <WeekHeatmap grid={grid} dayLabels={dayLabels} slotLabels={slotLabels} language={language}
              showNumbers={showNumbers} selected={cell} onSelect={setCell}
              cellLabel={(d, s, v) => `${dayLabels[d]} ${slotLabels[s]}: ${t('insights.perWeek').replace('{value}', fmt(v, 1))}`} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <HeatScale less={t('insights.less')} more={t('insights.more')} />
              <button type="button" style={linkButton} aria-pressed={showNumbers} onClick={() => setShowNumbers((v) => !v)}>
                {showNumbers ? t('insights.hideNumbers') : t('insights.showNumbers')}
              </button>
            </div>
            <div aria-live="polite" style={{ ...muted, minHeight: 18, marginTop: 6 }}>
              {cell ? (
                <span style={{ color: 'var(--warm-text)' }}>
                  <strong>{dayLabels[cell.day]} {slotLabels[cell.slot]}</strong> · {measureName}{' '}
                  <strong>{t('insights.perWeek').replace('{value}', fmt(grid[cell.day][cell.slot], 1))}</strong>
                </span>
              ) : t('insights.tapCell')}
            </div>
          </>
        )}
      </section>

      {/* Who does how much */}
      <section className="tq-card tq-card-padded" aria-labelledby="insights-who">
        <h2 id="insights-who" style={{ ...cardTitle, marginBottom: 10 }}>{t('insights.whoTitle')}</h2>
        {!current ? <p style={muted}>{t('insights.loading')}</p> : shareRows.length === 0 ? <p style={muted}>{t('insights.noData')}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {shareRows.map((r) => {
              const delta = r.value - r.previous;
              const dim = person != null && person !== r.person.id;
              return (
                <div key={r.person.id} style={{ opacity: dim ? 0.45 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 99, background: r.person.color, flexShrink: 0, alignSelf: 'center' }} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--warm-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.person.name}</span>
                    <strong style={{ fontSize: 15, color: 'var(--warm-text)' }}>{fmt(r.value)}</strong>
                    <span style={{ ...muted, width: 38, textAlign: 'right' }}>{Math.round(r.share * 100)}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--viz-heat-0)', margin: '5px 0 3px 18px' }}>
                    <div style={{ height: 6, borderRadius: 3, width: `${Math.max(r.value > 0 ? 2 : 0, r.share * 100)}%`, background: r.person.color }} />
                  </div>
                  <div style={{ ...muted, marginLeft: 18 }}>
                    {t('insights.change')
                      .replace('{delta}', delta === 0 ? '±0' : `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))}`)
                      .replace('{prev}', prevName).replace('{before}', fmt(r.previous))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Skipped and late */}
      <section className="tq-card tq-card-padded" aria-labelledby="insights-skipped">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h2 id="insights-skipped" style={cardTitle}>{t('insights.skippedTitle')}</h2>
          <Segmented label={t('insights.listBy')} value={listBy} onChange={setListBy}
            options={[{ value: 'chore', label: t('insights.chores') }, { value: 'room', label: t('insights.rooms') }]} />
        </div>
        {personName && <p style={{ ...muted, margin: '6px 0 0' }}>{t('insights.onlyPerson').replace('{name}', personName)}</p>}
        {!lists ? <p style={muted}>{t('insights.loading')}</p> : (
          <SkippedLists lists={lists} language={language} t={t} undoneNote={undoneNote} />
        )}
      </section>

      {/* Coins in and out (hidden with game features off) */}
      {gamificationEnabled && (
        <CoinsCard data={coins} weeks={coinRange} onWeeks={setCoinRange} personId={person} language={language} t={t}
          rangeLabel={t('insights.weeksTo').replace('{n}', String(coinRange)).replace('{date}', shortDate(lastDay))} />
      )}
    </div>
  );
}
