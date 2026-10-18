import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TaskIcon } from '../icons/TaskIcons';
import { CoinIcon } from '../icons/UIIcons';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { BulkTaskBar } from '../shared/BulkTaskBar';
import { UndoToast, type UndoState } from '../shared/UndoToast';
import { formatNextDue, isTaskDue, isTaskForUser, matchesQuery, taskCoins, taskNextDue } from '../../utils/tasks';

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
  nextDueAt?: string | null;
  outOfSeason?: boolean;
  oneTime?: number | boolean;
  timerMinutes?: number | null;
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
  /** Parents can select tasks and change or delete them together */
  isAdmin?: boolean;
  onRefresh?: () => void;
  onOpenTask: (roomId: number, taskId: number) => void;
}

type Status = '' | 'due' | 'upcoming' | 'ondemand' | 'onetime' | 'timer';
type Sort = 'due' | 'name' | 'room' | 'coins';

const isFor = isTaskForUser;

function isOpenToAnyone(task: ListTask): boolean {
  return !(task.effectiveAssignedUserIds?.length) && !task.assignedToChildren;
}

export function TaskList({ rooms, users, currentUserId, coinsByEffort, language, gamificationEnabled = true, loading = false, taskView, kidMode, isAdmin = false, onRefresh, onOpenTask }: TaskListProps) {
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
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<UndoState | null>(null);
  const closeUndo = useCallback(() => setUndo(null), []);

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
      if (status === 'onetime' && !task.oneTime) return false;
      if (status === 'timer' && !task.timerMinutes) return false;
      return matchesQuery(q, [name, task.notes, roomName]);
    });

    const dueTime = (task: ListTask) => (task.onDemand ? Infinity : taskNextDue(task).getTime());
    return filtered.sort((a, b) => {
      let cmp = 0;
      if (sort === 'due') cmp = dueTime(a.task) - dueTime(b.task);
      else if (sort === 'room') cmp = a.roomIndex - b.roomIndex;
      else if (sort === 'coins') cmp = taskCoins(b.task, coinsByEffort) - taskCoins(a.task, coinsByEffort);
      return (Number.isNaN(cmp) ? 0 : cmp) || a.name.localeCompare(b.name);
    });
  }, [rooms, q, person, roomFilter, status, sort, currentUserId, roleById, coinsByEffort, taskName, roomDisplayName]);

  // Bulk edit: only tasks still in the list count (filters may have hidden some)
  const shownIds = rows.map((r) => r.task.id);
  const selectedIds = shownIds.filter((id) => selected.has(id));
  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const stopSelecting = () => { setSelecting(false); setSelected(new Set()); setNotice(''); };

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
            <option value="onetime">{t('taskList.oneTime')}</option>
            <option value="timer">⏱️ {t('timer.filter')}</option>
          </select>
          <select className="tq-input-compact" style={selectStyle} value={sort} onChange={(e) => setParam('sort', e.target.value === 'due' ? '' : e.target.value)}>
            <option value="due">{t('taskList.sortDue')}</option>
            <option value="name">{t('taskList.sortName')}</option>
            <option value="room">{t('taskList.sortRoom')}</option>
            {gamificationEnabled && <option value="coins">{t('taskList.sortCoins')}</option>}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)' }}>
          <span style={{ flex: '1 0 auto' }}>{loading ? '' : rows.length === 1 ? t('taskList.countOne') : t('taskList.count').replace('{n}', String(rows.length))}</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {hasFilters && (
              <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setParams(sort !== 'due' ? { sort } : {}, { replace: true })}>
                {t('taskList.clear')}
              </button>
            )}
            {isAdmin && selecting && (
              <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setSelected(selectedIds.length === shownIds.length ? new Set() : new Set(shownIds))}>
                {selectedIds.length === shownIds.length && shownIds.length > 0 ? t('bulk.clear') : t('bulk.selectAll').replace('{n}', String(shownIds.length))}
              </button>
            )}
            {isAdmin && (
              <button className={`tq-btn tq-btn-sm ${selecting ? 'tq-btn-primary' : 'tq-btn-secondary'}`} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
                {selecting ? t('bulk.finish') : t('bulk.select')}
              </button>
            )}
          </span>
        </div>
        {notice && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--health-green)' }}>{notice}</div>}
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
            : task.outOfSeason ? { text: t('schedule.offSeason'), color: 'var(--warm-text-light)' }
            : formatNextDue(task.lastCompletedAt, task.frequencyDays, t, language, task.health, task.nextDueAt);
          const isSelected = selecting && selected.has(task.id);
          return (
            <button
              key={task.id}
              onClick={() => (selecting ? toggle(task.id) : onOpenTask(room.id, task.id))}
              aria-pressed={selecting ? isSelected : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', width: '100%', textAlign: 'left',
                borderRadius: 16, backgroundColor: isSelected ? 'var(--warm-accent-light)' : 'var(--warm-bg-subtle)',
                border: `1.5px solid ${isSelected ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                cursor: 'pointer', fontFamily: 'Nunito', color: 'inherit',
              }}
            >
              {selecting && (
                <span aria-hidden style={{
                  width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${isSelected ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                  backgroundColor: isSelected ? 'var(--warm-accent)' : 'transparent', color: '#fff', fontSize: 13, fontWeight: 900,
                }}>{isSelected ? '✓' : ''}</span>
              )}
              <span style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: room.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${room.accentColor}44` }}>
                <TaskIcon iconKey={task.iconKey} size={24} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--warm-text)' }}>{name}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{roomName} · {who}{task.timerMinutes ? ` · ⏱️ ${task.timerMinutes} ${t('timer.min')}` : ''}</span>
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
      {isAdmin && selecting && selectedIds.length > 0 && (
        <BulkTaskBar
          ids={selectedIds}
          people={people}
          rooms={rooms.map((r) => ({ id: r.id, name: roomDisplayName(r.name, r.roomType) }))}
          language={language}
          onApplied={(n) => { setNotice(n === 1 ? t('bulk.updatedOne') : t('bulk.updated').replace('{n}', String(n))); onRefresh?.(); }}
          onDeleted={(trashIds) => {
            setSelected(new Set());
            const only = trashIds.length === 1 ? rows.find((r) => r.task.id === selectedIds[0]) : undefined;
            setUndo({ trashIds, message: only ? t('trash.deleted').replace('{name}', only.name) : t('trash.deletedMany').replace('{n}', String(trashIds.length)) });
            onRefresh?.();
          }}
        />
      )}
      <UndoToast undo={undo} language={language} onClose={closeUndo} onRestored={() => onRefresh?.()} />
    </div>
  );
}
