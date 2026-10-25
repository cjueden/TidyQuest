import { useEffect, useMemo, useRef, useState } from 'react';
import { TaskIcon } from '../icons/TaskIcons';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { isTaskForUser, taskNextDue } from '../../utils/tasks';
import { localeFor } from '../../utils/locale';
import { useTaskView } from '../../hooks/useTaskView';
import { AllMineToggle } from '../shared/AllMineToggle';
import { useWeekStart, weekOrder } from '../../utils/week';
import { at, wall, startOfDay, familyZone } from '../../utils/clock';

interface CalendarTask {
  id: number;
  roomId: number;
  name: string;
  translationKey?: string;
  roomName: string;
  roomType: string;
  health: number;
  frequencyDays: number;
  lastCompletedAt: string | null;
  iconKey?: string;
  onDemand?: boolean;
  isSeasonal?: boolean;
  nextDueAt?: string | null;
  effectiveAssignedUserIds?: number[];
  assignedToChildren?: boolean;
}

interface Completion {
  id: number;
  completedAt: string;
  taskId: number;
  taskName: string;
  translationKey?: string;
  roomId: number;
  roomName: string;
  roomType?: string;
  userId: number;
  displayName: string;
  participants?: Array<{ id: number; displayName: string }>;
}

interface CalendarProps {
  tasks: CalendarTask[];
  language?: string;
  /** Open a task in its room, scrolled to and highlighted */
  onOpenTask?: (roomId: number, taskId: number) => void;
  /** The person looking: drives the All / Mine switch */
  viewer?: { id: number; role?: string; taskView?: 'all' | 'mine' | 'mineOnly'; kidMode?: number | boolean };
}

/** calendar.* weekday labels by getDay() number */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** A grid cell's key (cells are calendar days, made with new Date(year, month, day)) */
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
/** The same key for a moment: the family's day it falls on (Settings → Time zone) */
const homeKey = (d: Date) => { const w = wall(d); return `${w.year}-${w.month}-${w.date}`; };

export function Calendar({ tasks, language, onOpenTask, viewer }: CalendarProps) {
  const { taskName, t, roomDisplayName } = useTranslation(language);
  const locale = localeFor(language);
  const weekStart = useWeekStart();
  // Today at home, as a calendar day like the grid's cells
  const home = wall();
  const today = new Date(home.year, home.month, home.date);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<number | null>(today.getDate());
  const [completions, setCompletions] = useState<Completion[]>([]);
  const latest = useRef(0);
  const { filter: viewFilter, setFilter: setViewFilter, locked: viewLocked } = useTaskView(viewer, 'tq-calendar-filter');
  const mine = viewer && viewFilter === 'mine';
  const { year, month } = view;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = new Date(year, month, 1).toLocaleString(locale, { month: 'long', year: 'numeric' });
  const isThisMonth = year === today.getFullYear() && month === today.getMonth();
  const todayStart = today.getTime();
  const homeMidnight = startOfDay().getTime();

  // Load the shown month's completions (the app only keeps the latest few)
  useEffect(() => {
    const id = ++latest.current;
    api.history(2000, 0, { from: at(year, month, 1).toISOString(), to: at(year, month + 1, 1).toISOString() })
      // Only chores: coin adjustments, chip-ins, purchases and shields are in the history too
      .then((data) => { if (id === latest.current) setCompletions((data.history || []).filter((h: { type?: string }) => !h.type || h.type === 'completion')); })
      .catch(() => { if (id === latest.current) setCompletions([]); });
  }, [year, month]);

  const goMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() ? today.getDate() : null);
  };

  const completionsByDay = useMemo(() => {
    const map = new Map<string, Completion[]>();
    for (const c of completions) {
      if (mine && c.userId !== viewer!.id && !c.participants?.some((p) => p.id === viewer!.id)) continue;
      const k = homeKey(new Date(c.completedAt));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return map;
  }, [completions, mine, viewer]);

  // Each scheduled task's next due date (overdue ones count as due today)
  const upcoming = useMemo(() => tasks
    .filter((task) => !task.onDemand && !task.isSeasonal && (!mine || isTaskForUser(task, viewer!.id, viewer!.role)))
    .map((task) => {
      const due = taskNextDue(task);
      const dueDate = new Date(Math.max(due.getTime(), homeMidnight));
      const dueInDays = Math.max(0, Math.round((startOfDay(dueDate).getTime() - homeMidnight) / 86400000));
      return { ...task, dueDate, dueInDays };
    })
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()), [tasks, homeMidnight, mine, viewer]);

  const dueByDay = useMemo(() => {
    const map = new Map<string, typeof upcoming>();
    for (const task of upcoming) {
      const k = homeKey(task.dueDate);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(task);
    }
    return map;
  }, [upcoming]);

  // Calendar grid padding: blank cells before the 1st, from the family's first day of the week
  const calDays: (number | null)[] = [];
  const offset = (firstDay - weekStart + 7) % 7;
  for (let i = 0; i < offset; i++) calDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calDays.push(d);

  const selectedKey = selected ? dayKey(new Date(year, month, selected)) : null;
  const selectedDue = selectedKey ? dueByDay.get(selectedKey) || [] : [];
  const selectedDone = selectedKey ? completionsByDay.get(selectedKey) || [] : [];
  const selectedLabel = selected ? new Date(year, month, selected).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' }) : '';

  const navBtn = { width: 36, height: 36, borderRadius: 12, border: '1.5px solid var(--warm-border)', background: 'var(--warm-bg-subtle)', color: 'var(--warm-text)', cursor: 'pointer', fontSize: 18, fontWeight: 800, fontFamily: 'Nunito' } as const;
  const itemRow = (key: string, iconKey: string | undefined, title: string, subtitle: string, onClick?: () => void) => (
    <button key={key} onClick={onClick} disabled={!onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 4px',
      border: 'none', borderBottom: '1px solid var(--warm-border)', background: 'none', cursor: onClick ? 'pointer' : 'default', fontFamily: 'Nunito', color: 'inherit',
    }}>
      <span style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: 'var(--warm-accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--warm-border)', flexShrink: 0 }}>
        <TaskIcon iconKey={iconKey} size={20} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--warm-text)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{subtitle}</span>
      </span>
    </button>
  );

  return (
    <div className="page-enter calendar-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        {/* Calendar Grid */}
        <div className="tq-card tq-card-padded">
          {viewer && !viewLocked && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <AllMineToggle value={viewFilter} onChange={setViewFilter} allLabel={t('dashboard.allTasks')} mineLabel={t('dashboard.myTasks')} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 20 }}>
            <button style={navBtn} onClick={() => goMonth(-1)} aria-label={t('calendar.prevMonth')}>‹</button>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--warm-text)', textAlign: 'center' }}>
              {monthName}
              {!isThisMonth && (
                <button onClick={() => goMonth((today.getFullYear() - year) * 12 + today.getMonth() - month)} className="tq-btn tq-btn-secondary tq-btn-sm" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
                  {t('calendar.today')}
                </button>
              )}
            </div>
            <button style={navBtn} onClick={() => goMonth(1)} aria-label={t('calendar.nextMonth')}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
            {weekOrder(weekStart).map((d) => t(`calendar.${DAY_KEYS[d]}`)).map((d) => (
              <div key={d} style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text-light)', padding: 10 }}>{d}</div>
            ))}
            {calDays.map((d, i) => {
              if (!d) return <div key={`e-${i}`} />;
              const cellTime = new Date(year, month, d).getTime();
              const k = dayKey(new Date(year, month, d));
              const isToday = cellTime === todayStart;
              const isPast = cellTime < todayStart;
              const hasActivity = completionsByDay.has(k);
              const isDue = dueByDay.has(k);
              const isSelected = selected === d;
              return (
                <button key={d} onClick={() => setSelected(d)} aria-pressed={isSelected} style={{
                  padding: 10, borderRadius: 14, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito',
                  fontWeight: isToday ? 900 : 600,
                  color: isToday ? '#fff' : isPast ? 'var(--warm-text)' : 'var(--warm-text-light)',
                  backgroundColor: isToday ? 'var(--warm-accent)' : hasActivity && (isPast || isToday) ? 'var(--health-green-bg)' : isDue && !isPast ? 'var(--health-red-bg)' : 'transparent',
                  border: isToday ? 'none' : hasActivity && isPast ? '1.5px solid var(--health-green)' : isDue && !isPast ? '1.5px solid var(--health-red)' : '1.5px solid transparent',
                  boxShadow: isSelected ? '0 0 0 2px var(--warm-text)' : 'none',
                }}>
                  {d}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
            {[
              { bg: 'var(--health-green-bg)', border: 'var(--health-green)', label: t('calendar.choresDone') },
              { bg: 'var(--health-red-bg)', border: 'var(--health-red)', label: t('calendar.tasksDue') },
              { bg: 'var(--warm-accent)', border: 'var(--warm-accent)', label: t('calendar.today') },
            ].map((l) => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--warm-text-muted)', fontWeight: 600 }}>
                <div style={{ width: 14, height: 14, borderRadius: 6, backgroundColor: l.bg, border: `1.5px solid ${l.border}` }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>

        {/* The tapped day: what's due and what got done */}
        {selected && (
          <div className="tq-card tq-card-padded calendar-day-card">
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-text)', margin: '0 0 6px' }}>{selectedLabel}</h3>
            {selectedDue.length === 0 && selectedDone.length === 0 && (
              <div className="tq-empty-state" style={{ padding: '12px 0' }}>{t('calendar.nothingThisDay')}</div>
            )}
            {selectedDue.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--health-red)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 8 }}>{t('calendar.tasksDue')}</div>
                {selectedDue.map((task) => itemRow(`d${task.id}`, task.iconKey, taskName(task.name, task.translationKey), roomDisplayName(task.roomName, task.roomType),
                  onOpenTask ? () => onOpenTask(task.roomId, task.id) : undefined))}
              </>
            )}
            {selectedDone.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--health-green)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 12 }}>{t('calendar.choresDone')}</div>
                {selectedDone.map((c) => {
                  const who = c.participants && c.participants.length > 1 ? c.participants.map((p) => p.displayName).join(' & ') : c.displayName;
                  const time = new Date(c.completedAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: familyZone() });
                  return itemRow(`c${c.id}`, tasks.find((tk) => tk.id === c.taskId)?.iconKey, taskName(c.taskName, c.translationKey),
                    `${roomDisplayName(c.roomName, c.roomType || '')} · ${t('history.by')} ${who} · ${time}`,
                    onOpenTask ? () => onOpenTask(c.roomId, c.taskId) : undefined);
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Upcoming Due Dates */}
      <div className="tq-card calendar-sidebar tq-card-padded">
        <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-text)', margin: '0 0 14px' }}>{t('calendar.upcomingDueDates')}</h3>
        {upcoming.filter((item) => item.dueInDays <= 30).slice(0, 8).map((item, i, list) => (
          <button key={item.id} onClick={onOpenTask ? () => onOpenTask(item.roomId, item.id) : undefined} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'none', fontFamily: 'Nunito', color: 'inherit',
            padding: '12px 0', border: 'none', borderBottom: i < list.length - 1 ? '1px solid var(--warm-border)' : 'none', cursor: onOpenTask ? 'pointer' : 'default',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              backgroundColor: 'var(--warm-accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px solid var(--warm-border)',
            }}><TaskIcon iconKey={item.iconKey} size={20} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warm-text)' }}>{taskName(item.name, item.translationKey)}</div>
              <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{roomDisplayName(item.roomName, item.roomType)}</div>
            </div>
            <div style={{
              fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 10,
              backgroundColor: item.dueInDays <= 5 ? 'var(--health-red-bg)' : 'var(--health-yellow-bg)',
              color: item.dueInDays <= 5 ? 'var(--health-red)' : 'var(--health-yellow)',
            }}>{t('calendar.inDays').replace('{days}', `${item.dueInDays}`)}</div>
          </button>
        ))}
        {upcoming.filter((item) => item.dueInDays <= 30).length === 0 && (
          <div className="tq-empty-state">
            {t('calendar.allCaughtUp')}
          </div>
        )}
      </div>
    </div>
  );
}
