import { createPortal } from 'react-dom';
import type { CoinBoost } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { formatNextDue, isTaskDue, isTaskForUser, taskCoins } from '../../utils/tasks';
import { formatCoins } from '../../utils/format';
import { TaskIcon } from '../icons/TaskIcons';
import type { ListRoom, ListTask } from '../pages/TaskList';

/**
 * Home: tap a double coins event to see every chore it covers that you can do, grouped by room, with the
 * boosted coins and whether it's ready now. An "everything" event says so and lists the rooms instead.
 */
export function BoostDetails({ boost, rooms, userId, role, coinsByEffort, multiplierFor, language, onClose, onOpenTask, onOpenRoom }: {
  boost: CoinBoost;
  /** App's rooms, with their chores */
  rooms: Array<Omit<ListRoom, 'tasks'> & { tasks?: ListTask[] }>;
  userId: number;
  role?: string;
  coinsByEffort?: Record<number, number>;
  /** What a chore pays right now (the biggest running boost or Rescue Mission wins, as on the server) */
  multiplierFor: (taskId: number, roomId: number) => number;
  language?: string;
  onClose: () => void;
  onOpenTask: (roomId: number, taskId: number) => void;
  onOpenRoom: (roomId: number) => void;
}) {
  const { t, taskName, roomDisplayName } = useTranslation(language);
  const everything = !boost.roomIds && !boost.taskIds;
  // The same rule as the server's boostCovers(), without the chores this person can't do
  const groups = rooms.map((room) => ({
    room,
    tasks: (room.tasks ?? []).filter((task) => (everything || !!boost.roomIds?.includes(room.id) || !!boost.taskIds?.includes(task.id))
      && isTaskForUser(task, userId, role)),
  })).filter((g) => g.tasks.length > 0);
  const status = (task: ListTask) => (task.onDemand
    ? { text: t('roomDetail.onDemand'), color: 'var(--warm-accent)' }
    : task.outOfSeason ? { text: t('schedule.offSeason'), color: 'var(--warm-text-light)' }
    : isTaskDue(task) ? { text: t('boosts.readyNow'), color: 'var(--health-green)' }
    : formatNextDue(task.lastCompletedAt, task.frequencyDays, t, language, task.health, task.nextDueAt));
  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', width: '100%', textAlign: 'left' as const,
    borderRadius: 14, background: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)',
    cursor: 'pointer', fontFamily: 'Nunito', color: 'inherit',
  };

  return createPortal(
    <div className="tq-modal-overlay task-edit-overlay" onClick={onClose}>
      <div className="tq-card tq-modal task-edit-sheet tq-card-padded" role="dialog" aria-modal="true" aria-label={boost.title} onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>⚡ {boost.multiplier}× · {boost.title}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warm-text-muted)', marginTop: 2 }}>
              {everything ? t('boosts.everythingCounts') : t('boosts.theseCount').replace('{n}', String(groups.reduce((n, g) => n + g.tasks.length, 0)))}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')}
            style={{ border: 'none', background: 'none', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: 'var(--warm-text-muted)', padding: 4 }}>×</button>
        </div>

        {groups.length === 0 && <div className="tq-empty-state" style={{ padding: '8px 0' }}>{t('boosts.noneForYou')}</div>}

        {everything ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {groups.map(({ room, tasks }) => {
              const ready = tasks.filter((task) => !task.onDemand && !task.outOfSeason && isTaskDue(task)).length;
              return (
                <button key={room.id} type="button" style={rowStyle} onClick={() => { onClose(); onOpenRoom(room.id); }}>
                  <span style={{ width: 12, height: 32, borderRadius: 6, backgroundColor: room.color, border: `1.5px solid ${room.accentColor}44`, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{roomDisplayName(room.name, room.roomType)}</span>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>
                      {t('boosts.roomCounts').replace('{n}', String(tasks.length)).replace('{ready}', String(ready))}
                    </span>
                  </span>
                  <span aria-hidden style={{ color: 'var(--warm-text-light)', fontWeight: 900 }}>›</span>
                </button>
              );
            })}
          </div>
        ) : groups.map(({ room, tasks }) => (
          <div key={room.id} style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{roomDisplayName(room.name, room.roomType)}</div>
            {tasks.map((task) => {
              const due = status(task);
              return (
                <button key={task.id} type="button" style={rowStyle} onClick={() => { onClose(); onOpenTask(room.id, task.id); }}>
                  <span style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: room.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${room.accentColor}44` }}>
                    <TaskIcon iconKey={task.iconKey} size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{taskName(task.name, task.translationKey)}</span>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: due.color }}>{due.text}</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--warm-accent)', whiteSpace: 'nowrap' }}>
                    ⚡ {formatCoins(Math.round(taskCoins(task, coinsByEffort) * multiplierFor(task.id, room.id)))}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
