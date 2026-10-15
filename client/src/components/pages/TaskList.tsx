import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TaskIcon } from '../icons/TaskIcons';
import { CoinIcon } from '../icons/UIIcons';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { formatNextDue, getNextDueDate, isTaskDue, isTaskForUser, matchesQuery, taskCoins } from '../../utils/tasks';

export interface ListTask {
  id: number;
  name: string;
  translationKey?: string;
  notes?: string | null;
  iconKey?: string;
  effort: number;
  customCoins?: number | null;
  frequencyDays: number;
  lastCompletedAt: string | null;
  health: number;
  onDemand?: boolean | number;
  isSeasonal?: boolean;
  assignedToChildren?: boolean;
  effectiveAssignedUserIds?: number[];
}

export interface ListRoom {
  id: number;
  name: string;
  roomType: string;
  color: string;
  accentColor: string;
  zoneId?: number | null;
  tasks: ListTask[];
}

interface ListUser {
  id: number;
  displayName: string;
  role: string;
  isParticipant?: boolean | number;
}

interface TaskListProps {
  rooms: ListRoom[];
  users: ListUser[];
  currentUserId: number;
  coinsByEffort?: Record<number, number>;
  language?: string;
  gamificationEnabled?: boolean;
  /** True until the rooms have loaded once, so an empty list isn't shown as "no matches" */
  loading?: boolean;
  /** Set by a parent: starts on Mine, or is locked to Mine (Kid mode too) */
  taskView?: 'all' | 'mine' | 'mineOnly';
  kidMode?: number | boolean;
  onOpenTask: (roomId: number, taskId: number) => void;
}

type Status = '' | 'due' | 'upcoming' | 'ondemand';
type Sort = 'due' | 'name' | 'room' | 'coins';

const isFor = isTaskForUser;

function isOpenToAnyone(task: ListTask): boolean {
  return !(task.effectiveAssignedUserIds?.length) && !task.assignedToChildren;
}

export function TaskList({ rooms, users, currentUserId, coinsByEffort, language, gamificationEnabled = true, loading = false, taskView, kidMode, onOpenTask }: TaskListProps) {
  const { t, taskName, roomDisplayName } = useTranslation(language);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const personLocked = taskView === 'mineOnly' || !!kidMode;
  const defaultPerson = personLocked || taskView === 'mine' ? 'mine' : 'all';
  const person = personLocked ? 'mine' : (params.get('person') || defaultPerson);
  const roomFilter = params.get('room') || '';
  const status = (params.get('status') || '') as Status;
  const sort = (params.get('sort') || 'due') as Sort;
  const [zones, setZones] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    api.getZones().then(setZones).catch(() => setZones([]));
  }, []);

  // Filters live in the URL so Back returns to the same list
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const hasFilters = !!(q || person !== defaultPerson || roomFilter || status);

  const roleById = useMemo(() => new Map(users.map((u) => [u.id, u.role])), [users]);
  const nameById = useMemo(() => new Map(users.map((u) => [u.id, u.displayName])), [users]);
  const people = users.filter((u) => u.role !== 'admin' || (u.isParticipant !== false && u.isParticipant !== 0));

  const rows = useMemo(() => {
    const all = rooms.flatMap((room, roomIndex) => room.tasks.map((task) => ({
      task, room, roomIndex,
      name: taskName(task.name, task.translationKey),
      roomName: roomDisplayName(room.name, room.roomType),
    })));

    const filtered = all.filter(({ task, room, name, roomName }) => {
      if (roomFilter && String(room.id) !== roomFilter) return false;
      if (person === 'mine' && !isFor(task, currentUserId, roleById.get(currentUserId))) return false;
      if (person === 'open' && !isOpenToAnyone(task)) return false;
      if (!['all', 'mine', 'open'].includes(person)) {
        const uid = Number(person);
        if (!isFor(task, uid, roleById.get(uid)) || isOpenToAnyone(task)) return false;
      }
      if (status === 'due' && !isTaskDue(task)) return false;
      if (status === 'upcoming' && (task.onDemand || task.isSeasonal || isTaskDue(task))) return false;
      if (status === 'ondemand' && !task.onDemand) return false;
      return matchesQuery(q, [name, task.notes, roomName]);
    });

    const dueTime = (task: ListTask) => (task.onDemand ? Infinity : getNextDueDate(task.lastCompletedAt, task.frequencyDays).getTime());
    return filtered.sort((a, b) => {
      let cmp = 0;
      if (sort === 'due') cmp = dueTime(a.task) - dueTime(b.task);
      else if (sort === 'room') cmp = a.roomIndex - b.roomIndex;
      else if (sort === 'coins') cmp = taskCoins(b.task, coinsByEffort) - taskCoins(a.task, coinsByEffort);
      return (Number.isNaN(cmp) ? 0 : cmp) || a.name.localeCompare(b.name);
    });
  }, [rooms, q, person, roomFilter, status, sort, currentUserId, roleById, coinsByEffort, taskName, roomDisplayName]);

  // Room picker grouped by zone; rooms without a zone go last
  const roomGroups = useMemo(() => {
    const groups = zones.map((z) => ({ label: z.name, rooms: rooms.filter((r) => r.zoneId === z.id) }));
    const zoned = new Set(zones.map((z) => z.id));
    const loose = rooms.filter((r) => !r.zoneId || !zoned.has(r.zoneId));
    return [...groups.filter((g) => g.rooms.length > 0), ...(loose.length ? [{ label: '', rooms: loose }] : [])];
  }, [rooms, zones]);

  const selectStyle = { padding: '8px 10px', fontSize: 13, cursor: 'pointer', flex: '1 1 150px', minWidth: 0 };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tq-card tq-card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="search"
          className="tq-input"
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder={t('taskList.searchPlaceholder')}
          aria-label={t('taskList.searchPlaceholder')}
          style={{ width: '100%', fontSize: 15 }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <select className="tq-input-compact" style={selectStyle} value={person} disabled={personLocked} onChange={(e) => setParam('person', e.target.value === defaultPerson ? '' : e.target.value)}>
            <option value="all">{t('taskList.everyone')}</option>
            <option value="mine">{t('taskList.mine')}</option>
            <option value="open">{t('taskList.openToAnyone')}</option>
            {people.map((u) => <option key={u.id} value={String(u.id)}>{u.displayName}</option>)}
          </select>
          <select className="tq-input-compact" style={selectStyle} value={roomFilter} onChange={(e) => setParam('room', e.target.value)}>
            <option value="">{t('taskList.allRooms')}</option>
            {roomGroups.map((g) => g.label ? (
              <optgroup key={g.label} label={g.label}>
                {g.rooms.map((r) => <option key={r.id} value={String(r.id)}>{roomDisplayName(r.name, r.roomType)}</option>)}
              </optgroup>
            ) : g.rooms.map((r) => <option key={r.id} value={String(r.id)}>{roomDisplayName(r.name, r.roomType)}</option>))}
          </select>
          <select className="tq-input-compact" style={selectStyle} value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">{t('taskList.statusAll')}</option>
            <option value="due">{t('taskList.dueNow')}</option>
            <option value="upcoming">{t('taskList.upcoming')}</option>
            <option value="ondemand">{t('roomDetail.onDemand')}</option>
          </select>
          <select className="tq-input-compact" style={selectStyle} value={sort} onChange={(e) => setParam('sort', e.target.value === 'due' ? '' : e.target.value)}>
            <option value="due">{t('taskList.sortDue')}</option>
            <option value="name">{t('taskList.sortName')}</option>
            <option value="room">{t('taskList.sortRoom')}</option>
            {gamificationEnabled && <option value="coins">{t('taskList.sortCoins')}</option>}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)' }}>
          <span>{loading ? '' : rows.length === 1 ? t('taskList.countOne') : t('taskList.count').replace('{n}', String(rows.length))}</span>
          {hasFilters && (
            <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setParams(sort !== 'due' ? { sort } : {}, { replace: true })}>
              {t('taskList.clear')}
            </button>
          )}
        </div>
      </div>

      <div className="tq-card tq-card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.length === 0 && (
          <div className="tq-empty-state" style={{ padding: '16px 4px' }}>{loading ? t('common.loading') : t('taskList.noMatches')}</div>
        )}
        {rows.map(({ task, room, name, roomName }) => {
          const ids = task.effectiveAssignedUserIds || [];
          const who = ids.length ? ids.map((id) => nameById.get(id) || '?').join(' + ') : t('taskList.openToAnyone');
          const due = task.onDemand
            ? { text: t('roomDetail.onDemand'), color: 'var(--warm-accent)' }
            : formatNextDue(task.lastCompletedAt, task.frequencyDays, t, language, task.health);
          return (
            <button
              key={task.id}
              onClick={() => onOpenTask(room.id, task.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', width: '100%', textAlign: 'left',
                borderRadius: 16, backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)',
                cursor: 'pointer', fontFamily: 'Nunito', color: 'inherit',
              }}
            >
              <span style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: room.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${room.accentColor}44` }}>
                <TaskIcon iconKey={task.iconKey} size={24} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--warm-text)' }}>{name}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{roomName} · {who}</span>
                {task.notes && (
                  <span style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 11, color: 'var(--warm-text-muted)', fontWeight: 600, overflowWrap: 'anywhere' }}>{task.notes}</span>
                )}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: due.color }}>{due.text}</span>
                {gamificationEnabled && (
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <CoinIcon />{taskCoins(task, coinsByEffort)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
