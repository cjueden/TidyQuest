import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../hooks/useTranslation';

export interface Proof {
  note?: string;
  file?: File | null;
}

/** Finish a chore with an optional note and photo for the parent who approves it. */
export function ProofModal({ taskTitle, language, photos = true, onClose, onSubmit }: {
  taskTitle: string;
  language?: string;
  /** Settings → Features → Proof photos (off: a note only) */
  photos?: boolean;
  onClose: () => void;
  onSubmit: (proof: Proof) => void | Promise<void>;
}) {
  const { t } = useTranslation(language);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return createPortal(
    <div className="tq-modal-overlay task-edit-overlay" onClick={onClose}>
      <div className="tq-card tq-modal task-edit-sheet tq-card-padded" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)' }}>{t(photos ? 'proof.title' : 'proof.titleNote')}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warm-text-muted)', marginTop: 2 }}>{taskTitle}</div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)' }}>
          {t('proof.note')}
          <textarea className="tq-input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={t('proof.notePlaceholder')} style={{ resize: 'vertical', fontSize: 15 }} />
        </label>
        {photos && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)' }}>
            {t('proof.photo')}
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
        {preview && <img src={preview} alt="" style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--warm-border)' }} />}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="tq-btn tq-btn-secondary tq-btn-md" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button className="tq-btn tq-btn-primary tq-btn-md" disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await onSubmit({ note: note.trim() || undefined, file }); } finally { setBusy(false); }
            }}>
            {t('proof.submit')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
