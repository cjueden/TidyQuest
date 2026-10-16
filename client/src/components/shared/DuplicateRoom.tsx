import { useState } from 'react';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * Copy a room with its tasks (settings and assignees, no history), e.g. one kid's quest room for the
 * other. Choosing a new owner hands the old owner's tasks to them.
 */
export function DuplicateRoom({ room, displayName, users, language, onDone, onCancel }: {
  room: { id: number; assignedUserId?: number | null };
  displayName: string;
  users: Array<{ id: number; displayName: string }>;
  language?: string;
  onDone: (newRoomId: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(language);
  const [name, setName] = useState(t('duplicateRoom.copyName').replace('{name}', displayName));
  // 'same' keeps the owner, '' clears it, otherwise a user id
  const [owner, setOwner] = useState<string>('same');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      const created = await api.duplicateRoom(room.id, {
        name: name.trim(),
        ...(owner === 'same' ? {} : { ownerUserId: owner ? Number(owner) : null }),
      });
      onDone(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setBusy(false);
    }
  };

  const label = { fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' };
  return (
    <div className="tq-card tq-card-padded" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--warm-text)' }}>{t('duplicateRoom.title')}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-muted)' }}>{t('duplicateRoom.desc')}</div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={label}>{t('roomDetail.name')}</span>
        <input className="tq-input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {room.assignedUserId != null && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>{t('duplicateRoom.owner')}</span>
          <select className="tq-input" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="same">{t('duplicateRoom.sameOwner').replace('{name}', users.find((u) => u.id === room.assignedUserId)?.displayName ?? '?')}</option>
            {users.filter((u) => u.id !== room.assignedUserId).map((u) => <option key={u.id} value={String(u.id)}>{u.displayName}</option>)}
            <option value="">{t('duplicateRoom.noOwner')}</option>
          </select>
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={create} disabled={busy || !name.trim()}>{t('duplicateRoom.create')}</button>
        <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={onCancel}>{t('common.cancel')}</button>
        {error && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</span>}
      </div>
    </div>
  );
}
