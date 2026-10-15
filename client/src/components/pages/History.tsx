import { useState, useEffect, useRef } from 'react';
import { UserAvatar } from '../shared/UserAvatar';
import { CoinIcon } from '../icons/UIIcons';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';

type Range = '' | 'today' | 'week' | 'month';

/** Local start of today / this week (Monday) / this month. */
function rangeStart(range: Range): Date | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'today') return today;
  if (range === 'week') return new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

interface HistoryProps {
  language?: string;
  isAdmin?: boolean;
  users?: Array<{ id: number; displayName: string; role: string; isParticipant?: boolean | number }>;
  rooms?: Array<{ id: number; name: string; roomType: string }>;
}

export function History({ language, isAdmin, users = [], rooms = [] }: HistoryProps) {
  const { taskName, t, roomDisplayName, timeAgo } = useTranslation(language);
  const [history, setHistory] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [person, setPerson] = useState('');
  const [roomId, setRoomId] = useState('');
  const [range, setRange] = useState<Range>('');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const latestRequest = useRef(0);
  const limit = 20;
  const hasFilters = !!(person || roomId || range || text);
  const people = users.filter((u) => u.role !== 'admin' || (u.isParticipant !== false && u.isParticipant !== 0));

  const loadHistory = () => {
    const requestId = ++latestRequest.current;
    api.history(limit, offset, {
      userId: person ? Number(person) : undefined,
      roomId: roomId ? Number(roomId) : undefined,
      from: rangeStart(range)?.toISOString(),
      q: query || undefined,
    }).then((data) => {
      if (requestId !== latestRequest.current) return; // a newer filter change already won
      setHistory(data.history);
      setTotal(data.total);
    });
  };

  useEffect(() => {
    loadHistory();
  }, [offset, person, roomId, range, query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search the server once typing pauses
  useEffect(() => {
    const id = setTimeout(() => { setQuery(text.trim()); setOffset(0); }, 300);
    return () => clearTimeout(id);
  }, [text]);

  const clearFilters = () => {
    setPerson(''); setRoomId(''); setRange(''); setText(''); setQuery(''); setOffset(0);
  };
  const filterSelectStyle = { padding: '8px 10px', fontSize: 13, cursor: 'pointer', flex: '1 1 140px', minWidth: 0 };

  const handleCancel = async (id: number) => {
    await api.cancelCompletion(id);
    setConfirmCancel(null);
    loadHistory();
  };

  return (
    <div className="page-enter">
      <div className="tq-card tq-card-padded">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          <input
            type="search"
            className="tq-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('history.searchPlaceholder')}
            aria-label={t('history.searchPlaceholder')}
            style={{ flex: '2 1 200px', minWidth: 0 }}
          />
          <select className="tq-input-compact" style={filterSelectStyle} value={person} onChange={(e) => { setPerson(e.target.value); setOffset(0); }}>
            <option value="">{t('history.everyone')}</option>
            {people.map((u) => <option key={u.id} value={String(u.id)}>{u.displayName}</option>)}
          </select>
          <select className="tq-input-compact" style={filterSelectStyle} value={roomId} onChange={(e) => { setRoomId(e.target.value); setOffset(0); }}>
            <option value="">{t('history.allRooms')}</option>
            {rooms.map((r) => <option key={r.id} value={String(r.id)}>{roomDisplayName(r.name, r.roomType)}</option>)}
          </select>
          <select className="tq-input-compact" style={filterSelectStyle} value={range} onChange={(e) => { setRange(e.target.value as Range); setOffset(0); }}>
            <option value="">{t('history.anyTime')}</option>
            <option value="today">{t('history.today')}</option>
            <option value="week">{t('history.thisWeek')}</option>
            <option value="month">{t('history.thisMonth')}</option>
          </select>
          {hasFilters && (
            <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={clearFilters}>{t('history.clearFilters')}</button>
          )}
        </div>
        <div className="history-table-scroll">
          <div className="history-header" style={{
            display: 'grid', gridTemplateColumns: isAdmin ? '44px 1fr 120px 100px 80px 60px' : '44px 1fr 120px 100px 80px',
            gap: 12, padding: '0 8px 14px', borderBottom: '1.5px solid var(--warm-border)',
            fontSize: 11, fontWeight: 800, color: 'var(--warm-text-light)', textTransform: 'uppercase', letterSpacing: 1,
          }}>
            <div></div>
            <div>{t('history.task')}</div>
            <div>{t('history.room')}</div>
            <div>{t('history.when')}</div>
            <div style={{ textAlign: 'right' }}>{t('history.earned')}</div>
            {isAdmin && <div></div>}
          </div>

          {history.map((h) => {
            const isDuo = h.participants && h.participants.length > 1;
            const byName = isDuo
              ? h.participants.map((p: any) => p.displayName).join(' & ')
              : h.displayName;
            return (
            <div key={h.id} className="history-row" style={{
              display: 'grid', gridTemplateColumns: isAdmin ? '44px 1fr 120px 100px 80px 60px' : '44px 1fr 120px 100px 80px',
              gap: 12, padding: '14px 8px', alignItems: 'center',
              borderBottom: '1px solid var(--warm-border-subtle)',
            }}>
              {isDuo ? (
                <div style={{ position: 'relative', width: 44, height: 34, flexShrink: 0 }}>
                  {h.participants.map((p: any, i: number) => (
                    <div key={p.id} style={{ position: 'absolute', left: i * 14, top: 0, zIndex: h.participants.length - i, outline: '2px solid var(--warm-card)', borderRadius: '50%' }}>
                      <UserAvatar name={p.displayName} color={p.avatarColor} size={28} avatarType={p.avatarType} avatarPreset={p.avatarPreset} avatarPhotoUrl={p.avatarPhotoUrl} />
                    </div>
                  ))}
                </div>
              ) : (
                <UserAvatar name={h.displayName} color={h.avatarColor} size={34} avatarType={h.avatarType} avatarPreset={h.avatarPreset} avatarPhotoUrl={h.avatarPhotoUrl} />
              )}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{taskName(h.taskName, h.translationKey)}</div>
                <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('history.by')} {byName}</div>
                <div className="history-mobile-meta">{roomDisplayName(h.roomName, h.roomType || '')} · {timeAgo(h.completedAt)}</div>
              </div>
              <div className="history-col-room" style={{ fontSize: 13, color: 'var(--warm-text-secondary)', fontWeight: 600 }}>{roomDisplayName(h.roomName, h.roomType || '')}</div>
              <div className="history-col-when" style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600 }}>{timeAgo(h.completedAt)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', fontSize: 13, fontWeight: 800, color: 'var(--warm-coin)' }}>
                +{h.coinsEarned} <CoinIcon />
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {confirmCancel === h.id ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleCancel(h.id)} style={{ background: 'none', border: '1px solid var(--warm-danger)', borderRadius: 8, padding: '3px 7px', fontSize: 10, fontWeight: 700, color: 'var(--warm-danger)', cursor: 'pointer', fontFamily: 'Nunito' }}>✓</button>
                      <button onClick={() => setConfirmCancel(null)} style={{ background: 'none', border: '1px solid var(--warm-text-light)', borderRadius: 8, padding: '3px 7px', fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', cursor: 'pointer', fontFamily: 'Nunito' }}>✗</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmCancel(h.id)} title={t('history.cancel')} style={{ background: 'none', border: '1px solid var(--warm-border)', borderRadius: 8, padding: '3px 8px', fontSize: 13, cursor: 'pointer', color: 'var(--warm-text-muted)' }}>🗑</button>
                  )}
                </div>
              )}
            </div>
            );
          })}

          {history.length === 0 && (
            <div className="tq-empty-state">
              {hasFilters ? t('history.noMatches') : t('history.noActivity')}
            </div>
          )}
        </div>

        {total > limit && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '18px 0 4px' }}>
            <button className="tq-btn tq-btn-secondary tq-btn-sm" disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              style={{ opacity: offset === 0 ? 0.4 : 1 }}>
              {t('history.previous')}
            </button>
            <span style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600, padding: '8px 0' }}>
              {offset + 1}-{Math.min(offset + limit, total)} {t('history.of')} {total}
            </span>
            <button className="tq-btn tq-btn-secondary tq-btn-sm" disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              style={{ opacity: offset + limit >= total ? 0.4 : 1 }}>
              {t('history.next')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
