import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type TeamUpInfo, type TeamupItem } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';

/** The 🤝 button on a chore that can be done as a team */
export function TeamUpButton({ info, onClick, language }: { info?: TeamUpInfo | null; onClick: () => void; language?: string }) {
  const { t } = useTranslation(language);
  if (!info?.canStart) return null;
  return (
    <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" title={t('teamups.teamUp')} aria-label={t('teamups.teamUp')}
      onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ padding: '6px 10px' }}>🤝</button>
  );
}

/** Pick a partner (or anyone) for a chore */
export function TeamUpDialog({ task, people, onClose, onStarted, language }: {
  task: { id: number; name: string };
  /** Who could join: everyone but you, or the chore's assignees */
  people: Array<{ id: number; displayName: string }>;
  onClose: () => void;
  onStarted: () => void;
  language?: string;
}) {
  const { t } = useTranslation(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = async (partnerId: number | null) => {
    setBusy(true); setError('');
    try { await api.startTeamup(task.id, partnerId); onStarted(); onClose(); } catch (err) {
      const key = `teamups.error_${err instanceof Error ? err.message : ''}`;
      setError(t(key) === key ? t('common.error') : t(key));
    } finally { setBusy(false); }
  };
  return createPortal(
    <div className="tq-modal-overlay task-edit-overlay" onClick={onClose}>
      <div className="tq-card tq-modal task-edit-sheet tq-card-padded" role="dialog" aria-modal="true" aria-label={t('teamups.teamUp')} onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)' }}>🤝 {t('teamups.pickPartner')}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warm-text-muted)', marginTop: 2 }}>{task.name}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)', marginTop: 4 }}>{t('teamups.how')}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {people.map((p) => (
            <button key={p.id} type="button" className="tq-btn tq-btn-secondary tq-btn-sm" disabled={busy} onClick={() => void start(p.id)}>{p.displayName}</button>
          ))}
          <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" disabled={busy} onClick={() => void start(null)}>{t('teamups.anyone')}</button>
        </div>
        {error && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</div>}
        <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onClose}>{t('common.cancel')}</button>
      </div>
    </div>,
    document.body,
  );
}

/** Home: team-ups you're on (Done together, leave) and invites you can join */
export function TeamUpsCard({ items, userId, onDone, onChanged, language }: {
  items: TeamupItem[]; userId: number; onDone: (taskId: number) => void; onChanged: () => void; language?: string;
}) {
  const { t } = useTranslation(language);
  const [busy, setBusy] = useState(false);
  if (items.length === 0) return null;
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } catch { /* the list refreshes */ } finally { setBusy(false); onChanged(); } };
  return (
    <div className="tq-card tq-card-padded" style={{ gridColumn: '1 / -1', display: 'grid', gap: 10, borderColor: 'var(--warm-accent)' }}>
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: 0 }}>🤝 {t('teamups.title')}</h3>
      {items.map((x) => {
        const starter = x.members.find((m) => m.id === x.createdBy)?.displayName ?? '';
        const names = x.members.map((m) => `${m.displayName}${m.helper ? ` (${t('teamups.helper')})` : ''}`).join(' + ');
        const ready = x.members.length >= 2;
        const line = x.mine
          ? (ready ? t('teamups.team').replace('{names}', names) : t('teamups.waiting'))
          : t(x.invitedUserId === userId ? 'teamups.wantsHelp' : 'teamups.lookingFor').replace('{name}', starter);
        return (
          <div key={x.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 14, background: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)' }}>
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{x.taskName}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                {line}{x.share != null && x.share > 0 ? ` · ${t('teamups.share').replace('{n}', String(x.share))}` : ''}
              </div>
            </div>
            {x.canJoin && <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" disabled={busy} onClick={() => void act(() => api.joinTeamup(x.id))}>{t('teamups.join')}</button>}
            {x.mine && ready && <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" disabled={busy} onClick={() => onDone(x.taskId)}>{t('teamups.done')}</button>}
            {x.mine && (
              <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" disabled={busy} onClick={() => void act(() => api.leaveTeamup(x.id))}>
                {t(x.createdBy === userId ? 'teamups.cancel' : 'teamups.leave')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
