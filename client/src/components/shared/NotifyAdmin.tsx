import { useEffect, useState, type CSSProperties } from 'react';
import { api, type NotifyPerson, type NotifySettings, type NotifyKind } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { localeFor } from '../../utils/locale';

const KINDS: NotifyKind[] = ['taskDue', 'reminder', 'outcome', 'summary', 'nudge', 'achievementUnlocked', 'choreApproval', 'rewardRequest', 'coinBoost'];
const label: CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' };
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' };
const box: CSSProperties = { padding: 10, border: '1px solid var(--warm-border)', borderRadius: 10, display: 'grid', gap: 8 };
const errorText = (err: unknown, t: (k: string) => string) => {
  const key = `notifyAdmin.error_${err instanceof Error ? err.message : ''}`;
  return t(key) === key ? t('common.error') : t(key);
};

/** When the summaries go out, quiet and school hours, and Home Assistant. */
export function NotifyScheduleAdmin({ language }: { language?: string }) {
  const { t } = useTranslation(language);
  const [s, setS] = useState<NotifySettings | null>(null);
  const [haToken, setHaToken] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { api.getNotifySettings().then(setS).catch(() => setS(null)); }, []);
  if (!s) return null;
  const set = (patch: Partial<NotifySettings>) => setS({ ...s, ...patch });
  const save = async () => {
    setMessage('');
    try {
      const next = await api.updateNotifySettings({ ...s, ...(haToken ? { haToken } : {}) });
      setS(next); setHaToken('');
      setMessage(t('common.saved'));
    } catch (err) {
      setMessage(errorText(err, t));
    }
  };
  const time = (value: string, onChange: (v: string) => void, aria: string) => (
    <input type="time" className="tq-input-compact" value={value} aria-label={aria} onChange={(e) => onChange(e.target.value)} />
  );
  const days = Array.from({ length: 7 }, (_, d) => new Date(2023, 0, 1 + d).toLocaleDateString(localeFor(language), { weekday: 'long' }));
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={box}>
        <div style={row}><span style={label}>☀️ {t('notifyAdmin.morning')}</span>{time(s.morningTime, (v) => set({ morningTime: v }), t('notifyAdmin.morning'))}</div>
        <div style={row}><span style={label}>🌙 {t('notifyAdmin.evening')}</span>{time(s.eveningTime, (v) => set({ eveningTime: v }), t('notifyAdmin.evening'))}</div>
        <div style={row}>
          <span style={label}>📊 {t('notifyAdmin.recap')}</span>
          <select className="tq-input-compact" value={s.recapDay} onChange={(e) => set({ recapDay: Number(e.target.value) })} aria-label={t('notifyAdmin.recap')}>
            {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          {time(s.recapTime, (v) => set({ recapTime: v }), t('notifyAdmin.recap'))}
        </div>
      </div>
      <div style={box}>
        <div style={row}>
          <span style={label}>🤫 {t('notifyAdmin.quiet')}</span>
          {time(s.quietStart, (v) => set({ quietStart: v }), t('notifyAdmin.quietFrom'))}
          <span style={label}>–</span>
          {time(s.quietEnd, (v) => set({ quietEnd: v }), t('notifyAdmin.quietTo'))}
          {(s.quietStart || s.quietEnd) && <button className="tq-btn tq-btn-sm" onClick={() => set({ quietStart: '', quietEnd: '' })}>{t('notifyAdmin.off')}</button>}
        </div>
        <label style={{ ...row, ...label, cursor: 'pointer' }}>
          <input type="checkbox" checked={s.schoolHoursEnabled} onChange={(e) => set({ schoolHoursEnabled: e.target.checked })} style={{ accentColor: 'var(--warm-accent)' }} />
          🏫 {t('notifyAdmin.school')}
          {s.schoolHoursEnabled && <>{time(s.schoolStart, (v) => set({ schoolStart: v }), t('notifyAdmin.quietFrom'))} – {time(s.schoolEnd, (v) => set({ schoolEnd: v }), t('notifyAdmin.quietTo'))}</>}
        </label>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' }}>{t('notifyAdmin.quietDesc')}</div>
      </div>
      <div style={box}>
        <div style={{ ...label, fontSize: 12 }}>🏠 Home Assistant</div>
        <input className="tq-input" value={s.haUrl} placeholder="http://homeassistant.local:8123" onChange={(e) => set({ haUrl: e.target.value })} aria-label={t('notifyAdmin.haUrl')} />
        <input type="password" className="tq-input" value={haToken} placeholder={s.hasHaToken ? t('notifyAdmin.haTokenSaved') : t('notifyAdmin.haToken')} onChange={(e) => setHaToken(e.target.value)} aria-label={t('notifyAdmin.haToken')} />
        <input className="tq-input" value={s.haFamilyService} placeholder={t('notifyAdmin.haFamilyService')} onChange={(e) => set({ haFamilyService: e.target.value })} aria-label={t('notifyAdmin.haFamilyService')} />
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' }}>{t('notifyAdmin.haDesc')}</div>
      </div>
      <div style={row}>
        <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={save}>{t('common.save')}</button>
        {message && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-accent)' }}>{message}</span>}
      </div>
    </div>
  );
}

/** One person's own channels and the kinds of messages they get. Also used on the Profile page. */
export function PersonNotify({ person, language, onSaved }: { person: NotifyPerson; language?: string; onSaved?: (p: NotifyPerson) => void }) {
  const { t } = useTranslation(language);
  const [p, setP] = useState(person);
  const [message, setMessage] = useState('');
  const save = async () => {
    setMessage('');
    try {
      const next = await api.updateNotifyPerson(p.id, { ntfyTopic: p.ntfyTopic, telegramChatId: p.telegramChatId, haNotifyService: p.haNotifyService, prefs: p.prefs });
      setP(next); onSaved?.(next);
      setMessage(t('common.saved'));
    } catch (err) {
      setMessage(errorText(err, t));
    }
  };
  const test = async () => {
    setMessage('');
    try {
      const r = await api.testNotifyPerson(p.id);
      setMessage(r.results.map((x) => `${x.channel}: ${x.ok ? '✓' : `✗ ${x.error ?? ''}`}`).join(' · '));
    } catch (err) {
      setMessage(errorText(err, t));
    }
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {([
        ['ntfyTopic', 'ntfy', 'notifyAdmin.ntfyTopic'],
        ['telegramChatId', 'Telegram', 'notifyAdmin.telegramChat'],
        ['haNotifyService', 'Home Assistant', 'notifyAdmin.haService'],
      ] as const).map(([field, name, hint]) => (
        <label key={field} style={{ display: 'grid', gap: 3 }}>
          <span style={label}>{name}</span>
          <input className="tq-input" value={p[field]} placeholder={t(hint)} onChange={(e) => setP({ ...p, [field]: e.target.value })} />
        </label>
      ))}
      <div style={{ ...label }}>{t('notifyAdmin.gets')}</div>
      <div style={row}>
        {KINDS.map((k) => (
          <label key={k} style={{ ...label, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={p.prefs[k] !== false} onChange={(e) => setP({ ...p, prefs: { ...p.prefs, [k]: e.target.checked } })} style={{ accentColor: 'var(--warm-accent)' }} />
            {t(`notifyAdmin.kind_${k}`)}
          </label>
        ))}
      </div>
      <div style={row}>
        <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={save}>{t('common.save')}</button>
        <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={test} disabled={p.channels.length === 0}>{t('settings.sendTestNotification')}</button>
        {message && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-accent)', overflowWrap: 'anywhere' }}>{message}</span>}
      </div>
    </div>
  );
}

/** Everyone in the family: their own channels (or "family channel"), expandable. */
export function PeopleNotifyAdmin({ language }: { language?: string }) {
  const { t } = useTranslation(language);
  const [people, setPeople] = useState<NotifyPerson[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { api.getNotifyPeople().then(setPeople).catch(() => setPeople([])); }, []);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('notifyAdmin.peopleDesc')}</div>
      {people.map((p) => (
        <div key={p.id} style={box}>
          <button onClick={() => setOpen(open === p.id ? null : p.id)} style={{ ...row, justifyContent: 'space-between', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'Nunito', color: 'inherit', width: '100%' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>{p.displayName}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: p.channels.length ? 'var(--health-green)' : 'var(--warm-text-light)' }}>
              {p.channels.length ? p.channels.join(' · ') : t('notifyAdmin.familyChannel')} {open === p.id ? '▲' : '▼'}
            </span>
          </button>
          {open === p.id && <PersonNotify person={p} language={language} onSaved={(next) => setPeople((all) => all.map((x) => (x.id === next.id ? next : x)))} />}
        </div>
      ))}
    </div>
  );
}

/** The last 100 messages sent (or that failed), newest first. */
export function NotificationLog({ language }: { language?: string }) {
  const { t } = useTranslation(language);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.getNotifyLog>>>([]);
  const [showAll, setShowAll] = useState(false);
  const load = () => api.getNotifyLog().then(setRows).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);
  const when = (iso: string) => new Date(iso).toLocaleString(localeFor(language), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const shown = showAll ? rows : rows.slice(0, 10);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('notifyAdmin.logEmpty')}</div>}
      {shown.map((r) => (
        <div key={r.id} style={{ fontSize: 12, padding: '6px 8px', borderRadius: 8, backgroundColor: r.ok ? 'var(--warm-bg-subtle)' : 'var(--warm-danger-bg)', overflowWrap: 'anywhere' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--warm-text-light)' }}>
            {when(r.sentAt)} · {r.displayName ?? t('notifyAdmin.familyChannel')} · {r.channel}{r.ok ? '' : ` · ✗ ${r.error ?? ''}`}
          </div>
          <div style={{ fontWeight: 600, color: 'var(--warm-text)', whiteSpace: 'pre-line' }}>{r.message}</div>
        </div>
      ))}
      <div style={row}>
        {rows.length > 10 && <button className="tq-btn tq-btn-sm tq-btn-secondary" onClick={() => setShowAll((v) => !v)}>{showAll ? t('common.showLess') : t('common.showMore')}</button>}
        <button className="tq-btn tq-btn-sm tq-btn-secondary" onClick={() => void load()}>{t('notifyAdmin.refresh')}</button>
      </div>
    </div>
  );
}
