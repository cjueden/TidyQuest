import { useEffect, useMemo, useRef, useState } from 'react';
import { TaskIcon } from '../icons/TaskIcons';
import { CoinIcon } from '../icons/UIIcons';
import { useTranslation } from '../../hooks/useTranslation';
import { matchesQuery } from '../../utils/tasks';
import type { ListRoom } from '../pages/TaskList';

interface SearchReward {
  id: number;
  title: string;
  description?: string | null;
  costCoins: number;
}

/** Mount only while open, so each search starts empty. */
interface SearchOverlayProps {
  onClose: () => void;
  rooms: ListRoom[];
  rewards: SearchReward[];
  language?: string;
  gamificationEnabled?: boolean;
  onNavigate: (path: string) => void;
}

const MAX_TASKS = 6;
const MAX_ROOMS = 4;
const MAX_REWARDS = 4;

interface Hit {
  key: string;
  section: 'tasks' | 'rooms' | 'rewards' | 'more';
  path: string;
  title: string;
  subtitle?: string;
  iconKey?: string;
  color?: string;
  coins?: number;
}

export function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function SearchOverlay({ onClose, rooms, rewards, language, gamificationEnabled = true, onNavigate }: SearchOverlayProps) {
  const { t, taskName, roomDisplayName } = useTranslation(language);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus after the overlay paints so mobile keyboards open reliably
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const { hits, taskTotal } = useMemo(() => {
    if (!query.trim()) return { hits: [] as Hit[], taskTotal: 0 };
    const taskHits: Hit[] = [];
    for (const room of rooms) {
      const roomName = roomDisplayName(room.name, room.roomType);
      for (const task of room.tasks) {
        const name = taskName(task.name, task.translationKey);
        if (matchesQuery(query, [name, task.notes, roomName])) {
          taskHits.push({ key: `t${task.id}`, section: 'tasks', path: `/rooms/${room.id}?task=${task.id}`, title: name, subtitle: roomName, iconKey: task.iconKey, color: room.color });
        }
      }
    }
    const roomHits: Hit[] = rooms
      .filter((r) => matchesQuery(query, [roomDisplayName(r.name, r.roomType)]))
      .slice(0, MAX_ROOMS)
      .map((r) => ({ key: `r${r.id}`, section: 'rooms', path: `/rooms/${r.id}`, title: roomDisplayName(r.name, r.roomType), color: r.color }));
    const rewardHits: Hit[] = gamificationEnabled
      ? rewards
        .filter((r) => matchesQuery(query, [r.title, r.description]))
        .slice(0, MAX_REWARDS)
        .map((r) => ({ key: `w${r.id}`, section: 'rewards', path: `/rewards?q=${encodeURIComponent(r.title)}`, title: r.title, coins: r.costCoins }))
      : [];
    const more: Hit[] = taskHits.length > MAX_TASKS
      ? [{ key: 'more', section: 'more', path: `/tasks?q=${encodeURIComponent(query.trim())}`, title: t('search.seeAllTasks').replace('{n}', String(taskHits.length)) }]
      : [];
    return { hits: [...taskHits.slice(0, MAX_TASKS), ...more, ...roomHits, ...rewardHits], taskTotal: taskHits.length };
  }, [query, rooms, rewards, gamificationEnabled, t, taskName, roomDisplayName]);

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    onClose();
    onNavigate(hit.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]); }
  };

  const sectionTitle: Record<string, string> = { tasks: t('search.tasks'), rooms: t('search.rooms'), rewards: t('search.rewards') };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, backgroundColor: 'rgba(30, 20, 10, 0.35)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '10vh 12px 12px' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.button')}
        onClick={(e) => e.stopPropagation()}
        className="tq-card"
        style={{ width: '100%', minWidth: 0, maxWidth: 620, maxHeight: '75vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1.5px solid var(--warm-border)', color: 'var(--warm-text-light)' }}>
          <SearchIcon />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, fontWeight: 700, fontFamily: 'Nunito', color: 'var(--warm-text)' }}
          />
          <button onClick={onClose} aria-label={t('common.cancel')} className="tq-btn tq-btn-secondary tq-btn-sm">Esc</button>
        </div>

        <div style={{ overflowY: 'auto', padding: 8 }}>
          {!query.trim() && (
            <div className="tq-empty-state" style={{ padding: '18px 10px' }}>{t('search.hint')}</div>
          )}
          {query.trim() && hits.length === 0 && (
            <div className="tq-empty-state" style={{ padding: '18px 10px' }}>{t('search.noResults').replace('{q}', query.trim())}</div>
          )}
          {hits.map((hit, i) => {
            const prev = hits.slice(0, i).reverse().find((h) => h.section !== 'more');
            const showHeading = hit.section !== 'more' && prev?.section !== hit.section;
            return (
              <div key={hit.key}>
                {showHeading && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 10px 4px' }}>
                    {sectionTitle[hit.section]}{hit.section === 'tasks' && taskTotal > 0 ? ` · ${taskTotal}` : ''}
                  </div>
                )}
                <button
                  onClick={() => go(hit)}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 10px',
                    borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'Nunito',
                    backgroundColor: i === active ? 'var(--warm-accent-light)' : 'transparent',
                    color: hit.section === 'more' ? 'var(--warm-accent)' : 'var(--warm-text)',
                  }}
                >
                  {hit.section === 'tasks' && (
                    <span style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: hit.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <TaskIcon iconKey={hit.iconKey} size={20} />
                    </span>
                  )}
                  {hit.section === 'rooms' && (
                    <span style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: hit.color, flexShrink: 0 }} />
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hit.title}</span>
                    {hit.subtitle && <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' }}>{hit.subtitle}</span>}
                  </span>
                  {hit.coins !== undefined && (
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <CoinIcon />{hit.coins.toLocaleString()}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
