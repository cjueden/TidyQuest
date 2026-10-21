import { useWidth } from './useWidth';
import { barHit, useUnpinOutside } from './useBarPick';
import { coinColor, formatValue, niceTicks, type CoinWeeks } from './insightsData';

const AXIS_W = 34;
const PLOT_H = 180;
const TOP = 8;
const X_BAND = 22;
const GAP = 2;

/** A bar segment with 4px rounded corners on its data end (top above the line, bottom below it). */
function endRounded(x: number, y: number, w: number, h: number, r: number, end: 'top' | 'bottom') {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return end === 'top'
    ? `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
    : `M${x},${y}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w - rr}Q${x + w},${y + h} ${x + w},${y + h - rr}V${y}Z`;
}

function Stack({ vals, cats, x, w, zeroY, scale, dir }: {
  vals: number[]; cats: CoinWeeks['inCats']; x: number; w: number; zeroY: number; scale: number; dir: 'up' | 'down';
}) {
  const nonZero = vals.map((v, j) => [v, j] as const).filter(([v]) => v > 0);
  // Where each segment starts: the sum of the ones before it
  const starts = nonZero.map((_, k) => nonZero.slice(0, k).reduce((a, [v]) => a + v, 0));
  return (
    <>
      {nonZero.map(([v, j], k) => {
        const near = starts[k] * scale + GAP / 2;
        const far = (starts[k] + v) * scale + GAP / 2;
        const last = k === nonZero.length - 1;
        const len = Math.max(1, far - near - (last ? 0 : GAP));
        const y = dir === 'up' ? zeroY - near - len : zeroY + near;
        const fill = coinColor(cats[j]);
        return last
          ? <path key={cats[j]} d={endRounded(x, y, w, len, 4, dir === 'up' ? 'top' : 'bottom')} fill={fill} />
          : <rect key={cats[j]} x={x} y={y} width={w} height={len} fill={fill} />;
      })}
    </>
  );
}

interface Props {
  labels: string[];
  weeks: CoinWeeks;
  language: string;
  /** The pinned week (tap or click) */
  selected: number | null;
  /** The week under the mouse, shown ahead of the pinned one */
  hovered: number | null;
  onSelect: (i: number | null) => void;
  onHover: (i: number | null) => void;
  ariaLabel: string;
  /** Balance line color: the person's own, or muted ink for everyone */
  balanceColor: string;
  balanceLabel: string;
}

/** Weekly coins in (above the line) and out (below), the weekly goal as a target mark, and the balance under it. */
export function CoinBars({ labels, weeks, language, selected, hovered, onSelect, onHover, ariaLabel, balanceColor, balanceLabel }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  useUnpinOutside(ref, selected, onSelect);
  const shown = hovered ?? selected;
  const n = labels.length;
  const plotW = Math.max(100, width - AXIS_W);
  const slot = plotW / Math.max(1, n);
  const barW = Math.max(3, Math.min(24, slot * 0.62));
  const maxUp = Math.max(0, ...weeks.earned, ...weeks.goals.map((g) => g ?? 0));
  const maxDown = Math.max(0, ...weeks.spent);
  const ticksAll = niceTicks(Math.max(maxUp, maxDown, 1));
  const step = ticksAll[1] || 1;
  const topUp = Math.max(maxUp > 0 ? step : 0, Math.ceil(maxUp / step) * step);
  const topDown = Math.ceil(maxDown / step) * step;
  const span = Math.max(1, topUp + topDown);
  const scale = PLOT_H / span;
  const zeroY = TOP + topUp * scale;
  const ticks: number[] = [];
  for (let v = -topDown; v <= topUp + step / 2; v += step) ticks.push(Math.round(v));
  const every = Math.max(1, Math.ceil(n / Math.floor(plotW / 44)));
  const cx = (i: number) => AXIS_W + slot * (i + 0.5);
  const fmt = (v: number) => formatValue(v, language);
  const height = TOP + PLOT_H + X_BAND;

  // Balance line, under the bars on the same weeks
  const LINE_H = 70;
  const LINE_TOP = 14;
  const balTicks = niceTicks(Math.max(1, ...weeks.balance));
  const balTop = balTicks[balTicks.length - 1] || 1;
  const by = (v: number) => LINE_TOP + LINE_H - (v / balTop) * LINE_H;
  const points = weeks.balance.map((v, i) => `${cx(i)},${by(v)}`).join(' ');
  const lastI = n - 1;

  const hit = (i: number, y: number, h: number, label: string, focusable = true) => (
    <rect key={`hit${i}`} x={AXIS_W + slot * i} y={y} width={slot} height={h} fill="transparent"
      tabIndex={focusable ? 0 : -1} role={focusable ? 'button' : undefined} aria-pressed={focusable ? selected === i : undefined} aria-label={focusable ? label : undefined}
      style={{ cursor: 'pointer', outline: 'none' }}
      {...barHit(i, selected, onSelect, onHover)} />
  );

  return (
    <div ref={ref} style={{ width: '100%' }} onPointerLeave={() => onHover(null)}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={ariaLabel} style={{ display: 'block', overflow: 'visible' }}>
        {ticks.map((v) => {
          const y = zeroY - v * scale;
          return (
            <g key={v}>
              {v !== 0 && <line x1={AXIS_W} x2={width} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />}
              <text x={AXIS_W - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--warm-text-muted)">{v < 0 ? `−${fmt(-v)}` : fmt(v)}</text>
            </g>
          );
        })}
        {weeks.up.map((vals, i) => {
          const x = AXIS_W + slot * i + (slot - barW) / 2;
          return (
            <g key={i} opacity={shown != null && shown !== i ? 0.4 : 1} style={{ transition: 'opacity 0.15s' }}>
              <Stack vals={vals} cats={weeks.inCats} x={x} w={barW} zeroY={zeroY} scale={scale} dir="up" />
              <Stack vals={weeks.down[i]} cats={weeks.outCats} x={x} w={barW} zeroY={zeroY} scale={scale} dir="down" />
            </g>
          );
        })}
        <line x1={AXIS_W} x2={width} y1={zeroY} y2={zeroY} stroke="var(--warm-border)" strokeWidth={1} />
        {/* Weekly goal: a target mark across each week, ringed in the card color so it reads over the bars */}
        {weeks.goals.map((g, i) => g == null ? null : (
          <g key={`g${i}`} pointerEvents="none">
            <line x1={AXIS_W + slot * i + slot * 0.08} x2={AXIS_W + slot * (i + 1) - slot * 0.08} y1={zeroY - g * scale} y2={zeroY - g * scale}
              stroke="var(--warm-card)" strokeWidth={5} strokeLinecap="round" />
            <line x1={AXIS_W + slot * i + slot * 0.08} x2={AXIS_W + slot * (i + 1) - slot * 0.08} y1={zeroY - g * scale} y2={zeroY - g * scale}
              stroke="var(--warm-text)" strokeWidth={2} strokeLinecap="round" />
          </g>
        ))}
        {labels.map((l, i) => (i % every === 0 || i === lastI ? (
          (i === lastI || lastI - i >= every) && (
            <text key={i} x={cx(i)} y={TOP + PLOT_H + 15} textAnchor="middle" fontSize={10}
              fill={shown === i ? 'var(--warm-text)' : 'var(--warm-text-muted)'} fontWeight={shown === i ? 700 : 400}>{l}</text>
          )
        ) : null))}
        {labels.map((l, i) => hit(i, 0, height, `${l}: +${fmt(weeks.earned[i])} −${fmt(weeks.spent[i])}`))}
      </svg>

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)', margin: '6px 0 0' }}>{balanceLabel}</div>
      <svg width="100%" height={LINE_TOP + LINE_H + 6} viewBox={`0 0 ${width} ${LINE_TOP + LINE_H + 6}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <line x1={AXIS_W} x2={width} y1={by(0) + 0.5} y2={by(0) + 0.5} stroke="var(--warm-border)" strokeWidth={1} />
        <text x={AXIS_W - 6} y={by(balTop) + 3.5} textAnchor="end" fontSize={10} fill="var(--warm-text-muted)">{fmt(balTop)}</text>
        <text x={AXIS_W - 6} y={by(0) + 3.5} textAnchor="end" fontSize={10} fill="var(--warm-text-muted)">0</text>
        <polygon points={`${cx(0)},${by(0)} ${points} ${cx(lastI)},${by(0)}`} fill={balanceColor} opacity={0.1} />
        <polyline points={points} fill="none" stroke={balanceColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {[...new Set([lastI, ...(shown != null ? [shown] : [])])].map((i) => (
          <circle key={i} cx={cx(i)} cy={by(weeks.balance[i])} r={4} fill={balanceColor} stroke="var(--warm-card)" strokeWidth={2} />
        ))}
        <text x={Math.min(width - 2, cx(lastI) + 2)} y={by(weeks.balance[lastI]) - 8} textAnchor="end" fontSize={11} fontWeight={700} fill="var(--warm-text)">
          {fmt(weeks.balance[lastI])}
        </text>
        {labels.map((l, i) => hit(i, 0, LINE_TOP + LINE_H + 6, l, false))}
      </svg>
    </div>
  );
}
