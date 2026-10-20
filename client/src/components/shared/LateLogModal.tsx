import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { lateDayLabel, lateDays } from '../../utils/lateLog';

type Result = Awaited<ReturnType<typeof api.completeTask>>;

const ERRORS: Record<string, string> = {
  already_done_that_day: 'late.errAlreadyDone',
  already_done_by_other: 'late.errDoneByOther',
  not_yet_due: 'late.errNotDue',
  before_start: 'late.errBeforeStart',
  repeat_limit_reached: 'repeat.limitReached',
  not_assigned: 'app.notAssigned',
};

/**
 * "Done earlier…" (ENH-7): log a chore for a day in the past week. It counts on that day (streaks,
 * goals, the Board, the Calendar) and pays the chore's usual coins, without double coins or the Rescue
 * Mission. Anyone but a parent waits for a parent's approval.
 */
export function LateLogModal({ task, people, currentUserId, isParent, language, onClose, onLogged }: {
  task: { id: number; title: string };
  /** Who can be credited, for admins and members (the viewer first); empty when it's only the viewer */
  people: Array<{ id: number; displayName: string }>;
  currentUserId?: number;
  /** A parent's own late logs go straight through */
  isParent: boolean;
  language?: string;
  onClose: () => void;
  onLogged: (result: Result) => void;
}) {
  const { t } = useTranslation(language);
  const days = lateDays();
  const [day, setDay] = useState(days[0]);
  const [who, setWho] = useState<number | undefined>(currentUserId);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const forOther = who !== undefined && who !== currentUserId;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.completeTask(task.id, forOther ? who : undefined, { doneOn: day, ...(note.trim() ? { note: note.trim() } : {}) });
      setDone(result);
      onLogged(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(ERRORS[msg] ? t(ERRORS[msg]) : msg || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const label = { fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)' } as const;
  return createPortal(
    <div className="tq-modal-overlay task-edit-overlay" onClick={onClose}>
      <div className="tq-card tq-modal task-edit-sheet tq-card-padded" role="dialog" aria-modal="true" aria-labelledby="late-log-title"
        onClick={(e) => e.stopPropagation()} style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div id="late-log-title" style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)' }}>📅 {t('late.title')}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warm-text-muted)', marginTop: 2 }}>{task.title}</div>
        </div>
        {done ? (
          <>
            <p role="status" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>
              ✅ {t(done.pendingApproval ? 'late.sentForApproval' : 'late.logged').replace('{date}', lateDayLabel(day, language))}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="tq-btn tq-btn-primary tq-btn-md" onClick={onClose} autoFocus>{t('common.close')}</button>
            </div>
          </>
        ) : (
          <>
            <div role="group" aria-label={t('late.whichDay')} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={label}>{t('late.whichDay')}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {days.map((d, i) => (
                  <button key={d} type="button" aria-pressed={d === day} onClick={() => setDay(d)}
                    className={d === day ? 'tq-btn tq-btn-primary tq-btn-sm' : 'tq-btn tq-btn-secondary tq-btn-sm'}>
                    {i === 0 ? t('late.yesterday') : lateDayLabel(d, language)}
                  </button>
                ))}
              </div>
            </div>
            {people.length > 1 && (
              <label style={{ ...label, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {t('late.who')}
                <select className="tq-input" value={who ?? ''} onChange={(e) => setWho(Number(e.target.value))}>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                </select>
              </label>
            )}
            <label style={{ ...label, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {t('proof.note')}
              <textarea className="tq-input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={t('proof.notePlaceholder')} style={{ resize: 'vertical', fontSize: 15 }} />
            </label>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--warm-text-muted)' }}>{t(isParent ? 'late.hintParent' : 'late.hintKid')}</p>
            {error && <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--health-red)' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="tq-btn tq-btn-secondary tq-btn-md" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
              <button className="tq-btn tq-btn-primary tq-btn-md" disabled={busy} onClick={submit}>{t('late.submit')}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
