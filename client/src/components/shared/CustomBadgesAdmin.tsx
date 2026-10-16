import { useEffect, useState, type CSSProperties } from 'react';
import { api, type CustomBadge, type CustomBadgeInput } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { badgeRule } from '../../utils/badges';

type Metric = CustomBadge['metric'];
const METRICS: Metric[] = ['task_count', 'task_weeks', 'room_count', 'goal_weeks', 'completions', 'streak', 'coins_earned'];
const EMPTY: CustomBadgeInput = { title: '', icon: '🏅', description: '', metric: 'task_count', taskIds: [], roomId: null, threshold: 10, bonusCoins: 0, userIds: null, secret: false };

/**
 * Settings → Badges: badges parents make for the family (what counts, how many, for whom, a coin
 * bonus, secret or not), and the coin bonus for the built-in badges.
 */
export function CustomBadgesAdmin({ rooms, family, language }: {
  rooms: Array<{ id: number; name: string; roomType?: string; tasks?: Array<{ id: number; name: string; translationKey?: string }> }>;
  family: Array<{ id: number; displayName: string }>;
  language?: string;
}) {
  const { t, taskName, roomDisplayName } = useTranslation(language);
  const [badges, setBadges] = useState<Array<CustomBadge & { earnedBy: number }>>([]);
  const [builtinBonus, setBuiltinBonus] = useState('0');
  const [form, setForm] = useState<CustomBadgeInput | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pickRoom, setPickRoom] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = () => api.getCustomBadges().then((d) => { setBadges(d.badges); setBuiltinBonus(String(d.builtinBonusCoins)); }).catch(() => setBadges([]));
  useEffect(() => { void load(); }, []);

  const allTasks = rooms.flatMap((r) => (r.tasks ?? []).map((tk) => ({ ...tk, roomId: r.id, label: taskName(tk.name, tk.translationKey) })));
  const taskLabel = (id: number) => allTasks.find((tk) => tk.id === id)?.label ?? `#${id}`;
  const roomLabel = (id: number | null) => {
    const r = rooms.find((x) => x.id === id);
    return r ? roomDisplayName(r.name, r.roomType ?? 'other') : '?';
  };
  const ruleText = (b: CustomBadgeInput) => {
    const base = badgeRule(b.metric, b.threshold, t);
    if (b.metric === 'task_count' || b.metric === 'task_weeks') return `${base}: ${b.taskIds.map(taskLabel).join(', ')}`;
    if (b.metric === 'room_count') return `${base}: ${roomLabel(b.roomId)}`;
    return base;
  };

  const startNew = () => { setForm({ ...EMPTY }); setEditingId(null); setError(''); setPickRoom(''); };
  const startEdit = (b: CustomBadge) => {
    setForm({ title: b.title, icon: b.icon, description: b.description ?? '', metric: b.metric, taskIds: b.taskIds, roomId: b.roomId, threshold: b.threshold, bonusCoins: b.bonusCoins, userIds: b.userIds, secret: b.secret });
    setEditingId(b.id); setError(''); setPickRoom('');
  };
  const save = async () => {
    if (!form) return;
    setError('');
    try {
      if (editingId) await api.updateCustomBadge(editingId, form); else await api.createCustomBadge(form);
      setForm(null); setEditingId(null);
      await load();
    } catch (err) {
      const key = `badges.error_${err instanceof Error ? err.message : ''}`;
      setError(t(key) === key ? t('common.error') : t(key));
    }
  };
  const remove = async (b: CustomBadge) => {
    if (!window.confirm(t('badges.deleteConfirm').replace('{name}', b.title))) return;
    await api.deleteCustomBadge(b.id);
    await load();
  };
  const saveBonus = async () => {
    setMessage('');
    try {
      await api.setBadgeConfig(Math.max(0, Math.round(Number(builtinBonus) || 0)));
      setMessage(t('common.saved'));
    } catch {
      setMessage(t('common.error'));
    }
  };

  const chip = (on: boolean): CSSProperties => ({
    padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer',
    border: `1.5px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
    backgroundColor: on ? 'var(--warm-accent-light)' : 'var(--warm-bg-input)', color: on ? 'var(--warm-accent)' : 'var(--warm-text)',
  });
  const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' };
  const label: CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--warm-text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' };
  const set = (patch: Partial<CustomBadgeInput>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const needsTasks = form && (form.metric === 'task_count' || form.metric === 'task_weeks');

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('badges.adminDesc')}</div>
      <div style={{ ...row, fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
        {t('badges.builtinBonus')}
        <input type="number" min={0} className="tq-input-compact" value={builtinBonus} onChange={(e) => setBuiltinBonus(e.target.value)} style={{ width: 70 }} />
        <button className="tq-btn tq-btn-sm" onClick={saveBonus}>{t('common.save')}</button>
        {message && <span style={{ color: 'var(--warm-accent)' }}>{message}</span>}
      </div>

      {badges.map((b) => (
        <div key={b.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--warm-border)', backgroundColor: 'var(--warm-bg-subtle)' }}>
          <span style={{ fontSize: 22 }}>{b.icon}</span>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{b.title}{b.secret ? ' 🤫' : ''}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-muted)', overflowWrap: 'anywhere' }}>{ruleText(b)}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)' }}>
              {[
                b.userIds ? b.userIds.map((id) => family.find((m) => m.id === id)?.displayName ?? '?').join(', ') : t('rewardRules.everyone'),
                b.bonusCoins > 0 ? `+${b.bonusCoins} ${t('settings.coins')}` : '',
                t('badges.earnedBy').replace('{n}', String(b.earnedBy)),
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button className="tq-btn tq-btn-sm" onClick={() => startEdit(b)}>{t('common.edit')}</button>
          <button className="tq-btn tq-btn-sm" onClick={() => remove(b)} style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>{t('common.delete')}</button>
        </div>
      ))}

      {!form && <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={startNew} style={{ justifySelf: 'start' }}>+ {t('badges.newBadge')}</button>}

      {form && (
        <div style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 12, border: '1.5px dashed var(--warm-border)' }}>
          <div style={row}>
            <input className="tq-input-compact" value={form.icon} onChange={(e) => set({ icon: e.target.value })} aria-label={t('badges.icon')} style={{ width: 56, textAlign: 'center', fontSize: 18 }} />
            <input className="tq-input" value={form.title} maxLength={60} placeholder={t('badges.titlePlaceholder')} onChange={(e) => set({ title: e.target.value })} style={{ flex: '1 1 180px', minWidth: 0 }} />
          </div>
          <input className="tq-input" value={form.description ?? ''} maxLength={140} placeholder={t('badges.descriptionPlaceholder')} onChange={(e) => set({ description: e.target.value })} />
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={label}>{t('badges.whatCounts')}</div>
            <div style={row}>
              <select className="tq-input-compact" value={form.metric} onChange={(e) => set({ metric: e.target.value as Metric })} style={{ maxWidth: '100%' }}>
                {METRICS.map((m) => <option key={m} value={m}>{t(`badges.metric_${m}`)}</option>)}
              </select>
              <input type="number" min={1} className="tq-input-compact" value={form.threshold} aria-label={t('badges.howMany')}
                onChange={(e) => set({ threshold: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={{ width: 80 }} />
            </div>
            {form.metric === 'room_count' && (
              <select className="tq-input-compact" value={form.roomId ?? ''} onChange={(e) => set({ roomId: e.target.value ? Number(e.target.value) : null })} style={{ maxWidth: '100%' }}>
                <option value="">{t('badges.chooseRoom')}</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{roomDisplayName(r.name, r.roomType ?? 'other')}</option>)}
              </select>
            )}
            {needsTasks && (
              <>
                <div style={row}>
                  {form.taskIds.map((id) => (
                    <button type="button" key={id} style={chip(true)} onClick={() => set({ taskIds: form.taskIds.filter((x) => x !== id) })}>{taskLabel(id)} ×</button>
                  ))}
                  {form.taskIds.length === 0 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)' }}>{t('badges.noTasksYet')}</span>}
                </div>
                <select className="tq-input-compact" value={pickRoom} onChange={(e) => setPickRoom(e.target.value ? Number(e.target.value) : '')} style={{ maxWidth: '100%' }}>
                  <option value="">{t('badges.addTaskFrom')}</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{roomDisplayName(r.name, r.roomType ?? 'other')}</option>)}
                </select>
                {pickRoom !== '' && (
                  <div style={row}>
                    {allTasks.filter((tk) => tk.roomId === pickRoom).map((tk) => (
                      <button type="button" key={tk.id} style={chip(form.taskIds.includes(tk.id))}
                        onClick={() => set({ taskIds: form.taskIds.includes(tk.id) ? form.taskIds.filter((x) => x !== tk.id) : [...form.taskIds, tk.id] })}>{tk.label}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={label}>{t('badges.forWho')}</div>
            <div style={row}>
              <button type="button" style={chip(!form.userIds)} onClick={() => set({ userIds: null })}>{t('rewardRules.everyone')}</button>
              {family.map((m) => {
                const on = !!form.userIds?.includes(m.id);
                return (
                  <button type="button" key={m.id} style={chip(on)} onClick={() => {
                    const next = on ? (form.userIds ?? []).filter((x) => x !== m.id) : [...(form.userIds ?? []), m.id];
                    set({ userIds: next.length ? next : null });
                  }}>{m.displayName}</button>
                );
              })}
            </div>
          </div>
          <div style={{ ...row, fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
            {t('badges.bonus')}
            <input type="number" min={0} className="tq-input-compact" value={form.bonusCoins} onChange={(e) => set({ bonusCoins: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={{ width: 80 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginLeft: 8 }}>
              <input type="checkbox" checked={form.secret} onChange={(e) => set({ secret: e.target.checked })} style={{ accentColor: 'var(--warm-accent)' }} />
              🤫 {t('badges.secretOption')}
            </label>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' }}>{ruleText(form)}</div>
          <div style={row}>
            <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={save} disabled={!form.title.trim()}>{t('common.save')}</button>
            <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => { setForm(null); setEditingId(null); }}>{t('common.cancel')}</button>
            {error && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
