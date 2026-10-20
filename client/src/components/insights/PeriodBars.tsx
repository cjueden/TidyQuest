import { useEffect, useRef, useState } from 'react';
import { formatValue, niceTicks, type Stacked } from './insightsData';

const AXIS_W = 30;
const PLOT_H = 170;
const TOP = 8;
const X_BAND = 22;
const GAP = 2;

/** Bar with a 4px rounded top and a square base. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function useWidth<T extends HTMLElement>(fallback = 340) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function LegendRow({ series }: { series: Stacked['series'] }) {
  if (series.length < 2) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 8 }}>
      {series.map((s) => (
        <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--warm-text)', minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{s.label}</span>
        </span>
      ))}
    </div>
  );
}

interface Props {
  labels: Array<{ axis: string; full: string }>;
  stacked: Stacked;
  language: string;
  selected: number | null;
  onSelect: (i: number | null) => void;
  ariaLabel: string;
  /** Wider axis labels (hours) */
  wideLabels?: boolean;
}

/** Stacked period bars: tap or hover a bar to pick it; the page shows its numbers. */
export function PeriodBars({ labels, stacked, language, selected, onSelect, ariaLabel, wideLabels }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const n = labels.length;
  const plotW = Math.max(100, width - AXIS_W);
  const slot = plotW / Math.max(1, n);
  const barW = Math.max(3, Math.min(24, slot * 0.62));
  const ticks = niceTicks(Math.max(0, ...stacked.totals));
  const top = ticks[ticks.length - 1] || 1;
  const base = TOP + PLOT_H;
  const scale = PLOT_H / top;
  const every = Math.max(1, Math.ceil(n / Math.floor(plotW / (wideLabels ? 46 : 30))));

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {/* 100% wide with a viewBox in measured pixels, so the chart never props its container open */}
      <svg width="100%" height={base + X_BAND} viewBox={`0 0 ${width} ${base + X_BAND}`} role="group" aria-label={ariaLabel}
        style={{ display: 'block', overflow: 'visible' }}>
        {ticks.map((v) => {
          const y = base - v * scale;
          return (
            <g key={v}>
              {v > 0 && <line x1={AXIS_W} x2={width} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />}
              <text x={AXIS_W - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--warm-text-muted)">{formatValue(v, language, 1)}</text>
            </g>
          );
        })}
        <line x1={AXIS_W} x2={width} y1={base + 0.5} y2={base + 0.5} stroke="var(--warm-border)" strokeWidth={1} />

        {stacked.values.map((vals, i) => {
          const x = AXIS_W + slot * i + (slot - barW) / 2;
          const nonZero = vals.map((v, j) => [v, j] as const).filter(([v]) => v > 0);
          let cum = 0;
          const dim = selected != null && selected !== i;
          return (
            <g key={i} opacity={dim ? 0.4 : 1} style={{ transition: 'opacity 0.15s' }}>
              {nonZero.map(([v, j], k) => {
                const yBottom = base - cum * scale;
                cum += v;
                const yTop = base - cum * scale;
                const last = k === nonZero.length - 1;
                const drawTop = last ? yTop : yTop + GAP;
                const h = Math.max(1, yBottom - drawTop);
                const s = stacked.series[j];
                return last
                  ? <path key={s.key} d={topRounded(x, yBottom - h, barW, h, 4)} fill={s.color} />
                  : <rect key={s.key} x={x} y={yBottom - h} width={barW} height={h} fill={s.color} />;
              })}
            </g>
          );
        })}

        {labels.map((l, i) => (i % every === 0 ? (
          <text key={i} x={AXIS_W + slot * (i + 0.5)} y={base + 15} textAnchor="middle" fontSize={10}
            fill={selected === i ? 'var(--warm-text)' : 'var(--warm-text-muted)'} fontWeight={selected === i ? 700 : 400}>{l.axis}</text>
        ) : null))}

        {/* Hit targets: the whole column, bigger than the bar */}
        {labels.map((l, i) => (
          <rect key={`hit${i}`} x={AXIS_W + slot * i} y={0} width={slot} height={base + X_BAND} fill="transparent"
            tabIndex={0} role="button" aria-pressed={selected === i}
            aria-label={`${l.full}: ${formatValue(stacked.totals[i], language, 1)}`}
            style={{ cursor: 'pointer', outline: 'none' }}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') onSelect(i); }}
            onClick={() => onSelect(i)}
            onFocus={() => onSelect(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const next = Math.min(n - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)));
                ((e.currentTarget.parentNode as SVGElement).querySelectorAll('rect[role="button"]')[next] as SVGRectElement | undefined)?.focus();
              }
            }} />
        ))}
      </svg>
    </div>
  );
}
