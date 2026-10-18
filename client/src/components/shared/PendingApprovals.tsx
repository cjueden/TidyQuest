import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
 * A rejection waits 5 seconds behind a "Rejected · Undo" toast before it's sent, and can carry a
 * one-line reason for the kid.
 */
const BONUSES = [0, 1, 2, 5];
const REJECT_UNDO_MS = 5000;

/** A rejection that hasn't been sent yet */
interface HeldReject { ids: number[]; message: string }

export function PendingApprovals({ items, language, onChanged, gamificationEnabled = true, extras = false }: {
  items: PendingItem[];
  language?: string;
  onChanged: () => void | Promise<void>;
  gamificationEnabled?: boolean;
  /** A note and an "above and beyond" bonus when approving one chore (Cheers) */
  extras?: boolean;
}) {
  const { t, taskName, roomDisplayName, timeAgo } = useTranslation(language);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  // Rejected rows stay hidden while their toast is up and until the list reloads
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const visible = items.filter((i) => !hidden.has(i.id));
  const chosen = visible.filter((i) => selected.has(i.id)).map((i) => i.id);
  const [held, setHeld] = useState<HeldReject | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const onChangedRef = useRef(onChanged);
  const latest = useRef<{ held: HeldReject | null; reason: string }>({ held: null, reason: '' });
  useEffect(() => {
    onChangedRef.current = onChanged;
    latest.current = { held, reason };
  });

  const sendReject = useCallback(async (h: HeldReject, why: string) => {
    const r = why.trim() || undefined;
    try {
      if (h.ids.length === 1) await api.rejectPendingCompletion(h.ids[0], r);
      else await api.rejectCompletionsBatch(h.ids, r);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    }
    await onChangedRef.current();
  }, []);
  const unhide = (ids: number[]) => setHidden((prev) => {
    const next = new Set(prev);
    for (const id of ids) next.delete(id);
    return next;
  });
  const finishReject = useCallback(async (h: HeldReject, why: string) => {
    setHeld((cur) => (cur === h ? null : cur));
    await sendReject(h, why);
    unhide(h.ids);
  }, [sendReject]);
  const reject = (ids: number[], message: string) => {
    if (held) void finishReject(held, reason); // an earlier one goes now
    setHidden((prev) => new Set([...prev, ...ids]));
    setSelected(new Set());
    setReason('');
    setReasonOpen(false);
    setHeld({ ids, message });
  };
  const undoReject = () => {
    if (!held) return;
    unhide(held.ids);
    setHeld(null);
  };
  // Sent once the toast has been up for 5 seconds (not while a reason is being typed)
  useEffect(() => {
    if (!held || reasonOpen) return;
    const timer = setTimeout(() => void finishReject(held, ''), REJECT_UNDO_MS);
    return () => clearTimeout(timer);
  }, [held, reasonOpen, finishReject]);
  // Leaving the page doesn't cancel a rejection: it's sent straight away
  useEffect(() => () => {
    const { held: h, reason: r } = latest.current;
    if (h) void sendReject(h, r);
  }, [sendReject]);
  // The row whose note-and-bonus box is open
  const [extraFor, setExtraFor] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [bonus, setBonus] = useState(0);
  const openExtra = (id: number) => { setExtraFor(extraFor === id ? null : id); setNote(''); setBonus(0); };

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

  if (visible.length === 0 && !held) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {held && createPortal(
        <div role="status" style={{
          position: 'fixed', left: '50%', bottom: 'calc(20px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)',
          zIndex: 9998, width: 'max-content', maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px 10px 16px', borderRadius: 14,
          backgroundColor: 'var(--warm-text)', color: 'var(--warm-card)', boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
          fontFamily: 'Nunito', fontSize: 14, fontWeight: 700,
        }}>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{held.message}</span>
          <button type="button" onClick={undoReject} style={toastLink}>{t('trash.undo')}</button>
          {!reasonOpen && (
            <button type="button" onClick={() => setReasonOpen(true)} style={{ ...toastLink, textTransform: 'none', fontWeight: 800 }}>💬 {t('approvals.addReason')}</button>
          )}
          <button type="button" onClick={() => void finishReject(held, reason)} aria-label={t('common.close')} style={{
            border: 'none', background: 'none', color: 'inherit', opacity: 0.7, fontSize: 18, cursor: 'pointer', padding: '0 4px',
          }}>×</button>
          {reasonOpen && (
            <form onSubmit={(e) => { e.preventDefault(); void finishReject(held, reason); }} style={{ display: 'flex', gap: 6, flexBasis: '100%', minWidth: 0 }}>
              <input autoFocus className="tq-input-compact" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)}
                placeholder={t('approvals.reasonPlaceholder')} aria-label={t('approvals.addReason')} style={{ flex: '1 1 160px', minWidth: 0 }} />
              <button type="submit" className="tq-btn tq-btn-primary tq-btn-sm">{t('approvals.sendReason')}</button>
            </form>
          )}
        </div>,
        document.body,
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)', cursor: 'pointer', marginRight: 'auto' }}>
          <input type="checkbox" checked={visible.length > 0 && chosen.length === visible.length} disabled={busy}
            onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((i) => i.id)) : new Set())}
            style={{ width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
          {t('approvals.selectAll')}
        </label>
        {chosen.length > 0 ? (
          <>
            <button className="tq-btn tq-btn-primary tq-btn-sm" disabled={busy} onClick={() => run(() => api.approveCompletionsBatch(chosen))}>
              {t('approvals.approveSelected').replace('{n}', String(chosen.length))}
            </button>
            <button className="tq-btn tq-btn-sm" disabled={busy} onClick={() => reject(chosen, t('approvals.rejectedMany').replace('{n}', String(chosen.length)))}
              style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>
              {t('approvals.rejectSelected').replace('{n}', String(chosen.length))}
            </button>
          </>
        ) : (
          <button className="tq-btn tq-btn-primary tq-btn-sm" disabled={busy} onClick={() => run(() => api.approveCompletionsBatch(visible.map((i) => i.id)))}>
            {t('approvals.approveAll').replace('{n}', String(visible.length))}
          </button>
        )}
      </div>
      {visible.map((p) => (
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
            {extras && extraFor === p.id && (
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                <input className="tq-input-compact" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t('cheers.notePlaceholder')} style={{ minWidth: 0 }} />
                {gamificationEnabled && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', fontSize: 11, fontWeight: 800, color: 'var(--warm-text-muted)' }}>
                    {t('cheers.bonus')}
                    {BONUSES.map((b) => (
                      <button key={b} type="button" onClick={() => setBonus(b)} style={{
                        padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 800, fontFamily: 'Nunito', cursor: 'pointer',
                        border: `1.5px solid ${bonus === b ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                        backgroundColor: bonus === b ? 'var(--warm-accent-light)' : 'var(--warm-card)', color: bonus === b ? 'var(--warm-accent)' : 'var(--warm-text)',
                      }}>{b === 0 ? t('cheers.none') : `+${b}`}</button>
                    ))}
                  </div>
                )}
                <button className="tq-btn tq-btn-primary tq-btn-sm" disabled={busy} style={{ justifySelf: 'start' }}
                  onClick={() => run(async () => { await api.approveCompletion(p.id, { note: note.trim() || undefined, bonus: bonus || undefined }); setExtraFor(null); })}>
                  {t('settings.approve')}{bonus ? ` ⭐ +${bonus}` : ''}
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button className="tq-btn tq-btn-secondary tq-btn-sm" disabled={busy} onClick={() => run(() => api.approveCompletion(p.id))}>{t('settings.approve')}</button>
            {extras && (
              <button className="tq-btn tq-btn-secondary tq-btn-sm" disabled={busy} aria-expanded={extraFor === p.id} onClick={() => openExtra(p.id)}
                title={t('cheers.extra')} aria-label={t('cheers.extra')}>⭐ 💬</button>
            )}
            <button className="tq-btn tq-btn-sm" disabled={busy} onClick={() => reject([p.id], t('approvals.rejectedOne').replace('{what}', `${p.displayName} · ${taskName(p.taskName, p.translationKey)}`))}
              style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>
              {t('settings.reject')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const toastLink: React.CSSProperties = {
  border: 'none', background: 'none', color: 'var(--warm-accent-light)', fontFamily: 'Nunito', fontWeight: 900,
  fontSize: 14, cursor: 'pointer', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.03em',
};
