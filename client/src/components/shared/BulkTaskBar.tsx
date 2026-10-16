import { useState } from 'react';
import { api, type TaskBatchChanges } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';

type Field = '' | 'assign' | 'room' | 'effort' | 'coins' | 'every' | 'onDemand' | 'showInDashboard';

/**
 * The Tasks page's bulk edit bar: one change (who, room, effort, coins, how often, anytime, show on
 * Home) for every selected task, or delete them all (they go to the trash).
 */
export function BulkTaskBar({ ids, people, rooms, language, onApplied, onDeleted }: {
  ids: number[];
  people: Array<{ id: number; displayName: string }>;
  rooms: Array<{ id: number; name: string }>;
  language?: string;
  onApplied: (count: number) => void;
  onDeleted: (trashIds: number[]) => void;
}) {
  const { t } = useTranslation(language);
  const [field, setField] = useState<Field>('');
  const [who, setWho] = useState<number[]>([]);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (f: Field) => {
    setField(f); setError(''); setWho([]);
    setValue(f === 'room' ? String(rooms[0]?.id ?? '') : f === 'effort' ? '2' : f === 'every' ? '7' : f === 'onDemand' || f === 'showInDashboard' ? 'yes' : '');
  };

  const changes = (): TaskBatchChanges | null => {
    switch (field) {
      case 'assign': return { assignedUserIds: who };
      case 'room': return value ? { roomId: Number(value) } : null;
      case 'effort': return { effort: Number(value) };
      case 'coins': return { customCoins: value.trim() ? Math.max(1, Math.round(Number(value))) : null };
      case 'every': return Number(value) > 0 ? { frequencyDays: Number(value) } : null;
      case 'onDemand': return { onDemand: value === 'yes' };
      case 'showInDashboard': return { showInDashboard: value === 'yes' };
      default: return null;
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
    setBusy(false);
  };
  const apply = () => run(async () => {
    const c = changes();
    if (!c) return;
    const res = await api.batchUpdateTasks(ids, c);
    setField('');
    onApplied(res.updated);
  });
  const remove = () => {
    if (!window.confirm(ids.length === 1 ? t('bulk.deleteConfirmOne') : t('bulk.deleteConfirm').replace('{n}', String(ids.length)))) return;
    void run(async () => {
      const res = await api.batchDeleteTasks(ids);
      onDeleted(res.trashIds);
    });
  };

  const chip = (on: boolean) => ({
    padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer',
    border: `1.5px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
    backgroundColor: on ? 'var(--warm-accent-light)' : 'var(--warm-bg-input)', color: on ? 'var(--warm-accent)' : 'var(--warm-text)',
  });
  const yesNo = (
    <select className="tq-input-compact" value={value} onChange={(e) => setValue(e.target.value)}>
      <option value="yes">{t('bulk.yes')}</option>
      <option value="no">{t('bulk.no')}</option>
    </select>
  );

  return (
    <div className="tq-card" style={{
      position: 'sticky', bottom: 'calc(12px + env(safe-area-inset-bottom))', zIndex: 5, padding: 12,
      display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.18)', border: '1.5px solid var(--warm-accent)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--warm-text)', marginRight: 'auto' }}>{t('bulk.selected').replace('{n}', String(ids.length))}</span>
        <select className="tq-input-compact" value={field} onChange={(e) => pick(e.target.value as Field)} aria-label={t('bulk.change')}>
          <option value="">{t('bulk.change')}</option>
          <option value="assign">{t('bulk.assign')}</option>
          <option value="room">{t('bulk.room')}</option>
          <option value="effort">{t('roomDetail.effort')}</option>
          <option value="coins">{t('roomDetail.customCoins')}</option>
          <option value="every">{t('bulk.every')}</option>
          <option value="onDemand">{t('roomDetail.onDemand')}</option>
          <option value="showInDashboard">{t('roomDetail.showInDashboard')}</option>
        </select>
        <button className="tq-btn tq-btn-sm" onClick={remove} disabled={busy}
          style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>
          {t('common.delete')}
        </button>
      </div>
      {field && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {field === 'assign' && (
            <>
              <button type="button" style={chip(who.length === 0)} onClick={() => setWho([])}>{t('taskList.openToAnyone')}</button>
              {people.map((p) => (
                <button type="button" key={p.id} style={chip(who.includes(p.id))}
                  onClick={() => setWho((w) => (w.includes(p.id) ? w.filter((x) => x !== p.id) : [...w, p.id]))}>{p.displayName}</button>
              ))}
            </>
          )}
          {field === 'room' && (
            <select className="tq-input-compact" value={value} onChange={(e) => setValue(e.target.value)} style={{ minWidth: 0, maxWidth: '100%' }}>
              {rooms.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
            </select>
          )}
          {field === 'effort' && (
            <select className="tq-input-compact" value={value} onChange={(e) => setValue(e.target.value)}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>{'★'.repeat(n)}</option>)}
            </select>
          )}
          {field === 'coins' && (
            <input type="number" min={1} className="tq-input-compact" value={value} placeholder={t('bulk.coinsDefault')}
              onChange={(e) => setValue(e.target.value)} style={{ width: 130 }} />
          )}
          {field === 'every' && (
            <input type="number" min={1} step="any" className="tq-input-compact" value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 80 }} />
          )}
          {(field === 'onDemand' || field === 'showInDashboard') && yesNo}
          <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={apply} disabled={busy || !changes()}>{t('bulk.apply')}</button>
        </div>
      )}
      {error && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</div>}
    </div>
  );
}
