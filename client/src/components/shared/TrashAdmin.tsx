import { useEffect, useState } from 'react';
import { api, type TrashItem } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { localeFor } from '../../utils/locale';

/**
 * Settings → Recently deleted: tasks and rewards kept for 30 days. Restore puts them back with their
 * history; a task whose room is gone asks for another room first.
 */
export function TrashAdmin({ rooms, language, reloadKey, onRestored }: {
  rooms: Array<{ id: number; name: string }>;
  language?: string;
  /** Changes whenever something was just deleted elsewhere on the page */
  reloadKey?: number;
  onRestored?: () => void;
}) {
  const { t } = useTranslation(language);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [keepDays, setKeepDays] = useState(30);
  const [roomFor, setRoomFor] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  const load = () => api.getTrash().then((data) => { setItems(data.items); setKeepDays(data.keepDays); }).catch(() => setItems([]));
  useEffect(() => { void load(); }, [reloadKey]);

  const restore = async (item: TrashItem) => {
    setError('');
    const needsRoom = item.kind === 'task' && item.roomExists === false;
    const roomId = needsRoom ? Number(roomFor[item.id] || rooms[0]?.id) : undefined;
    try {
      await api.restoreTrash(item.id, roomId);
      await load();
      onRestored?.();
    } catch (err) {
      setError(err instanceof Error ? ((err as { body?: { message?: string } }).body?.message ?? err.message) : t('common.error'));
    }
  };
  const forget = async (item: TrashItem) => {
    if (!window.confirm(t('trash.deleteForeverConfirm').replace('{name}', item.title))) return;
    await api.deleteTrash(item.id);
    await load();
  };

  const when = (iso: string) => new Date(iso).toLocaleDateString(localeFor(language), { month: 'short', day: 'numeric' });
  const shown = showAll ? items : items.slice(0, 8);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, marginBottom: 4 }}>{t('trash.desc').replace('{n}', String(keepDays))}</div>
      {items.length === 0 && <div style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('trash.empty')}</div>}
      {shown.map((item) => {
        const needsRoom = item.kind === 'task' && item.roomExists === false;
        return (
          <div key={item.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--warm-border)', backgroundColor: 'var(--warm-bg-subtle)' }}>
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>
                {item.kind === 'task' ? '🧹' : '🎁'} {item.title}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)' }}>
                {[
                  item.kind === 'task' ? item.roomName : t('trash.reward'),
                  `${when(item.deletedAt)}${item.deletedByName ? ` · ${item.deletedByName}` : ''}`,
                  item.historyCount ? t('trash.history').replace('{n}', String(item.historyCount)) : '',
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
            {needsRoom && (
              <select className="tq-input-compact" value={roomFor[item.id] ?? String(rooms[0]?.id ?? '')} aria-label={t('trash.restoreInto')} title={t('trash.roomGone')}
                onChange={(e) => setRoomFor((m) => ({ ...m, [item.id]: e.target.value }))} style={{ maxWidth: '100%', minWidth: 0 }}>
                {rooms.map((r) => <option key={r.id} value={String(r.id)}>{t('trash.restoreIntoRoom').replace('{room}', r.name)}</option>)}
              </select>
            )}
            <button className="tq-btn tq-btn-sm tq-btn-secondary" onClick={() => restore(item)} disabled={needsRoom && rooms.length === 0}>{t('trash.restore')}</button>
            <button className="tq-btn tq-btn-sm" onClick={() => forget(item)} aria-label={t('trash.deleteForever')} title={t('trash.deleteForever')}
              style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>×</button>
          </div>
        );
      })}
      {items.length > 8 && (
        <button className="tq-btn tq-btn-sm tq-btn-secondary" onClick={() => setShowAll((v) => !v)} style={{ justifySelf: 'start' }}>
          {showAll ? t('common.showLess') : t('common.showMore')}
        </button>
      )}
      {error && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</div>}
    </div>
  );
}
