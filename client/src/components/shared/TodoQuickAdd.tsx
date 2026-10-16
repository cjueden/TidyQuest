import { useState, type CSSProperties } from 'react';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * "+ To-do" on Home (parents): a one-time chore in a few taps, without opening a room. It goes into
 * the family's To-dos room; once done it disappears (it stays in Activity).
 */
export function TodoQuickAdd({ people, language, onAdded, onCancel }: {
  people: Array<{ id: number; displayName: string }>;
  language?: string;
  onAdded: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(language);
  const [name, setName] = useState('');
  const [who, setWho] = useState<number[]>([]);
  const [doBy, setDoBy] = useState('');
  const [coins, setCoins] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      await api.createTodo({ name: name.trim(), assignedUserIds: who, doBy: doBy || null, customCoins: coins.trim() ? Math.max(1, Math.round(Number(coins))) : null });
      onAdded(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setBusy(false);
    }
  };

  const chip = (on: boolean): CSSProperties => ({
    padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer',
    border: `1.5px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
    backgroundColor: on ? 'var(--warm-accent-light)' : 'var(--warm-bg-input)', color: on ? 'var(--warm-accent)' : 'var(--warm-text)',
  });
  const label: CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)', display: 'flex', alignItems: 'center', gap: 6 };
  return (
    <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 14, border: '1.5px dashed var(--warm-border)', marginBottom: 8 }}>
      <input className="tq-input" value={name} autoFocus maxLength={120} placeholder={t('todos.namePlaceholder')}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={label}>{t('todos.forWho')}</span>
        <button type="button" style={chip(who.length === 0)} onClick={() => setWho([])}>{t('todos.anyone')}</button>
        {people.map((p) => (
          <button type="button" key={p.id} style={chip(who.includes(p.id))}
            onClick={() => setWho((w) => (w.includes(p.id) ? w.filter((x) => x !== p.id) : [...w, p.id]))}>{p.displayName}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label style={label}>{t('todos.doBy')}<input type="date" className="tq-input-compact" value={doBy} onChange={(e) => setDoBy(e.target.value)} /></label>
        <label style={label}>{t('todos.coins')}<input type="number" min={1} className="tq-input-compact" value={coins} placeholder="—" onChange={(e) => setCoins(e.target.value)} style={{ width: 70 }} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={add} disabled={busy || !name.trim()}>{t('todos.create')}</button>
        <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={onCancel}>{t('common.cancel')}</button>
        {error && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</span>}
      </div>
    </div>
  );
}
