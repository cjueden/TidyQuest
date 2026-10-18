import { useState } from 'react';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';

/** Next to "Waiting for approval": undo a Done tapped by mistake before a parent decides */
export function TakeBackButton({ completionId, onDone, language }: { completionId?: number | null; onDone: () => void; language?: string }) {
  const { t } = useTranslation(language);
  const [busy, setBusy] = useState(false);
  if (!completionId) return null;
  const takeBack = async () => {
    setBusy(true);
    try {
      await api.cancelCompletion(completionId);
      onDone();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" disabled={busy} title={t('app.takeBackHint')}
      onClick={(e) => { e.stopPropagation(); void takeBack(); }} style={{ padding: '6px 10px', fontSize: 11 }}>
      ↩ {t('app.takeBack')}
    </button>
  );
}
