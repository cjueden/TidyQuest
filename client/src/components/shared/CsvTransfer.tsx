import { useState } from 'react';
import { api, type CsvImportResult, type CsvKind } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * Settings → Spreadsheets: download tasks or rewards as CSV, edit them in any spreadsheet app, and
 * load the file back. An import is always shown first (what it adds, changes and can't read) and only
 * saved after "Apply". Nothing is ever deleted by an import.
 */
export function CsvTransfer({ language, onImported }: { language?: string; onImported?: () => void }) {
  const { t } = useTranslation(language);
  const [kind, setKind] = useState<CsvKind>('tasks');
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<CsvImportResult | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const download = async (k: CsvKind) => {
    setError('');
    try {
      const blob = await api.exportCsv(k);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tidyquest-${k}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(t('common.error'));
    }
  };

  const errorText = (err: unknown) => (err instanceof Error ? ((err as { body?: { message?: string } }).body?.message ?? err.message) : t('common.error'));

  const choose = async (file: File | undefined, k: CsvKind) => {
    setPreview(null); setMessage(''); setError('');
    if (!file) return;
    const text = await file.text();
    setFileName(file.name); setCsv(text); setKind(k);
    setBusy(true);
    try { setPreview(await api.importCsv(k, text, true)); } catch (err) { setError(errorText(err)); }
    setBusy(false);
  };

  const apply = async () => {
    setBusy(true); setError('');
    try {
      const res = await api.importCsv(kind, csv, false);
      setPreview(null); setCsv('');
      setMessage(t('csv.applied').replace('{add}', String(res.summary.add)).replace('{update}', String(res.summary.update)));
      onImported?.();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  const pending = preview ? preview.summary.add + preview.summary.update : 0;
  const rowName = (r: CsvImportResult['rows'][number]) => (kind === 'tasks' ? `${r.room} › ${r.task}` : r.title);
  const badge = (text: string, color: string) => (
    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 800, color, border: `1.5px solid ${color}` }}>{text}</span>
  );
  const fileButton = (k: CsvKind, label: string) => (
    <label className="tq-btn tq-btn-sm tq-btn-secondary" style={{ cursor: 'pointer' }}>
      {label}
      <input type="file" accept=".csv,text/csv" style={{ display: 'none' }}
        onChange={(e) => { void choose(e.target.files?.[0], k); e.target.value = ''; }} />
    </label>
  );

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('csv.desc')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button className="tq-btn tq-btn-sm" onClick={() => download('tasks')}>⬇ {t('csv.exportTasks')}</button>
        <button className="tq-btn tq-btn-sm" onClick={() => download('rewards')}>⬇ {t('csv.exportRewards')}</button>
        {fileButton('tasks', `⬆ ${t('csv.importTasks')}`)}
        {fileButton('rewards', `⬆ ${t('csv.importRewards')}`)}
      </div>
      {busy && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('common.loading')}</div>}
      {preview && (
        <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 12, border: '1.5px dashed var(--warm-border)' }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{t('csv.previewOf').replace('{file}', fileName)}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {badge(t('csv.add').replace('{n}', String(preview.summary.add)), 'var(--health-green)')}
            {badge(t('csv.update').replace('{n}', String(preview.summary.update)), 'var(--warm-accent)')}
            {badge(t('csv.unchanged').replace('{n}', String(preview.summary.unchanged)), 'var(--warm-text-light)')}
            {preview.summary.error > 0 && badge(t('csv.errors').replace('{n}', String(preview.summary.error)), 'var(--warm-danger)')}
          </div>
          {!!preview.roomsToCreate?.length && (
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>{t('csv.newRooms').replace('{rooms}', preview.roomsToCreate.join(', '))}</div>
          )}
          {preview.unknownColumns.length > 0 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>{t('csv.ignoredColumns').replace('{cols}', preview.unknownColumns.join(', '))}</div>
          )}
          <div style={{ display: 'grid', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
            {preview.rows.filter((r) => r.action !== 'unchanged').map((r) => (
              <div key={r.line} style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text)', padding: '6px 8px', borderRadius: 8, backgroundColor: r.action === 'error' ? 'var(--warm-danger-bg)' : 'var(--warm-bg-subtle)', overflowWrap: 'anywhere' }}>
                <span style={{ fontWeight: 800, color: 'var(--warm-text-light)' }}>{t('csv.line').replace('{n}', String(r.line))}</span>{' '}
                <strong>{rowName(r)}</strong>{' — '}
                {r.action === 'error' && <span style={{ color: 'var(--warm-danger)', fontWeight: 700 }}>{r.error?.message}</span>}
                {r.action === 'add' && <span style={{ color: 'var(--health-green)', fontWeight: 700 }}>{r.newRoom ? t('csv.addNewRoom') : t('csv.addRow')}</span>}
                {r.action === 'update' && r.changes.map((c) => `${c.field}: ${c.from || '∅'} → ${c.to || '∅'}`).join(' · ')}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={apply} disabled={busy || pending === 0}>
              {t('csv.apply').replace('{n}', String(pending))}
            </button>
            <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => { setPreview(null); setCsv(''); }}>{t('common.cancel')}</button>
            {preview.summary.error > 0 && pending > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('csv.errorsSkipped')}</span>}
          </div>
        </div>
      )}
      {message && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--health-green)' }}>{message}</div>}
      {error && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</div>}
    </div>
  );
}
