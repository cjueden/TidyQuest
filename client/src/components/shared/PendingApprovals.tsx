import { useState } from 'react';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { CoinIcon } from '../icons/UIIcons';

export interface PendingItem {
  id: number;
  displayName: string;
  taskName: string;
  translationKey?: string | null;
  roomName?: string;
  roomType?: string | null;
  completedAt: string;
  coinsEarned: number;
  note?: string | null;
  photoUrl?: string | null;
}

/**
 * Chores waiting for a parent (Strict Mode): tick several and approve or reject them together,
 * or handle one at a time. Shows the kid's note and photo when they added one.
 */
export function PendingApprovals({ items, language, onChanged, gamificationEnabled = true }: {
  items: PendingItem[];
  language?: string;
  onChanged: () => void | Promise<void>;
  gamificationEnabled?: boolean;
}) {
  const { t, taskName, roomDisplayName, timeAgo } = useTranslation(language);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const chosen = items.filter((i) => selected.has(i.id)).map((i) => i.id);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } finally {
      setSelected(new Set());
      setBusy(false);
      await onChanged();
    }
  };
  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)', cursor: 'pointer', marginRight: 'auto' }}>
          <input type="checkbox" checked={chosen.length === items.length} disabled={busy}
            onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
            style={{ width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
          {t('approvals.selectAll')}
        </label>
        {chosen.length > 0 ? (
          <>
            <button className="tq-btn tq-btn-primary tq-btn-sm" disabled={busy} onClick={() => run(() => api.approveCompletionsBatch(chosen))}>
              {t('approvals.approveSelected').replace('{n}', String(chosen.length))}
            </button>
            <button className="tq-btn tq-btn-sm" disabled={busy} onClick={() => run(() => api.rejectCompletionsBatch(chosen))}
              style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>
              {t('approvals.rejectSelected').replace('{n}', String(chosen.length))}
            </button>
          </>
        ) : (
          <button className="tq-btn tq-btn-primary tq-btn-sm" disabled={busy} onClick={() => run(() => api.approveCompletionsBatch(items.map((i) => i.id)))}>
            {t('approvals.approveAll').replace('{n}', String(items.length))}
          </button>
        )}
      </div>
      {items.map((p) => (
        <div key={p.id} style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 14,
          border: `1.5px solid ${selected.has(p.id) ? 'var(--warm-accent)' : 'var(--warm-border)'}`, backgroundColor: 'var(--warm-bg-subtle)',
        }}>
          <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} disabled={busy}
            aria-label={`${p.displayName}: ${taskName(p.taskName, p.translationKey)}`}
            style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--warm-accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>
              {p.displayName} · {taskName(p.taskName, p.translationKey)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {p.roomName && <span>{roomDisplayName(p.roomName, p.roomType || '')}</span>}
              <span>{timeAgo(p.completedAt)}</span>
              {gamificationEnabled && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--warm-accent)', fontWeight: 800 }}><CoinIcon />{p.coinsEarned}</span>}
            </div>
            {p.note && (
              <div style={{ fontSize: 12, color: 'var(--warm-text-secondary)', fontWeight: 600, marginTop: 4, overflowWrap: 'anywhere' }}>“{p.note}”</div>
            )}
            {p.photoUrl && (
              <a href={p.photoUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6 }}>
                <img src={p.photoUrl} alt={t('approvals.proofPhoto')} style={{ maxWidth: 160, maxHeight: 120, borderRadius: 10, border: '1px solid var(--warm-border)', objectFit: 'cover' }} />
              </a>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button className="tq-btn tq-btn-secondary tq-btn-sm" disabled={busy} onClick={() => run(() => api.approveCompletion(p.id))}>{t('settings.approve')}</button>
            <button className="tq-btn tq-btn-sm" disabled={busy} onClick={() => run(() => api.rejectPendingCompletion(p.id))}
              style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>
              {t('settings.reject')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
