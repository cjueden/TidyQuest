import type { TaskFilter } from '../../hooks/useTaskView';

/** The All / Mine pill switch (hidden entirely when the person's view is locked to Mine). */
export function AllMineToggle({ value, onChange, allLabel, mineLabel }: { value: TaskFilter; onChange: (f: TaskFilter) => void; allLabel: string; mineLabel: string }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderRadius: 99, overflow: 'hidden', border: '1.5px solid var(--warm-border)', flexShrink: 0 }}>
      {(['all', 'mine'] as const).map((f) => (
        <button key={f} onClick={() => onChange(f)} aria-pressed={value === f}
          style={{
            padding: '4px 12px', fontSize: 11, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer',
            border: 'none', background: value === f ? 'var(--warm-accent)' : 'var(--warm-bg-subtle)',
            color: value === f ? '#fff' : 'var(--warm-text-light)',
            transition: 'all 0.15s ease',
          }}>
          {f === 'all' ? allLabel : mineLabel}
        </button>
      ))}
    </div>
  );
}
