import { useEffect, useState } from 'react';
import { api, type CoinBoost } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { localeFor } from '../../utils/locale';

/** "2026-10-17T18:00" for a datetime-local input, in local time. */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Parents: double (or triple) coins for a while, e.g. getting the house ready for a party. */
type BoostRoom = { id: number; name: string; tasks?: Array<{ id: number; name: string }> };

export function CoinBoostsAdmin({ rooms, language }: { rooms: BoostRoom[]; language?: string }) {
  const { t } = useTranslation(language);
  const locale = localeFor(language);
  const [boosts, setBoosts] = useState<CoinBoost[]>([]);
  const [title, setTitle] = useState('');
  const [multiplier, setMultiplier] = useState('2');
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date()));
  const [endAt, setEndAt] = useState(() => toLocalInput(new Date(Date.now() + 3 * 3600000)));
  const [roomIds, setRoomIds] = useState<number[]>([]);
  const [taskIds, setTaskIds] = useState<number[]>([]);
  const [choreQuery, setChoreQuery] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const load = () => api.getBoosts().then((b) => { setBoosts(b); setNow(Date.now()); }).catch(() => setBoosts([]));
  useEffect(() => { void load(); }, []);

  const create = async () => {
    setError('');
    try {
      await api.createBoost({
        title: title.trim(), multiplier: Number(multiplier),
        startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(),
        roomIds: roomIds.length ? roomIds : null,
        taskIds: taskIds.length ? taskIds : null,
      });
      setTitle(''); setRoomIds([]); setTaskIds([]); setChoreQuery('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const when = (iso: string) => new Date(iso).toLocaleString(locale, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  // Chores to aim the event at, on top of whole rooms
  const chores = rooms.flatMap((r) => (r.tasks ?? []).map((c) => ({ id: c.id, name: c.name, room: r.name })));
  const choreName = (id: number) => chores.find((c) => c.id === id)?.name ?? '?';
  const q = choreQuery.trim().toLowerCase();
  const matches = q ? chores.filter((c) => !taskIds.includes(c.id) && `${c.name} ${c.room}`.toLowerCase().includes(q)).slice(0, 6) : [];
  const targets = (b: CoinBoost) => {
    const names = [...(b.roomIds ?? []).map((id) => rooms.find((r) => r.id === id)?.name ?? '?'), ...(b.taskIds ?? []).map(choreName)];
    return names.length ? names.join(', ') : t('boosts.allRooms');
  };
  const chip = (on: boolean) => ({
    padding: '4px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer',
    border: `1.5px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
    backgroundColor: on ? 'var(--warm-accent-light)' : 'var(--warm-bg-input)', color: on ? 'var(--warm-accent)' : 'var(--warm-text)',
  });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {boosts.filter((b) => new Date(b.endAt).getTime() > now - 7 * 86400000).map((b) => {
        const live = new Date(b.startAt).getTime() <= now && new Date(b.endAt).getTime() > now;
        return (
          <div key={b.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, border: `1.5px solid ${live ? 'var(--warm-accent)' : 'var(--warm-border)'}`, backgroundColor: 'var(--warm-bg-subtle)' }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--warm-accent)' }}>{b.multiplier}×</span>
            <span style={{ flex: '1 1 160px', minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>{b.title}{live ? ` · ${t('boosts.live')}` : ''}</span>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' }}>
                {when(b.startAt)} – {when(b.endAt)} · {targets(b)}
              </span>
            </span>
            <button className="tq-btn tq-btn-sm" onClick={async () => { await api.deleteBoost(b.id); await load(); }}
              style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>
              {t('common.delete')}
            </button>
          </div>
        );
      })}
      <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 12, border: '1.5px dashed var(--warm-border)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input className="tq-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('boosts.titlePlaceholder')} style={{ flex: '2 1 200px', minWidth: 0 }} />
          <select className="tq-input-compact" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} style={{ flex: '0 0 auto', padding: '8px 10px' }}>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
            <option value="3">3×</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, flex: '1 1 200px' }}>
            {t('boosts.starts')}
            <input type="datetime-local" className="tq-input-compact" value={startAt} onChange={(e) => setStartAt(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, flex: '1 1 200px' }}>
            {t('boosts.ends')}
            <input type="datetime-local" className="tq-input-compact" value={endAt} onChange={(e) => setEndAt(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          </label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-text-light)' }}>{t('boosts.rooms')}</span>
          <button type="button" style={chip(roomIds.length === 0 && taskIds.length === 0)} onClick={() => { setRoomIds([]); setTaskIds([]); }}>{t('boosts.allRooms')}</button>
          {rooms.map((r) => (
            <button type="button" key={r.id} style={chip(roomIds.includes(r.id))}
              onClick={() => setRoomIds((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))}>{r.name}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-text-light)' }}>{t('boosts.chores')}</span>
          {taskIds.map((id) => (
            <button type="button" key={id} style={chip(true)} onClick={() => setTaskIds((p) => p.filter((x) => x !== id))}>{choreName(id)} ✕</button>
          ))}
          <input className="tq-input-compact" value={choreQuery} onChange={(e) => setChoreQuery(e.target.value)} placeholder={t('boosts.findChore')}
            aria-label={t('boosts.findChore')} style={{ flex: '1 1 140px', minWidth: 0 }} />
        </div>
        {matches.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {matches.map((c) => (
              <button type="button" key={c.id} style={chip(false)} onClick={() => { setTaskIds((p) => [...p, c.id]); setChoreQuery(''); }}>
                + {c.name} <span style={{ color: 'var(--warm-text-light)', fontWeight: 600 }}>· {c.room}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="tq-btn tq-btn-primary tq-btn-sm" disabled={!title.trim()} onClick={create}>{t('boosts.create')}</button>
          {error && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</span>}
        </div>
      </div>
    </div>
  );
}
