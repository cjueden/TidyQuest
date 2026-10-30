import { useState } from 'react';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { limitError } from '../../utils/hosted';

export interface PhotoProblem {
  completionId: number;
  file: File;
  /** The limit it hit (too big, the family's photo space is full), or '' when unknown */
  why: string;
  /** Sending the same photo again: only while the chore waits for approval, and not after a limit */
  canRetry: boolean;
}

/**
 * "The chore was recorded, but its photo didn't upload." after Done. Unlike the other toasts it stays until
 * closed, so the parent who later finds no photo isn't the first to know. Give it key={completionId}.
 */
export function PhotoFailedNote({ problem, language, onClose }: {
  problem: PhotoProblem;
  language?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(language);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [retryWhy, setRetryWhy] = useState<string | null>(null);
  const why = retryWhy ?? problem.why;

  const retry = async () => {
    setBusy(true);
    try {
      await api.uploadCompletionPhoto(problem.completionId, problem.file);
      setUploaded(true);
      setTimeout(onClose, 3500);
    } catch (err) {
      setRetryWhy(limitError(err, t, ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role={uploaded ? 'status' : 'alert'} style={{
      position: 'fixed', left: '50%', bottom: 'calc(20px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)',
      zIndex: 9998, width: 'max-content', maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px 10px 16px', borderRadius: 14,
      backgroundColor: 'var(--warm-text)', color: 'var(--warm-card)', boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
      fontFamily: 'Nunito', fontSize: 14, fontWeight: 700,
    }}>
      <span style={{ flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>
        {uploaded ? t('proof.photoUploaded') : why ? `${t('proof.photoFailed')} ${why}` : t('proof.photoFailed')}
      </span>
      {!uploaded && problem.canRetry && !retryWhy && (
        <button onClick={retry} disabled={busy} style={{
          border: 'none', background: 'none', color: 'var(--warm-accent-light)', fontFamily: 'Nunito', fontWeight: 900,
          fontSize: 14, cursor: busy ? 'wait' : 'pointer', padding: '4px 6px', opacity: busy ? 0.6 : 1,
        }}>{t('proof.tryAgain')}</button>
      )}
      <button onClick={onClose} aria-label={t('common.close')} style={{
        border: 'none', background: 'none', color: 'inherit', opacity: 0.7, fontSize: 18, cursor: 'pointer', padding: '0 4px',
      }}>×</button>
    </div>
  );
}
