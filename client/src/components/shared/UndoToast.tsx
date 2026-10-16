import { useEffect, useState } from 'react';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';

export interface UndoState {
  /** Trash ids to restore (one per deleted item) */
  trashIds: number[];
  message: string;
}

/**
 * "Deleted "Dishes" · Undo" after something went to the trash. Undo restores it; the toast goes away
 * on its own after a few seconds (the item stays in Settings → Recently deleted).
 */
export function UndoToast({ undo, language, onClose, onRestored }: {
  undo: UndoState | null;
  language?: string;
  onClose: () => void;
  onRestored: () => void | Promise<void>;
}) {
  const { t } = useTranslation(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!undo) return;
    setError('');
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [undo, onClose]);

  if (!undo) return null;
  const restore = async () => {
    setBusy(true);
    try {
      for (const id of undo.trashIds) await api.restoreTrash(id);
      onClose();
      await onRestored();
    } catch (err) {
      setError(err instanceof Error && 'body' in err ? ((err as { body?: { message?: string } }).body?.message ?? err.message) : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" style={{
      position: 'fixed', left: '50%', bottom: 'calc(20px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)',
      zIndex: 9998, width: 'max-content', maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px 10px 16px', borderRadius: 14,
      backgroundColor: 'var(--warm-text)', color: 'var(--warm-card)', boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
      fontFamily: 'Nunito', fontSize: 14, fontWeight: 700,
    }}>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{error || undo.message}</span>
      <button onClick={restore} disabled={busy} style={{
        border: 'none', background: 'none', color: 'var(--warm-accent-light)', fontFamily: 'Nunito', fontWeight: 900,
        fontSize: 14, cursor: 'pointer', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.03em',
      }}>{t('trash.undo')}</button>
      <button onClick={onClose} aria-label={t('common.close')} style={{
        border: 'none', background: 'none', color: 'inherit', opacity: 0.7, fontSize: 18, cursor: 'pointer', padding: '0 4px',
      }}>×</button>
    </div>
  );
}
