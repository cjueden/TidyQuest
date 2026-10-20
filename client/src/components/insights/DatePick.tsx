interface Props {
  /** 'YYYY-MM-DD' */
  value: string;
  min?: string;
  max: string;
  /** For screen readers, e.g. "Pick a date" */
  label: string;
  /** What's showing, e.g. "Oct 19 – Oct 25" */
  text: string;
  onChange: (day: string) => void;
}

/**
 * The period's name, which opens the browser's date picker (the phone's own calendar). The period holding the
 * picked day is shown. The date input lies invisibly over the name, so a tap anywhere on it opens the picker.
 */
export function DatePick({ value, min, max, label, text, onChange }: Props) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', borderRadius: 8, padding: '2px 6px' }}>
      <span aria-hidden="true" style={{ fontWeight: 800, fontSize: 14, color: 'var(--warm-text)' }}>
        📅 {text} <span style={{ color: 'var(--warm-text-muted)', fontSize: 11 }}>▾</span>
      </span>
      <input type="date" aria-label={`${label}: ${text}`} value={value} min={min} max={max}
        onChange={(e) => { const v = e.target.value; if (v) onChange(v > max ? max : v); }}
        onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* browsers without showPicker open it on tap */ } }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 0, padding: 0, margin: 0 }} />
    </div>
  );
}
