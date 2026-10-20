import { formatValue } from './insightsData';

export interface HeatCell { day: number; slot: number }

interface Props {
  grid: number[][];
  dayLabels: string[];
  slotLabels: string[];
  language: string;
  showNumbers: boolean;
  selected: HeatCell | null;
  onSelect: (c: HeatCell | null) => void;
  cellLabel: (day: number, slot: number, value: number) => string;
}

/** 1–6 by share of the busiest cell; 0 = nothing done. */
function heatLevel(v: number, max: number): number {
  if (v <= 0 || max <= 0) return 0;
  return Math.min(6, Math.max(1, Math.ceil((v / max) * 6)));
}

/** Weekday × time-of-day grid, darker = more done (one blue ramp; light/dark steps in index.css). */
export function WeekHeatmap({ grid, dayLabels, slotLabels, language, showNumbers, selected, onSelect, cellLabel }: Props) {
  const max = Math.max(0, ...grid.flat());
  return (
    <div role="grid" style={{ display: 'grid', gridTemplateColumns: '36px repeat(6, minmax(0, 1fr))', gap: 2 }}>
      <span />
      {slotLabels.map((s) => (
        <span key={s} style={{ fontSize: 10, color: 'var(--warm-text-muted)', textAlign: 'center', paddingBottom: 2, whiteSpace: 'nowrap' }}>{s}</span>
      ))}
      {grid.map((row, day) => [
        <span key={`d${day}`} style={{ fontSize: 11, color: 'var(--warm-text-muted)', alignSelf: 'center' }}>{dayLabels[day]}</span>,
        ...row.map((v, slot) => {
          const level = heatLevel(v, max);
          const isSel = selected?.day === day && selected.slot === slot;
          return (
            <button key={`${day}-${slot}`} type="button" role="gridcell" aria-pressed={isSel} aria-label={cellLabel(day, slot, v)}
              onClick={() => onSelect({ day, slot })}
              onFocus={() => onSelect({ day, slot })}
              style={{
                height: 30, border: 'none', borderRadius: 4, padding: 0, cursor: 'pointer', minWidth: 0,
                background: `var(--viz-heat-${level})`,
                outline: isSel ? '2px solid var(--warm-text)' : 'none', outlineOffset: 1,
                fontSize: 10, fontWeight: 700, fontFamily: 'inherit',
                color: level >= 4 ? 'var(--viz-heat-ink-high)' : 'var(--viz-heat-ink-low)',
              }}>
              {showNumbers && v > 0 ? formatValue(v, language, 1) : ''}
            </button>
          );
        }),
      ])}
    </div>
  );
}

export function HeatScale({ less, more }: { less: string; more: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--warm-text-muted)' }}>
      <span>{less}</span>
      {[0, 1, 2, 3, 4, 5, 6].map((l) => (
        <span key={l} style={{ width: 14, height: 10, borderRadius: 3, background: `var(--viz-heat-${l})` }} />
      ))}
      <span>{more}</span>
    </div>
  );
}
