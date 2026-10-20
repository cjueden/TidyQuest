/** A row of pill buttons, one pressed (the page's filter style). */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', borderRadius: 99, overflow: 'hidden', border: '1.5px solid var(--warm-border)', minWidth: 0 }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          style={{
            flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer', border: 'none',
            whiteSpace: 'nowrap', background: value === o.value ? 'var(--warm-accent)' : 'var(--warm-bg-subtle)',
            color: value === o.value ? '#fff' : 'var(--warm-text-light)',
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
