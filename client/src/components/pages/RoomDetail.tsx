import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HealthBar } from '../shared/HealthBar';
import { RingGauge } from '../shared/RingGauge';
import { EffortDots } from '../shared/EffortDots';
import { getRoomIcon } from '../icons/RoomIcons';
import { TaskIcon } from '../icons/TaskIcons';
import { IconPicker } from '../shared/IconPicker';
import { CheckIcon, BackIcon, PlusIcon, CoinIcon } from '../icons/UIIcons';
import { getRoomHealth } from '../../utils/health';
import { formatNextDue, isTaskForUser, taskNextDue } from '../../utils/tasks';
import { TimerStartButton } from '../shared/ChoreTimer';
import { useChoreTimer } from '../../hooks/useChoreTimer';
import { DueOnPicker, ReminderPicker, RotationPeriodPicker, SeasonPicker, StartsOnPicker, StepsField, TimerPicker } from '../shared/ScheduleFields';
import { EMPTY_SCHEDULE, monthlyLabel, schedulePayload, scheduleFromTask, seasonLabel, startsLater, todayIso, weekdaysLabel, type ScheduledTaskFields, type ScheduleValue } from '../../utils/schedule';
import { api } from '../../hooks/useApi';
import { TakeBackButton } from '../shared/TakeBackButton';
import { localeFor } from '../../utils/locale';
import { useTranslation } from '../../hooks/useTranslation';
import { AdminCompleteModal } from '../shared/AdminCompleteModal';
import { ProofModal, type Proof } from '../shared/ProofModal';
import { LateLogModal } from '../shared/LateLogModal';
import { UndoToast, type UndoState } from '../shared/UndoToast';
import { TeamUpButton, TeamUpDialog } from '../shared/TeamUp';
import { claimedLabel } from '../../utils/teamups';
import type { TeamUpInfo } from '../../hooks/useApi';
import { DuplicateRoom } from '../shared/DuplicateRoom';
import { useWeekStart } from '../../utils/week';

const tomorrowIso = () => todayIso(new Date(Date.now() + 86400000));

// Task table columns: each shrinks to a fixed minimum, so every row lines up (the buttons' 190px fits German's
// "☆ Bearbeiten ⋯"). When the card is narrower than the minimums add up to (954px with gaps), computers switch to the
// wrapped layout in index.css (BUG-11).
const TASK_COLUMNS = 'minmax(240px, 3fr) minmax(80px, 1.4fr) minmax(70px, 1fr) 80px minmax(44px, 0.6fr) minmax(70px, 1fr) minmax(80px, 1.4fr) minmax(190px, 2fr)';

const FREQ_UNITS = [
  { label: 'hours', toDays: 1 / 24 },
  { label: 'days', toDays: 1 },
  { label: 'weeks', toDays: 7 },
  { label: 'months', toDays: 30 },
  { label: 'years', toDays: 365 },
];

function daysToFreq(days: number): { value: number; unit: string } {
  if (days >= 365 && days % 365 === 0) return { value: days / 365, unit: 'years' };
  if (days >= 30 && days % 30 === 0) return { value: days / 30, unit: 'months' };
  if (days >= 7 && days % 7 === 0) return { value: days / 7, unit: 'weeks' };
  if (days >= 1) return { value: days, unit: 'days' };
  return { value: Math.round(days * 24), unit: 'hours' };
}

function freqToDays(value: number, unit: string): number {
  const u = FREQ_UNITS.find(f => f.label === unit);
  return value * (u?.toDays || 1);
}

function formatFreq(days: number, t: (key: string) => string): string {
  const { value, unit } = daysToFreq(days);
  const short = t(`unitsShort.${unit}`);
  return `${value}${short}`;
}

function healthColor(value: number): string {
  if (value >= 70) return 'var(--health-green)';
  if (value >= 40) return 'var(--health-yellow)';
  return 'var(--health-red)';
}

type SortKey = 'name' | 'health' | 'effort' | 'frequency' | 'coins' | 'assigned' | 'dueDate';

interface CompletedTodayBy {
  completionId: number;
  userId: number;
  coinsEarned?: number;
  displayName: string;
  avatarColor: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
}

interface Task extends ScheduledTaskFields {
  pausedAt?: string | null; // ENH-1: paused (parents only see it)
  pausedUntil?: string | null;
  id: number; name: string; translationKey?: string; health: number; frequencyDays: number;
  effort: number; notes?: string | null; isSeasonal: boolean; onDemand?: boolean; showInDashboard?: boolean; lastCompletedAt: string | null; iconKey?: string;
  assignedToChildren?: boolean;
  assignedUserIds?: number[];
  assignedUsers?: Array<{ id: number; displayName: string; avatarColor: string; avatarType?: string; avatarPreset?: string; avatarPhotoUrl?: string; coinPercentage?: number }>;
  effectiveAssignedUserIds?: number[];
  completedTodayBy?: CompletedTodayBy | null;
  /** Team-ups: can you start one, and has a team claimed it today? */
  teamUp?: TeamUpInfo | null;
  assignmentMode?: 'first' | 'shared' | 'custom' | 'rotating';
  rotationCurrentUserId?: number | null;
  customCoins?: number | null;
  myPendingCount?: number;
  /** My latest Done that waits for approval (I can take it back) */
  myPendingId?: number | null;
  repeatLimit?: number | null;
  repeatPeriod?: 'day' | 'week' | null;
  /** The viewer's completions of this anytime quest in the current day/week */
  myRepeatCount?: number;
  allowEarlyCompletion?: boolean;
  sharedCompletions?: Array<{ userId: number; displayName: string; completionId: number }>;
  /** When it's next due, from the server (set weekdays aware) */
  nextDueAt?: string | null;
  /** Outside its season right now (isSeasonal is then true too) */
  outOfSeason?: boolean;
  /** Pinned by the viewer to "Your usual" on Home */
  pinned?: boolean;
}

interface RoomDetailProps {
  room: {
    id: number; name: string; roomType: string; color: string; accentColor: string;
    assignedUserId?: number | null;
    tasks: Task[];
  };
  language?: string;
  isAdmin: boolean;
  currentUserId?: number;
  currentUserRole?: 'admin' | 'member' | 'child';
  users?: Array<{ id: number; displayName: string; role: string; avatarColor: string; avatarType?: string; avatarPreset?: string; avatarPhotoUrl?: string }>;
  coinsByEffort?: Record<number, number>;
  onCompleteTask: (taskId: number, proof?: Proof) => void;
  /** Strict Mode is on: kids can attach a note or photo when finishing */
  strictMode?: boolean;
  onBack: () => void;
  onRefresh?: () => void;
  /** Go to another room (after duplicating this one) */
  onOpenRoom?: (roomId: number) => void;
  /** Offer "One time" in the task form (Settings → Features → To-dos) */
  allowOneTime?: boolean;
  onAchievementsUnlocked?: (ids: string[]) => void;
  /** Task to scroll to and briefly highlight (from search or the task list) */
  focusTaskId?: number;
  /** The viewer is locked to Mine (or in Kid mode): only show their tasks */
  onlyMine?: boolean;
}

function FrequencyPicker({ value, unit, onChange, t }: {
  value: number; unit: string;
  onChange: (v: number, u: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input type="number" min={1} max={999} value={value}
        onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1), unit)}
        className="tq-input-compact"
        style={{ width: 52, textAlign: 'center', fontWeight: 700 }} />
      <select value={unit} onChange={(e) => onChange(value, e.target.value)}
        className="tq-input-compact"
        style={{ cursor: 'pointer' }}>
        {FREQ_UNITS.map((f) => (
          <option key={f.label} value={f.label}>{t(`units.${f.label}`)}</option>
        ))}
      </select>
    </div>
  );
}

function EffortPicker({ effort, onChange }: { effort: number; onChange: (e: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((e) => (
        <button key={e} onClick={() => onChange(e)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 1,
            opacity: e <= effort ? 1 : 0.3,
          }}>
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L8.5 5H12.5L9.5 7.5L10.5 11.5L7 9L3.5 11.5L4.5 7.5L1.5 5H5.5L7 1Z"
              fill={e <= effort ? '#F59E0B' : 'none'}
              stroke={e <= effort ? '#F59E0B' : '#E2D5C5'}
              strokeWidth={e <= effort ? '0.5' : '1'} />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function RoomDetail({ room, language, isAdmin, currentUserId, currentUserRole, users, coinsByEffort, onCompleteTask, onBack, onRefresh, onOpenRoom, allowOneTime = true, onAchievementsUnlocked, focusTaskId, onlyMine, strictMode }: RoomDetailProps) {
  const { taskName: translateTask, roomDisplayName, timeAgo, t } = useTranslation(language);
  const [animatedTask, setAnimatedTask] = useState<number | null>(null);
  const timer = useChoreTimer();
  const weekStart = useWeekStart();
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', originalName: '', notes: '', freqValue: 7, freqUnit: 'days', effort: 1, health: 100, healthChanged: false, iconKey: 'sparkle', onDemand: false, showInDashboard: false, assignmentType: 'none' as 'none' | 'users', assignmentUserIds: [] as number[], assignmentMode: 'first' as 'first' | 'shared' | 'custom' | 'rotating', assignmentPercentages: {} as Record<number, number>, customCoins: '' as string | number, allowEarlyCompletion: false, repeatLimit: '', repeatPeriod: 'week' as 'day' | 'week', paused: false, pausedUntil: '' });
  const [taskMenuOpen, setTaskMenuOpen] = useState<number | null>(null);
  const [moveMenuTaskId, setMoveMenuTaskId] = useState<number | null>(null);
  const [allRooms, setAllRooms] = useState<Array<{ id: number; name: string; roomType: string }>>([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newFreqValue, setNewFreqValue] = useState(7);
  const [newFreqUnit, setNewFreqUnit] = useState('days');
  const [newTaskEffort, setNewTaskEffort] = useState(2);
  const [newTaskHealth, setNewTaskHealth] = useState(0);
  const [newTaskIconKey, setNewTaskIconKey] = useState('sparkle');
  const [newAssignmentType, setNewAssignmentType] = useState<'none' | 'users'>('none');
  const [newAssignmentUserIds, setNewAssignmentUserIds] = useState<number[]>([]);
  const [newAssignmentMode, setNewAssignmentMode] = useState<'first' | 'shared' | 'custom' | 'rotating'>('first');
  const [newAssignmentPercentages, setNewAssignmentPercentages] = useState<Record<number, number>>({});
  const [addTaskError, setAddTaskError] = useState('');
  const [newTaskOnDemand, setNewTaskOnDemand] = useState(false);
  const [newTaskShowInDashboard, setNewTaskShowInDashboard] = useState(false);
  const [newRepeatLimit, setNewRepeatLimit] = useState('');
  const [newRepeatPeriod, setNewRepeatPeriod] = useState<'day' | 'week'>('week');
  const [editSchedule, setEditSchedule] = useState<ScheduleValue>(EMPTY_SCHEDULE);
  const [newSchedule, setNewSchedule] = useState<ScheduleValue>(EMPTY_SCHEDULE);
  const [sortKey, setSortKey] = useState<SortKey>('health');
  const [sortAsc, setSortAsc] = useState(true);
  const focusedOnce = useRef<number | null>(null);
  const [proofTask, setProofTask] = useState<Task | null>(null);
  /** "Done earlier…" (ENH-7) */
  const [lateTask, setLateTask] = useState<Task | null>(null);
  // The chore someone is picking a team-up partner for
  const [teamPick, setTeamPick] = useState<Task | null>(null);
  const canAddProof = !!strictMode && currentUserRole === 'child';
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const closeUndo = useCallback(() => setUndo(null), []);
  // Delete, undo, pin, copy and move: a failure (such as a phone that's offline) shows a toast instead of nothing
  const attempt = async (fn: () => Promise<void>) => {
    try { await fn(); } catch { setUndo({ message: t('common.actionFailed') }); onRefresh?.(); }
  };

  // Opened from search or the task list: bring that task into view and flash it once
  useEffect(() => {
    if (!focusTaskId || focusedOnce.current === focusTaskId) return;
    const el = document.querySelector(`[data-task-id="${focusTaskId}"]`);
    if (!el) return;
    focusedOnce.current = focusTaskId;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('task-focus-flash');
    const timer = setTimeout(() => el.classList.remove('task-focus-flash'), 2500);
    return () => { clearTimeout(timer); el.classList.remove('task-focus-flash'); };
  }, [focusTaskId, room.tasks.length]);

  const [adminModalTask, setAdminModalTask] = useState<Task | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateTasks, setTemplateTasks] = useState<Array<{ name: string; translationKey?: string; iconKey?: string; frequencyDays: number; effort: number; isSeasonal?: boolean; selected: boolean }>>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateAdding, setTemplateAdding] = useState(false);

  // Initialize percentages evenly for custom mode
  const initPercentages = (userIds: number[]): Record<number, number> => {
    if (userIds.length === 0) return {};
    const base = Math.floor(100 / userIds.length);
    const remainder = 100 - base * userIds.length;
    const result: Record<number, number> = {};
    userIds.forEach((id, i) => { result[id] = base + (i === 0 ? remainder : 0); });
    return result;
  };

  const health = getRoomHealth(room.tasks);
  const RoomIcon = getRoomIcon(room.roomType);

  // Same rule the server uses when paying out: a custom amount wins over the effort default
  const taskCoins = (task: Task) =>
    task.customCoins != null && task.customCoins > 0 ? task.customCoins : (coinsByEffort?.[task.effort] ?? task.effort * 5);

  const sortedTasks = [...room.tasks].filter((task) => !onlyMine || currentUserId === undefined || isTaskForUser(task, currentUserId, currentUserRole)).sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'health': cmp = a.health - b.health; break;
      case 'effort': cmp = a.effort - b.effort; break;
      case 'frequency': cmp = a.frequencyDays - b.frequencyDays; break;
      case 'coins': cmp = taskCoins(a) - taskCoins(b); break;
      case 'assigned': cmp = (a.assignedUsers?.length ?? 0) - (b.assignedUsers?.length ?? 0); break;
      case 'dueDate': cmp = taskNextDue(a).getTime() - taskNextDue(b).getTime(); break;
    }
    return !!a.pausedAt !== !!b.pausedAt ? (a.pausedAt ? 1 : -1) : sortAsc ? cmp : -cmp; // paused chores last
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) { setSortAsc(!sortAsc); }
    else { setSortKey(key); setSortAsc(true); }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortAsc ? ' \u25B2' : ' \u25BC';
  };

  const handleComplete = (task: Task) => {
    const isAdminOrMember = currentUserRole === 'admin' || currentUserRole === 'member';
    const hasAssignees = (task.effectiveAssignedUserIds && task.effectiveAssignedUserIds.length > 0) || task.assignedToChildren;
    if (isAdminOrMember && hasAssignees) {
      setAdminModalTask(task);
    } else {
      setAnimatedTask(task.id);
      onCompleteTask(task.id);
      setTimeout(() => setAnimatedTask(null), 2200);
    }
  };

  const handleAdminModalConfirm = async (userIds: number[]) => {
    if (!adminModalTask) return;
    try {
      const allNewAchievements: string[] = [];
      for (const uid of userIds) {
        const result = await api.completeTask(adminModalTask.id, uid);
        if (result.newAchievements?.length) allNewAchievements.push(...result.newAchievements);
      }
      if (allNewAchievements.length > 0) onAchievementsUnlocked?.(allNewAchievements);
    } catch (e) {
      console.error('Failed to complete task for some users:', e);
    }
    setAdminModalTask(null);
    setAnimatedTask(adminModalTask.id);
    onRefresh?.();
    setTimeout(() => setAnimatedTask(null), 2200);
  };

  const startEdit = (task: Task) => {
    const { value, unit } = daysToFreq(task.frequencyDays);
    const assignmentType: 'none' | 'users' =
      (task.assignedUserIds && task.assignedUserIds.length > 0) ? 'users' : 'none';
    const assignmentUserIds = task.assignedUserIds || [];
    const assignmentPercentages: Record<number, number> = {};
    for (const u of task.assignedUsers || []) {
      assignmentPercentages[u.id] = u.coinPercentage ?? 0;
    }
    const displayedName = translateTask(task.name, task.translationKey);
    setEditingTask(task.id);
    setEditSchedule(scheduleFromTask(task));
    setEditForm({ name: displayedName, originalName: displayedName, notes: task.notes || '', freqValue: value, freqUnit: unit, effort: task.effort, health: task.health, healthChanged: false, iconKey: task.iconKey || 'sparkle', onDemand: !!task.onDemand, showInDashboard: !!task.showInDashboard, assignmentType, assignmentUserIds, assignmentMode: (task.assignmentMode || 'first') as 'first' | 'shared' | 'custom' | 'rotating', assignmentPercentages, customCoins: task.customCoins ?? '', allowEarlyCompletion: !!task.allowEarlyCompletion, repeatLimit: task.repeatLimit ? String(task.repeatLimit) : '', repeatPeriod: task.repeatPeriod === 'day' ? 'day' : 'week', paused: !!task.pausedAt, pausedUntil: task.pausedUntil || '' });
  };

  const saveEdit = async () => {
    if (!editingTask || !editForm.name.trim()) return;
    const frequencyDays = freqToDays(editForm.freqValue, editForm.freqUnit);
    const assignmentPayload =
      editForm.assignmentType === 'users' ? { assignedToChildren: false, assignedUserIds: editForm.assignmentUserIds } :
      { assignedToChildren: false, assignedUserIds: [] };
    const assignedUserPercentages = editForm.assignmentMode === 'custom' ? editForm.assignmentPercentages : undefined;
    const nameChanged = editForm.name.trim() !== editForm.originalName.trim();
    await api.updateTask(editingTask, { ...(nameChanged ? { name: editForm.name } : {}), notes: editForm.notes, frequencyDays, effort: editForm.effort, ...(editForm.healthChanged ? { health: editForm.health } : {}), iconKey: editForm.iconKey, onDemand: editForm.onDemand, showInDashboard: editForm.showInDashboard, assignmentMode: editForm.assignmentMode, assignedUserPercentages, customCoins: editForm.customCoins !== '' ? Number(editForm.customCoins) : null, allowEarlyCompletion: editForm.allowEarlyCompletion, repeatLimit: editForm.onDemand && editForm.repeatLimit ? Number(editForm.repeatLimit) : null, repeatPeriod: editForm.repeatPeriod, ...schedulePayload(editSchedule, { onDemand: editForm.onDemand, rotating: editForm.assignmentMode === 'rotating' }), ...assignmentPayload, paused: editForm.paused, pausedUntil: editForm.paused && editForm.pausedUntil ? editForm.pausedUntil : null });
    const editedId = editingTask;
    setEditingTask(null);
    onRefresh?.();
    // Bring the edited task back into view once the list has reloaded (it may have re-sorted)
    setTimeout(() => {
      const el = document.querySelector(`[data-task-id="${editedId}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('task-focus-flash');
      setTimeout(() => el.classList.remove('task-focus-flash'), 2000);
    }, 500);
  };

  // Determine if Done button should be disabled for a task
  function getDoneButtonState(task: Task): { disabled: boolean; label: string } {
    const claimed = claimedLabel(task.teamUp);
    if (claimed) return { disabled: true, label: claimed };
    if (currentUserRole !== 'admin' && currentUserRole !== 'member') {
      const effectiveIds = task.effectiveAssignedUserIds;
      if (effectiveIds && effectiveIds.length > 0 && currentUserId !== undefined) {
        if (!effectiveIds.includes(currentUserId)) {
          return { disabled: true, label: t('app.notAssigned') };
        }
      }
    }

    // Strict Mode: my earlier tap is still waiting for a parent
    const pending = task.myPendingCount ?? 0;
    if (pending > 0 && currentUserRole !== 'admin' && currentUserRole !== 'member') {
      if (!task.onDemand) return { disabled: true, label: t('app.waitingForApproval') };
      return { disabled: false, label: `${t('roomDetail.done')} · ⏳ ${pending}` };
    }

    // Anytime quest with a repeat limit that's used up for this day/week
    if (task.onDemand && task.repeatLimit && (task.myRepeatCount ?? 0) >= task.repeatLimit && currentUserRole !== 'admin' && currentUserRole !== 'member') {
      return { disabled: true, label: t(task.repeatPeriod === 'day' ? 'repeat.doneToday' : 'repeat.doneThisWeek') };
    }

    // Rotating mode: disabled if it's not the current user's turn
    if (task.assignmentMode === 'rotating' && task.rotationCurrentUserId !== undefined) {
      if (currentUserId !== undefined && task.rotationCurrentUserId !== currentUserId) {
        const turnUser = task.assignedUsers?.find(u => u.id === task.rotationCurrentUserId);
        return { disabled: true, label: t('roomDetail.waitingForTurn').replace('{name}', turnUser?.displayName || '?') };
      }
    }

    // On-demand tasks are always completeable — skip all scheduling and repetition guards
    if (task.onDemand) {
      return { disabled: false, label: t('roomDetail.done') };
    }

    // Block if task frequency cooldown hasn't elapsed (health > 0 means not yet due)
    if (task.health > 0 && task.lastCompletedAt) {
      // Allow early completion if the toggle is on AND last completion was on a previous calendar day
      if (task.allowEarlyCompletion) {
        const last = new Date(task.lastCompletedAt);
        const today = new Date();
        const lastStr = `${last.getFullYear()}-${String(last.getMonth()).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        if (lastStr < todayStr) {
          // Different calendar day — allow despite health > 0
        } else {
          return { disabled: true, label: t('roomDetail.done') };
        }
      } else {
        const { text } = formatNextDue(task.lastCompletedAt, task.frequencyDays, t, language, task.health, task.nextDueAt);
        return { disabled: true, label: text };
      }
    }

    if (task.assignmentMode === 'shared' || task.assignmentMode === 'custom') {
      // In shared/custom mode: disabled only if current user has already completed their part
      const myCompletion = task.sharedCompletions?.find(c => c.userId === currentUserId);
      if (myCompletion) {
        return { disabled: true, label: t('app.doneBy').replace('{name}', t('common.you') || 'You') };
      }
      // Also disabled if all users have completed (task fully done)
      if (task.sharedCompletions && task.assignedUsers && task.sharedCompletions.length >= task.assignedUsers.length) {
        return { disabled: true, label: t('roomDetail.done') };
      }
      return { disabled: false, label: t('roomDetail.done') };
    }

    // First mode (default): if anyone completed today, blocked
    if (task.completedTodayBy) {
      return { disabled: true, label: t('app.doneBy').replace('{name}', task.completedTodayBy.displayName) };
    }
    return { disabled: false, label: t('roomDetail.done') };
  }

  const deleteTask = async (taskId: number) => {
    const task = room.tasks.find((x) => x.id === taskId);
    const name = task ? translateTask(task.name, task.translationKey) : '';
    if (!window.confirm(t('roomDetail.deleteTaskConfirmTrash').replace('{name}', name).replace('{n}', '30'))) return;
    await attempt(async () => {
      const { trashId } = await api.deleteTask(taskId);
      setEditingTask(null);
      onRefresh?.();
      if (trashId) setUndo({ trashIds: [trashId], message: t('trash.deleted').replace('{name}', name) });
    });
  };

  const togglePin = async (task: Task) => {
    await attempt(async () => {
      if (task.pinned) await api.unpinTask(task.id); else await api.pinTask(task.id);
      onRefresh?.();
    });
  };

  const togglePause = async (task: Task) => {
    setTaskMenuOpen(null);
    setMoveMenuTaskId(null);
    await attempt(async () => {
      if (task.pausedAt) await api.resumeTask(task.id); else await api.pauseTask(task.id);
      onRefresh?.();
    });
  };

  const pausedLabel = (task: Task) => task.pausedUntil
    ? t('pause.pausedUntil').replace('{date}', new Date(`${task.pausedUntil}T12:00:00`).toLocaleDateString(localeFor(language), { month: 'short', day: 'numeric' }))
    : t('pause.paused');

  const handleDuplicateTask = async (taskId: number) => {
    setTaskMenuOpen(null);
    await attempt(async () => {
      await api.duplicateTask(taskId);
      onRefresh?.();
    });
  };

  const handleMoveTask = async (taskId: number, targetRoomId: number) => {
    setMoveMenuTaskId(null);
    setTaskMenuOpen(null);
    await attempt(async () => {
      await api.updateTask(taskId, { roomId: targetRoomId });
      onRefresh?.();
    });
  };

  const handleTaskMenuOpen = async (taskId: number) => {
    setTaskMenuOpen(taskId);
    if (allRooms.length === 0) {
      const rooms = await api.getRooms();
      setAllRooms(rooms);
    }
  };

  const addTask = async () => {
    if (!newTaskName.trim()) {
      setAddTaskError(t('roomDetail.taskNameRequired'));
      return;
    }
    setAddTaskError('');
    const frequencyDays = freqToDays(newFreqValue, newFreqUnit);
    const assignmentPayload =
      newAssignmentType === 'users' ? { assignedToChildren: false, assignedUserIds: newAssignmentUserIds } :
      { assignedToChildren: false, assignedUserIds: [] };
    const assignedUserPercentages = newAssignmentMode === 'custom' ? newAssignmentPercentages : undefined;
    await api.createTask(room.id, {
      name: newTaskName.trim(),
      notes: newTaskNotes.trim() || undefined,
      frequencyDays,
      effort: newTaskEffort,
      health: newTaskHealth,
      // Left on the sparkle: the server picks the icon the name suggests
      iconKey: newTaskIconKey !== 'sparkle' ? newTaskIconKey : undefined,
      onDemand: newTaskOnDemand,
      showInDashboard: newTaskShowInDashboard,
      ...(newTaskOnDemand && newRepeatLimit ? { repeatLimit: Number(newRepeatLimit), repeatPeriod: newRepeatPeriod } : {}),
      assignmentMode: newAssignmentMode,
      assignedUserPercentages,
      ...schedulePayload(newSchedule, { onDemand: newTaskOnDemand, rotating: newAssignmentMode === 'rotating' }),
      ...assignmentPayload,
    });
    setNewTaskName('');
    setNewTaskNotes('');
    setNewFreqValue(7);
    setNewFreqUnit('days');
    setNewTaskEffort(2);
    setNewTaskHealth(100);
    setNewTaskIconKey('sparkle');
    setNewAssignmentType('none');
    setNewAssignmentUserIds([]);
    setNewAssignmentMode('first');
    setNewAssignmentPercentages({});
    setNewTaskOnDemand(false);
    setNewTaskShowInDashboard(false);
    setNewRepeatLimit('');
    setNewSchedule(EMPTY_SCHEDULE);
    setShowAddTask(false);
    onRefresh?.();
  };

  const colStyle = (key: SortKey): React.CSSProperties => ({
    cursor: 'pointer', userSelect: 'none',
    color: sortKey === key ? 'var(--warm-accent)' : 'var(--warm-text-light)',
  });

  return (
    <>
    <div className="page-enter">
      {/* Header */}
      <div className="tq-card room-detail-hero" style={{
        padding: 28, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 28,
        background: `linear-gradient(135deg, ${room.color}88, ${room.color}33)`,
        borderColor: `${room.accentColor}44`,
      }}>
        <RingGauge value={health} size={110} strokeWidth={10} />
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 6 }}><RoomIcon /></div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--warm-text)', margin: '0 0 4px' }}>{roomDisplayName(room.name, room.roomType)}</h2>
          <div style={{ fontSize: 13, color: 'var(--warm-text-muted)', fontWeight: 600 }}>{room.tasks.length} {t('rooms.tasksTracked')}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'stretch', justifyContent: 'center' }}>
          <button onClick={onBack} className="tq-btn tq-btn-secondary tq-btn-md">
            <BackIcon /> {t('rooms.backToRooms')}
          </button>
          {isAdmin && (
            <button onClick={() => setShowDuplicate((v) => !v)} className="tq-btn tq-btn-secondary tq-btn-sm">
              {t('duplicateRoom.button')}
            </button>
          )}
        </div>
      </div>

      {isAdmin && showDuplicate && (
        <DuplicateRoom room={room} displayName={roomDisplayName(room.name, room.roomType)} users={users || []} language={language}
          onCancel={() => setShowDuplicate(false)}
          onDone={(id) => { setShowDuplicate(false); onRefresh?.(); onOpenRoom?.(id); }} />
      )}

      {/* Task Table */}
      <div className="tq-card tq-card-padded">
        <div className="room-table-scroll room-detail-scroll">
        {/* Column Headers (sortable) */}
        <div className="room-table-header" style={{
          display: 'grid', gridTemplateColumns: TASK_COLUMNS,
          gap: 12, padding: '0 8px 14px', borderBottom: '1.5px solid var(--warm-border)',
          fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1,
        }}>
          <div style={colStyle('name')} onClick={() => handleSort('name')}>{t('history.task')}{sortIndicator('name')}</div>
          <div style={colStyle('health')} onClick={() => handleSort('health')}>{t('rooms.health')}{sortIndicator('health')}</div>
          <div style={colStyle('frequency')} onClick={() => handleSort('frequency')}>{t('roomDetail.frequency')}{sortIndicator('frequency')}</div>
          <div style={colStyle('effort')} onClick={() => handleSort('effort')}>{t('roomDetail.effort')}{sortIndicator('effort')}</div>
          <div style={colStyle('coins')} onClick={() => handleSort('coins')}>{t('roomDetail.coins')}{sortIndicator('coins')}</div>
          <div style={colStyle('dueDate')} onClick={() => handleSort('dueDate')}>{t('roomDetail.nextDue')}{sortIndicator('dueDate')}</div>
          <div style={colStyle('assigned')} onClick={() => handleSort('assigned')}>{t('roomDetail.assigned')}{sortIndicator('assigned')}</div>
          <div style={{ textAlign: 'right', color: 'var(--warm-text-light)' }}>{t('roomDetail.actions')}</div>
        </div>

        {sortedTasks.map((task) => (
          <div key={task.id} data-task-id={task.id}>
            {/* Edit opens in a pop-up (a bottom sheet on phones) so the list doesn't jump around */}
            {editingTask === task.id && createPortal(
              <div className="tq-modal-overlay task-edit-overlay" onClick={() => setEditingTask(null)}>
              <div className="tq-card tq-modal tq-modal-wide task-edit-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ overflowY: 'auto', padding: 12 }}>
              <div style={{
                padding: '16px 8px', borderBottom: '1px solid var(--warm-border-subtle)',
                backgroundColor: 'var(--warm-bg-warm)', borderRadius: 12,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 70 }}>{t('roomDetail.name')}</label>
                    <input value={editForm.name}
                      onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                      autoFocus={!window.matchMedia('(pointer: coarse)').matches}
                      className="tq-input"
                      style={{ flex: 1, fontWeight: 700 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 70 }}>{t('roomDetail.notes')}</label>
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder={t('roomDetail.optionalNotes')}
                      rows={2}
                      className="tq-input"
                      style={{ flex: 1, resize: 'vertical' }}
                    />
                  </div>
                  <div className="task-edit-form" style={{ display: 'flex', alignItems: 'center', gap: '12px 20px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.onDemand')}</label>
                      <input type="checkbox" checked={editForm.onDemand}
                        onChange={(e) => setEditForm(f => ({ ...f, onDemand: e.target.checked }))}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                    </div>
                    {editForm.onDemand && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.showInDashboard')}</label>
                      <input type="checkbox" checked={editForm.showInDashboard}
                        onChange={(e) => setEditForm(f => ({ ...f, showInDashboard: e.target.checked }))}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                    </div>}
                    {editForm.onDemand && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} title={t('repeat.limitDesc')}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('repeat.limit')}</label>
                      <input type="number" min={1} max={99} className="tq-input-compact" value={editForm.repeatLimit} placeholder="∞"
                        onChange={(e) => setEditForm(f => ({ ...f, repeatLimit: e.target.value }))} style={{ width: 52 }} />
                      <select className="tq-input-compact" value={editForm.repeatPeriod} onChange={(e) => setEditForm(f => ({ ...f, repeatPeriod: e.target.value as 'day' | 'week' }))}>
                        <option value="day">{t('repeat.perDay')}</option>
                        <option value="week">{t('repeat.perWeek')}</option>
                      </select>
                    </div>}
                    {!editForm.onDemand && <DueOnPicker allowOnce={allowOneTime} value={editSchedule} onChange={setEditSchedule} t={t} language={language}
                      interval={<FrequencyPicker value={editForm.freqValue} unit={editForm.freqUnit}
                        t={t}
                        onChange={(v, u) => setEditForm(f => ({ ...f, freqValue: v, freqUnit: u }))} />} />}
                    {!editForm.onDemand && editSchedule.mode !== 'once' && <StartsOnPicker value={editSchedule} onChange={setEditSchedule} t={t} />}
                    {!editForm.onDemand && editSchedule.mode !== 'once' && <SeasonPicker value={editSchedule} onChange={setEditSchedule} t={t} language={language} />}
                    {!editForm.onDemand && <ReminderPicker value={editSchedule} onChange={setEditSchedule} t={t} />}
                    <TimerPicker value={editSchedule} onChange={setEditSchedule} t={t} />
                    <StepsField value={editSchedule} onChange={setEditSchedule} t={t} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.effort')}</label>
                      <EffortPicker effort={editForm.effort} onChange={(e) => setEditForm(f => ({ ...f, effort: e }))} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.allowEarlyCompletion')}</label>
                      <input type="checkbox" checked={editForm.allowEarlyCompletion}
                        onChange={(e) => setEditForm(f => ({ ...f, allowEarlyCompletion: e.target.checked }))}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 70 }}>{t('roomDetail.customCoins')}</label>
                    <input
                      type="number"
                      min={1}
                      value={editForm.customCoins}
                      onChange={(e) => setEditForm(f => ({ ...f, customCoins: e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1) }))}
                      placeholder={t('roomDetail.customCoinsPlaceholder')}
                      className="tq-input-compact"
                      style={{ width: 80 }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--warm-text-light)' }}>{t('roomDetail.customCoinsDesc')}</span>
                  </div>
                  {!editForm.onDemand && startsLater(editSchedule) ? <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-muted)' }}>{t('schedule.firstDueOnStart')}</div> : <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('rooms.health')}</label>
                    <div style={{ width: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={10}
                          value={editForm.health}
                          onChange={(e) => setEditForm((f) => ({ ...f, health: parseInt(e.target.value, 10), healthChanged: true }))}
                          style={{ flex: 1, accentColor: healthColor(editForm.health) }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 800, color: healthColor(editForm.health), minWidth: 32, textAlign: 'right' }}>
                          {editForm.health}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--warm-text-light)', fontWeight: 600, marginTop: 2 }}>
                        <span>{t('rooms.dirty')}</span><span>{t('rooms.clean')}</span>
                      </div>
                    </div>
                  </div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('roomDetail.icon')}</label>
                    <IconPicker value={editForm.iconKey} onChange={(k) => setEditForm((f) => ({ ...f, iconKey: k }))} language={language}
                      taskName={editForm.name} roomName={room.name} roomColor={room.color} coins={coinsByEffort?.[editForm.effort]} />
                  </div>
                  {/* Task assignment — only show if room has no room-level assignment */}
                  {!room.assignedUserId && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('rooms.assignTask')}</label>
                        <select
                          value={editForm.assignmentType}
                          onChange={(e) => setEditForm(f => ({ ...f, assignmentType: e.target.value as 'none' | 'users', assignmentUserIds: [], assignmentMode: 'first' }))}
                          className="tq-input-compact"
                          style={{ cursor: 'pointer' }}
                        >
                          <option value="none">{t('rooms.noAssignment')}</option>
                          <option value="users">{t('rooms.specificUsers')}</option>
                        </select>
                      </div>
                      {editForm.assignmentType === 'users' && (
                        <>
                          <div style={{ marginLeft: 70, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {(users || []).map(u => {
                              const checked = editForm.assignmentUserIds.includes(u.id);
                              return (
                                <label key={u.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                                  padding: '5px 10px', borderRadius: 20,
                                  border: `1.5px solid ${checked ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                                  backgroundColor: checked ? 'var(--warm-accent-light)' : 'var(--warm-bg-input)',
                                  fontSize: 12, fontWeight: 700, color: checked ? 'var(--warm-accent)' : 'var(--warm-text)',
                                  fontFamily: 'Nunito', transition: 'all 0.15s ease',
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => setEditForm(f => {
                                      const newIds = checked
                                        ? f.assignmentUserIds.filter(id => id !== u.id)
                                        : [...f.assignmentUserIds, u.id];
                                      return {
                                        ...f,
                                        assignmentUserIds: newIds,
                                        assignmentPercentages: f.assignmentMode === 'custom' ? initPercentages(newIds) : f.assignmentPercentages,
                                      };
                                    })}
                                    style={{ display: 'none' }}
                                  />
                                  {checked && <span style={{ fontSize: 10 }}>✓</span>}
                                  {u.displayName}
                                </label>
                              );
                            })}
                          </div>
                          {editForm.assignmentUserIds.length >= 2 && (
                            <>
                              <div style={{ marginLeft: 70, display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>Mode</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {(['first', 'shared', 'custom', 'rotating'] as const).map(mode => (
                                    <button
                                      key={mode}
                                      onClick={() => {
                                        const newPercentages = mode === 'custom' ? initPercentages(editForm.assignmentUserIds) : editForm.assignmentPercentages;
                                        setEditForm(f => ({ ...f, assignmentMode: mode, assignmentPercentages: newPercentages }));
                                      }}
                                      style={{
                                        padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                        border: `1.5px solid ${editForm.assignmentMode === mode ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                                        backgroundColor: editForm.assignmentMode === mode ? 'var(--warm-accent-light)' : 'transparent',
                                        color: editForm.assignmentMode === mode ? 'var(--warm-accent)' : 'var(--warm-text-light)',
                                        cursor: 'pointer', fontFamily: 'Nunito',
                                      }}
                                    >
                                      {mode === 'first' ? t('rooms.modeFirst') : mode === 'shared' ? t('rooms.modeShared') : mode === 'custom' ? t('rooms.modeCustom') : t('roomDetail.rotating')}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {editForm.assignmentMode === 'rotating' && (
                                <div style={{ marginLeft: 70, marginTop: 4 }}>
                                  <RotationPeriodPicker value={editSchedule} onChange={setEditSchedule} t={t} language={language} />
                                </div>
                              )}
                              {editForm.assignmentMode === 'custom' && (() => {
                                const total = editForm.assignmentUserIds.reduce((s, id) => s + (editForm.assignmentPercentages[id] ?? 0), 0);
                                const totalOk = total === 100;
                                return (
                                  <div style={{ marginLeft: 70, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                    {editForm.assignmentUserIds.map(uid => {
                                      const u = (users || []).find(x => x.id === uid);
                                      if (!u) return null;
                                      return (
                                        <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)', minWidth: 80 }}>{u.displayName}</span>
                                          <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={editForm.assignmentPercentages[uid] ?? 0}
                                            onChange={(e) => setEditForm(f => ({ ...f, assignmentPercentages: { ...f.assignmentPercentages, [uid]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) } }))}
                                            className="tq-input-compact"
                                            style={{ width: 52, textAlign: 'center', fontWeight: 700 }}
                                          />
                                          <span style={{ fontSize: 12, color: 'var(--warm-text-light)' }}>%</span>
                                        </div>
                                      );
                                    })}
                                    <div style={{ fontSize: 11, fontWeight: 700, color: totalOk ? '#22C55E' : '#EF4444' }}>
                                      {t('rooms.totalPercentage').replace('{total}', String(total))} {totalOk ? '✓' : '✗'}
                                    </div>
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <div className="task-edit-form" style={{ display: 'flex', alignItems: 'center', gap: '8px 16px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', cursor: 'pointer' }}>
                      {t('pause.switch')}
                      <input type="checkbox" checked={editForm.paused}
                        onChange={(e) => setEditForm(f => ({ ...f, paused: e.target.checked, pausedUntil: e.target.checked ? f.pausedUntil : '' }))}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                    </label>
                    {editForm.paused && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>
                        {t('pause.untilLabel')}
                        <input type="date" className="tq-input-compact" value={editForm.pausedUntil} min={tomorrowIso()}
                          onChange={(e) => setEditForm(f => ({ ...f, pausedUntil: e.target.value }))} />
                      </label>
                    )}
                    {editForm.paused && (
                      <div style={{ flexBasis: '100%', fontSize: 11, fontWeight: 600, color: 'var(--warm-text-muted)' }}>{t('pause.hint')}</div>
                    )}
                  </div>
                  {(() => {
                    const editCustomTotal = editForm.assignmentMode === 'custom'
                      ? editForm.assignmentUserIds.reduce((s, id) => s + (editForm.assignmentPercentages[id] ?? 0), 0)
                      : 100;
                    const editSaveDisabled = editForm.assignmentMode === 'custom' && editCustomTotal !== 100;
                    return (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                        <button onClick={() => deleteTask(task.id)}
                          className="tq-btn-sm"
                          style={{
                            background: 'none', border: '1.5px solid var(--warm-danger-border)', borderRadius: 10,
                            fontWeight: 700, color: 'var(--warm-danger)',
                            cursor: 'pointer', fontFamily: 'Nunito',
                          }}>{t('roomDetail.deleteTask')}</button>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setEditingTask(null)} className="tq-btn tq-btn-secondary tq-btn-sm">{t('common.cancel')}</button>
                          <button onClick={saveEdit} disabled={editSaveDisabled} className="tq-btn tq-btn-primary tq-btn-sm"
                            style={{ opacity: editSaveDisabled ? 0.5 : 1 }}>{t('common.save')}</button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              </div>
              </div>,
              document.body
            )}
              <div className={`room-task-row${task.pausedAt ? ' room-task-paused' : ''}`} style={{
                display: 'grid', gridTemplateColumns: TASK_COLUMNS,
                gap: 12, padding: '16px 8px', alignItems: 'center',
                borderBottom: '1px solid var(--warm-border-subtle)',
                backgroundColor: animatedTask === task.id ? 'var(--health-green-bg)' : task.pausedAt ? 'var(--warm-bg-subtle)' : 'transparent',
                transition: 'all 0.3s ease', borderRadius: 12,
              }}>
                <div className="room-task-main" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 34, height: 34, borderRadius: 11,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'var(--warm-bg-subtle)', border: '1px solid var(--warm-border)',
                    flexShrink: 0,
                    marginLeft: -8,
                    alignSelf: 'center',
                  }}>
                    <TaskIcon iconKey={task.iconKey} size={24} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>
                      {translateTask(task.name, task.translationKey)}
                    </div>
                    {task.notes && (
                      <div style={{ fontSize: 11, color: 'var(--warm-text-muted)', fontWeight: 600, marginTop: 2 }}>
                        {task.notes}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                      {timeAgo(task.lastCompletedAt)}{startsLater(task) ? ` · 📅 ${t('schedule.startsLabel').replace('{date}', new Date(`${task.startsOn}T12:00:00`).toLocaleDateString(localeFor(language), { weekday: 'short', month: 'short', day: 'numeric' }))}` : ''}{task.outOfSeason && task.seasonStartMonth && task.seasonEndMonth ? ` · ${t('schedule.offSeason')} (${seasonLabel(task.seasonStartMonth, task.seasonEndMonth, language)})` : task.isSeasonal ? ` · ${t('roomDetail.seasonal')}` : ''}{task.onDemand ? ` · ${t('roomDetail.onDemand')}` : ''}{task.onDemand && task.repeatLimit ? ` · ${task.myRepeatCount ?? 0}/${task.repeatLimit} ${t(task.repeatPeriod === 'day' ? 'repeat.today' : 'repeat.thisWeek')}` : ''}
                    </div>
                  </div>
                </div>
                <div className="room-task-health"><HealthBar value={animatedTask === task.id ? 100 : task.health} height={8} animate={animatedTask === task.id} /></div>
                <div className="room-task-frequency" style={{ fontSize: 13, color: 'var(--warm-text-secondary)', fontWeight: 600 }}>
                  {task.onDemand
                    ? <span style={{ color: 'var(--warm-accent)', fontWeight: 700 }}>{t('roomDetail.onDemand')}</span>
                    : task.oneTime
                      ? <span style={{ color: 'var(--warm-accent)', fontWeight: 700 }}>{t('schedule.once')}</span>
                    : monthlyLabel(task, t, language)
                      ? <>{monthlyLabel(task, t, language)}</>
                    : task.scheduleWeekdays
                      ? <>{weekdaysLabel(task.scheduleWeekdays, language, weekStart)}</>
                      : <>{t('roomDetail.every')} {formatFreq(task.frequencyDays, t)}</>
                  }
                </div>
                <div className="room-task-effort"><EffortDots effort={task.effort} /></div>
                <div className="room-task-coins" style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <CoinIcon />{taskCoins(task)}
                </div>
                {task.pausedAt
                  ? <div className="room-task-due" style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text-secondary)' }}>{pausedLabel(task)}</div>
                  : task.onDemand
                  ? <div className="room-task-due" style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)' }}>—</div>
                  : task.outOfSeason
                  ? <div className="room-task-due" style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('schedule.offSeason')}</div>
                  : task.oneTime
                  ? <div className="room-task-due" style={{ fontSize: 12, fontWeight: 700, color: task.health <= 0 ? 'var(--health-red)' : 'var(--warm-text-light)' }}>
                      {task.health <= 0 ? t('todos.overdue') : task.doBy ? t('todos.byDate').replace('{date}', new Date(`${task.doBy}T12:00:00`).toLocaleDateString(localeFor(language), { month: 'short', day: 'numeric' })) : '—'}
                    </div>
                  : (() => { const { text, color } = formatNextDue(task.lastCompletedAt, task.frequencyDays, t, language, task.health, task.nextDueAt); return (
                      <div className="room-task-due" style={{ fontSize: 12, fontWeight: 700, color }}>{text}</div>
                    ); })()
                }
                <div className="room-task-assigned" style={{ fontSize: 12, color: 'var(--warm-text-secondary)', fontWeight: 600 }}>
                  {task.assignedUsers && task.assignedUsers.length > 0
                    ? <span>
                        {task.assignmentMode === 'custom'
                          ? task.assignedUsers.map(u => `${u.displayName} (${u.coinPercentage ?? 0}%)`).join(' + ')
                          : task.assignedUsers.map(u => u.displayName).join(' + ')
                        }
                        {(task.assignmentMode === 'shared' || task.assignmentMode === 'custom') && task.assignedUsers && task.assignedUsers.length >= 2 && (
                          <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 600, marginTop: 2 }}>
                            {task.assignmentMode === 'shared' ? t('rooms.modeShared') : t('rooms.modeCustom')} · {task.sharedCompletions?.length || 0}/{task.assignedUsers.length} {t('rooms.done')}
                          </div>
                        )}
                        {task.assignmentMode === 'rotating' && task.rotationCurrentUserId !== undefined && (
                          <div style={{ fontSize: 10, color: 'var(--warm-accent)', fontWeight: 700, marginTop: 2 }}>
                            🔄 {task.assignedUsers.find(u => u.id === task.rotationCurrentUserId)?.displayName || '?'}{task.rotationPeriod === 'week' ? ` · ${t('repeat.thisWeek')}` : ''}
                          </div>
                        )}
                      </span>
                    : room.assignedUserId
                      ? (() => {
                          const roomOwner = (users || []).find(u => u.id === room.assignedUserId);
                          return roomOwner
                            ? <span style={{ color: 'var(--warm-text-light)', fontStyle: 'italic' }}>{roomOwner.displayName}</span>
                            : <span style={{ color: 'var(--warm-text-light)', opacity: 0.5 }}>—</span>;
                        })()
                      : <span style={{ color: 'var(--warm-text-light)', opacity: 0.5 }}>—</span>
                  }
                </div>
                <div className="room-task-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', justifyContent: 'flex-end', alignItems: 'center', position: 'relative' }}>
                  <div className="room-task-tools" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button onClick={() => togglePin(task)} className="tq-btn-sm" aria-pressed={!!task.pinned}
                    title={task.pinned ? t('home.unpin') : t('home.pin')} aria-label={task.pinned ? t('home.unpin') : t('home.pin')}
                    style={{ background: 'none', border: '1.5px solid var(--warm-border)', borderRadius: 10, cursor: 'pointer', fontSize: 14, color: task.pinned ? 'var(--warm-accent)' : 'var(--warm-text-light)' }}>
                    {task.pinned ? '★' : '☆'}
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => startEdit(task)}
                        className="tq-btn-sm"
                        style={{
                          background: 'none', border: '1.5px solid var(--warm-border)', borderRadius: 10,
                          fontWeight: 700, color: 'var(--warm-text-muted)',
                          cursor: 'pointer', fontFamily: 'Nunito',
                        }}>{t('common.edit')}</button>
                      <div className="room-task-more" style={{ position: 'relative' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (taskMenuOpen === task.id) { setTaskMenuOpen(null); setMoveMenuTaskId(null); } else { handleTaskMenuOpen(task.id); setMoveMenuTaskId(null); } }}
                          className="tq-btn-sm room-task-more-btn"
                          style={{ background: 'none', border: '1.5px solid var(--warm-border)', borderRadius: 10, color: 'var(--warm-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title={t('roomDetail.moreOptions')} aria-label={t('roomDetail.moreOptions')}
                          aria-haspopup="menu" aria-expanded={taskMenuOpen === task.id}
                        >
                          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor"><circle cx="4" cy="10" r="2" /><circle cx="10" cy="10" r="2" /><circle cx="16" cy="10" r="2" /></svg>
                        </button>
                        {taskMenuOpen === task.id && (
                          <div className="room-task-menu"
                            style={{ position: 'absolute', right: 0, top: '100%', zIndex: 100, background: 'var(--warm-card)', border: '1.5px solid var(--warm-border)', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.14)', minWidth: 180, overflow: 'hidden' }}
                          >
                            <button
                              onClick={() => handleDuplicateTask(task.id)}
                              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--warm-text)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito' }}
                            >{t('roomDetail.duplicateTask')}</button>
                            <button
                              onClick={() => setMoveMenuTaskId(moveMenuTaskId === task.id ? null : task.id)}
                              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--warm-text)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito', borderTop: '1px solid var(--warm-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                              <span>{t('roomDetail.moveToRoom')}</span>
                              <span style={{ fontSize: 10, opacity: 0.6 }}>{moveMenuTaskId === task.id ? '▲' : '▼'}</span>
                            </button>
                            {moveMenuTaskId === task.id && (
                              <div style={{ borderTop: '1px solid var(--warm-border-subtle)', background: 'var(--warm-bg-subtle)' }}>
                                {allRooms.filter(r => r.id !== room.id).map(r => (
                                  <button key={r.id}
                                    onClick={() => handleMoveTask(task.id, r.id)}
                                    style={{ width: '100%', textAlign: 'left', padding: '8px 18px', fontSize: 12, fontWeight: 600, color: 'var(--warm-text)', background: 'none', border: 'none', borderBottom: '1px solid var(--warm-border-subtle)', cursor: 'pointer', fontFamily: 'Nunito' }}
                                  >{roomDisplayName(r.name, r.roomType)}</button>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => togglePause(task)}
                              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--warm-text)', background: 'none', border: 'none', borderTop: '1px solid var(--warm-border-subtle)', cursor: 'pointer', fontFamily: 'Nunito' }}
                            >{task.pausedAt ? t('pause.resume') : t('pause.pause')}</button>
                            <button
                              onClick={() => { setTaskMenuOpen(null); setMoveMenuTaskId(null); }}
                              style={{ width: '100%', textAlign: 'center', padding: '8px 14px', fontSize: 11, fontWeight: 600, color: 'var(--warm-text-muted)', background: 'none', border: 'none', borderTop: '1px solid var(--warm-border-subtle)', cursor: 'pointer', fontFamily: 'Nunito' }}
                            >{t('common.cancel')}</button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {isAdmin && task.completedTodayBy?.completionId && (
                    <button
                      onClick={async () => {
                        const by = task.completedTodayBy!;
                        const ask = t('roomDetail.undoDoneConfirm').replace('{task}', translateTask(task.name, task.translationKey))
                          .replace('{name}', by.displayName).replace('{coins}', String(by.coinsEarned ?? 0));
                        if (!window.confirm(ask)) return;
                        await attempt(async () => {
                          await api.cancelCompletion(by.completionId);
                          onRefresh?.();
                        });
                      }}
                      title={t('roomDetail.undoDoneTitle')}
                      className="tq-btn-sm"
                      style={{
                        background: 'none', border: '1.5px solid var(--warm-border)', borderRadius: 10,
                        fontWeight: 700, color: 'var(--warm-text-muted)', cursor: 'pointer', fontFamily: 'Nunito', whiteSpace: 'nowrap',
                      }}
                    >↩️ {t('roomDetail.undoDone')}</button>
                  )}
                  </div>
                  {!task.pausedAt && <div className="room-task-done" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {(() => {
                    const btn = getDoneButtonState(task);
                    // Kids start the timer first; Done comes when it ends (NEW-1)
                    const waitForTimer = !!timer?.mustWait(task);
                    return (
                      <>
                      <TeamUpButton info={task.teamUp} onClick={() => setTeamPick(task)} language={language} />
                      <TakeBackButton completionId={task.myPendingId} onDone={() => onRefresh?.()} language={language} />
                      {canAddProof && !btn.disabled && !waitForTimer && (
                        <button onClick={() => setProofTask(task)} className="tq-btn tq-btn-secondary tq-btn-sm" title={t('proof.addProof')} aria-label={t('proof.addProof')}>📎</button>
                      )}
                      {btn.label !== t('app.notAssigned') && !claimedLabel(task.teamUp) && (
                        <button onClick={() => setLateTask(task)} className="tq-btn tq-btn-secondary tq-btn-sm" title={t('late.button')} aria-label={t('late.button')}>📅</button>
                      )}
                      {!btn.disabled && <TimerStartButton task={{ ...task, name: translateTask(task.name, task.translationKey) }} language={language} primary={waitForTimer} />}
                      {!(waitForTimer && !btn.disabled) && <button
                        onClick={() => !btn.disabled && handleComplete(task)}
                        disabled={btn.disabled}
                        className={btn.disabled ? 'tq-btn tq-btn-sm' : 'tq-btn tq-btn-primary tq-btn-sm'}
                        style={{
                          ...(btn.disabled ? {
                            opacity: 0.55, cursor: 'default',
                            backgroundColor: 'var(--warm-bg-subtle)',
                            border: '1.5px solid var(--warm-border)',
                            color: 'var(--warm-text-muted)',
                          } : {}),
                        }}
                      >
                        {btn.disabled ? btn.label : <><CheckIcon /> {btn.label}</>}
                      </button>}
                      </>
                    );
                  })()}
                  </div>}
                </div>
              </div>

          </div>
        ))}
        </div>{/* end room-table-scroll */}

        {/* Add Task */}
        {isAdmin && showAddTask ? (
          <div style={{
            padding: '16px 8px', borderTop: '1px solid var(--warm-border-subtle)',
            backgroundColor: 'var(--warm-bg-warm)', borderRadius: 12, marginTop: 4,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 70 }}>{t('roomDetail.name')}</label>
                <input value={newTaskName}
                  onChange={(e) => { setNewTaskName(e.target.value); setAddTaskError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && addTask()}
                  placeholder={t('roomDetail.taskName')}
                  className="tq-input"
                  style={{ flex: 1, fontWeight: 700, borderColor: addTaskError ? 'var(--health-red)' : undefined }} />
              </div>
              {addTaskError && <div style={{ fontSize: 11, color: 'var(--health-red)', fontWeight: 600, marginLeft: 82 }}>{addTaskError}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 70 }}>{t('roomDetail.notes')}</label>
                <textarea value={newTaskNotes}
                  onChange={(e) => setNewTaskNotes(e.target.value)}
                  placeholder={t('roomDetail.optionalNotes')}
                  rows={2}
                  className="tq-input"
                  style={{ flex: 1, resize: 'vertical' }} />
              </div>
              <div className="task-add-form" style={{ display: 'flex', alignItems: 'center', gap: '12px 20px', flexWrap: 'wrap', minHeight: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.onDemand')}</label>
                  <input type="checkbox" checked={newTaskOnDemand}
                    onChange={(e) => setNewTaskOnDemand(e.target.checked)}
                    style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                </div>
                {newTaskOnDemand && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.showInDashboard')}</label>
                  <input type="checkbox" checked={newTaskShowInDashboard}
                    onChange={(e) => setNewTaskShowInDashboard(e.target.checked)}
                    style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--warm-accent)' }} />
                </div>}
                {newTaskOnDemand && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} title={t('repeat.limitDesc')}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('repeat.limit')}</label>
                  <input type="number" min={1} max={99} className="tq-input-compact" value={newRepeatLimit} placeholder="∞" onChange={(e) => setNewRepeatLimit(e.target.value)} style={{ width: 52 }} />
                  <select className="tq-input-compact" value={newRepeatPeriod} onChange={(e) => setNewRepeatPeriod(e.target.value as 'day' | 'week')}>
                    <option value="day">{t('repeat.perDay')}</option>
                    <option value="week">{t('repeat.perWeek')}</option>
                  </select>
                </div>}
                {!newTaskOnDemand && <DueOnPicker allowOnce={allowOneTime} value={newSchedule} onChange={setNewSchedule} t={t} language={language}
                  interval={<FrequencyPicker value={newFreqValue} unit={newFreqUnit}
                    t={t}
                    onChange={(v, u) => { setNewFreqValue(v); setNewFreqUnit(u); }} />} />}
                {!newTaskOnDemand && newSchedule.mode !== 'once' && <StartsOnPicker value={newSchedule} onChange={setNewSchedule} t={t} />}
                {!newTaskOnDemand && newSchedule.mode !== 'once' && <SeasonPicker value={newSchedule} onChange={setNewSchedule} t={t} language={language} />}
                {!newTaskOnDemand && <ReminderPicker value={newSchedule} onChange={setNewSchedule} t={t} />}
                <TimerPicker value={newSchedule} onChange={setNewSchedule} t={t} />
                <StepsField value={newSchedule} onChange={setNewSchedule} t={t} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('roomDetail.effort')}</label>
                  <EffortPicker effort={newTaskEffort} onChange={setNewTaskEffort} />
                </div>
              </div>
              {!newTaskOnDemand && startsLater(newSchedule) ? <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-muted)' }}>{t('schedule.firstDueOnStart')}</div> : <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('rooms.health')}</label>
                <div style={{ width: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={10}
                      value={newTaskHealth}
                      onChange={(e) => setNewTaskHealth(parseInt(e.target.value, 10))}
                      style={{ flex: 1, accentColor: healthColor(newTaskHealth) }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 800, color: healthColor(newTaskHealth), minWidth: 32, textAlign: 'right' }}>
                      {newTaskHealth}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--warm-text-light)', fontWeight: 600, marginTop: 2 }}>
                    <span>{t('rooms.dirty')}</span><span>{t('rooms.clean')}</span>
                  </div>
                </div>
              </div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('roomDetail.icon')}</label>
                <IconPicker value={newTaskIconKey} onChange={setNewTaskIconKey} language={language}
                  taskName={newTaskName} roomName={room.name} roomColor={room.color} coins={coinsByEffort?.[newTaskEffort]} />
              </div>
              {!room.assignedUserId && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>{t('rooms.assignRoom')}</label>
                    <select
                      value={newAssignmentType}
                      onChange={(e) => { setNewAssignmentType(e.target.value as 'none' | 'users'); setNewAssignmentUserIds([]); setNewAssignmentMode('first'); }}
                      className="tq-input-compact"
                      style={{ cursor: 'pointer' }}
                    >
                      <option value="none">{t('rooms.noAssignment')}</option>
                      <option value="users">{t('rooms.specificUsers')}</option>
                    </select>
                  </div>
                  {newAssignmentType === 'users' && (
                    <>
                      <div style={{ marginLeft: 70, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {(users || []).map(u => {
                          const checked = newAssignmentUserIds.includes(u.id);
                          return (
                            <label key={u.id} style={{
                              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                              padding: '5px 10px', borderRadius: 20,
                              border: `1.5px solid ${checked ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                              backgroundColor: checked ? 'var(--warm-accent-light)' : 'var(--warm-bg-input)',
                              fontSize: 12, fontWeight: 700, color: checked ? 'var(--warm-accent)' : 'var(--warm-text)',
                              fontFamily: 'Nunito', transition: 'all 0.15s ease',
                            }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const newIds = checked
                                    ? newAssignmentUserIds.filter(id => id !== u.id)
                                    : [...newAssignmentUserIds, u.id];
                                  setNewAssignmentUserIds(newIds);
                                  if (newAssignmentMode === 'custom') setNewAssignmentPercentages(initPercentages(newIds));
                                }}
                                style={{ display: 'none' }}
                              />
                              {checked && <span style={{ fontSize: 10 }}>✓</span>}
                              {u.displayName}
                            </label>
                          );
                        })}
                      </div>
                      {newAssignmentUserIds.length >= 2 && (
                        <>
                          <div style={{ marginLeft: 70, display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', minWidth: 58 }}>Mode</label>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {(['first', 'shared', 'custom', 'rotating'] as const).map(mode => (
                                <button
                                  key={mode}
                                  onClick={() => {
                                    setNewAssignmentMode(mode);
                                    if (mode === 'custom') setNewAssignmentPercentages(initPercentages(newAssignmentUserIds));
                                  }}
                                  style={{
                                    padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                    border: `1.5px solid ${newAssignmentMode === mode ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                                    backgroundColor: newAssignmentMode === mode ? 'var(--warm-accent-light)' : 'transparent',
                                    color: newAssignmentMode === mode ? 'var(--warm-accent)' : 'var(--warm-text-light)',
                                    cursor: 'pointer', fontFamily: 'Nunito',
                                  }}
                                >
                                  {mode === 'first' ? t('rooms.modeFirst') : mode === 'shared' ? t('rooms.modeShared') : mode === 'custom' ? t('rooms.modeCustom') : t('roomDetail.rotating')}
                                </button>
                              ))}
                            </div>
                          </div>
                          {newAssignmentMode === 'rotating' && (
                            <div style={{ marginLeft: 70, marginTop: 4 }}>
                              <RotationPeriodPicker value={newSchedule} onChange={setNewSchedule} t={t} language={language} />
                            </div>
                          )}
                          {newAssignmentMode === 'custom' && (() => {
                            const total = newAssignmentUserIds.reduce((s, id) => s + (newAssignmentPercentages[id] ?? 0), 0);
                            const totalOk = total === 100;
                            return (
                              <div style={{ marginLeft: 70, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                {newAssignmentUserIds.map(uid => {
                                  const u = (users || []).find(x => x.id === uid);
                                  if (!u) return null;
                                  return (
                                    <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)', minWidth: 80 }}>{u.displayName}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={newAssignmentPercentages[uid] ?? 0}
                                        onChange={(e) => setNewAssignmentPercentages(p => ({ ...p, [uid]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }))}
                                        className="tq-input-compact"
                                        style={{ width: 52, textAlign: 'center', fontWeight: 700 }}
                                      />
                                      <span style={{ fontSize: 12, color: 'var(--warm-text-light)' }}>%</span>
                                    </div>
                                  );
                                })}
                                <div style={{ fontSize: 11, fontWeight: 700, color: totalOk ? '#22C55E' : '#EF4444' }}>
                                  {t('rooms.totalPercentage').replace('{total}', String(total))} {totalOk ? '✓' : '✗'}
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
              {(() => {
                const addCustomTotal = newAssignmentMode === 'custom'
                  ? newAssignmentUserIds.reduce((s, id) => s + (newAssignmentPercentages[id] ?? 0), 0)
                  : 100;
                const addSaveDisabled = newAssignmentMode === 'custom' && addCustomTotal !== 100;
                return (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowAddTask(false); setNewTaskName(''); setNewTaskNotes(''); setNewTaskHealth(100); setNewTaskIconKey('sparkle'); setNewAssignmentType('none'); setNewAssignmentUserIds([]); setNewAssignmentMode('first'); setNewAssignmentPercentages({}); }}
                      className="tq-btn tq-btn-secondary tq-btn-sm">{t('common.cancel')}</button>
                    <button onClick={addTask} disabled={addSaveDisabled} className="tq-btn tq-btn-primary tq-btn-sm"
                      style={{ opacity: addSaveDisabled ? 0.5 : 1 }}>{t('roomDetail.addTask')}</button>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : isAdmin ? (
          <div style={{ padding: '14px 8px', display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAddTask(true)}
              className="tq-btn-md"
              style={{
                background: 'none', border: '1.5px dashed var(--warm-border)', borderRadius: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                fontWeight: 700, color: 'var(--warm-text-light)', fontFamily: 'Nunito', flex: 1,
                justifyContent: 'center',
              }}>
              <PlusIcon /> {t('roomDetail.addTask')}
            </button>
            <button onClick={() => {
              setShowTemplates(true);
              setTemplateLoading(true);
              api.getDefaultTasks(room.roomType).then((defaults) => {
                const existingNames = new Set(room.tasks.map(t => t.name.toLowerCase()));
                setTemplateTasks(defaults.map(d => ({
                  ...d, translationKey: (d as any).translationKey, iconKey: (d as any).iconKey,
                  selected: false,
                })).filter(d => !existingNames.has(d.name.toLowerCase())));
                setTemplateLoading(false);
              }).catch(() => { setTemplateTasks([]); setTemplateLoading(false); });
            }}
              className="tq-btn-md"
              style={{
                background: 'none', border: '1.5px dashed var(--warm-border)', borderRadius: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                fontWeight: 700, color: 'var(--warm-text-light)', fontFamily: 'Nunito',
                justifyContent: 'center', padding: '0 16px',
              }}>
              {t('roomDetail.addFromTemplates')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
    {teamPick && (
      <TeamUpDialog task={{ id: teamPick.id, name: translateTask(teamPick.name, teamPick.translationKey) }} language={language}
        people={(users ?? []).filter((u) => u.id !== currentUserId && ((teamPick.effectiveAssignedUserIds ?? []).length === 0 || teamPick.effectiveAssignedUserIds!.includes(u.id)))}
        onClose={() => setTeamPick(null)} onStarted={() => onRefresh?.()} />
    )}
    {proofTask && (
      <ProofModal
        taskTitle={translateTask(proofTask.name, proofTask.translationKey)}
        language={language}
        onClose={() => setProofTask(null)}
        onSubmit={async (proof) => { onCompleteTask(proofTask.id, proof); setProofTask(null); }}
      />
    )}
    {lateTask && (() => {
      // Admins and members can say who did it: the chore's people, or everyone
      const canPick = currentUserRole === 'admin' || currentUserRole === 'member';
      const ids = lateTask.effectiveAssignedUserIds ?? [];
      const all = users ?? [];
      const others = all.filter((u) => u.id !== currentUserId && (ids.length > 0 ? ids.includes(u.id) : !lateTask.assignedToChildren || u.role === 'child'));
      const me = all.find((u) => u.id === currentUserId);
      return (
        <LateLogModal
          task={{ id: lateTask.id, title: translateTask(lateTask.name, lateTask.translationKey) }}
          people={canPick && me ? [me, ...others] : []}
          currentUserId={currentUserId}
          isParent={currentUserRole === 'admin'}
          language={language}
          onClose={() => setLateTask(null)}
          onLogged={(r) => { if (r.newAchievements?.length) onAchievementsUnlocked?.(r.newAchievements); onRefresh?.(); }}
        />
      );
    })()}
    {adminModalTask && (
      <AdminCompleteModal
        task={adminModalTask}
        allUsers={(users || []) as any[]}
        language={language}
        onConfirm={handleAdminModalConfirm}
        onClose={() => setAdminModalTask(null)}
      />
    )}
    {showTemplates && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={(e) => { if (e.target === e.currentTarget) setShowTemplates(false); }}>
        <div className="tq-card" style={{ padding: 24, width: 420, maxWidth: 'calc(100vw - 24px)', maxHeight: '80vh', overflow: 'auto' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: '0 0 16px' }}>
            {t('roomDetail.addFromTemplates')}
          </h3>
          {templateLoading ? (
            <p style={{ fontSize: 13, color: 'var(--warm-text-light)', textAlign: 'center', padding: 20 }}>...</p>
          ) : templateTasks.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--warm-text-light)', textAlign: 'center', padding: 20 }}>
              {t('roomDetail.noTemplates')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templateTasks.map((tt, i) => (
                <label key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 12, minHeight: 44,
                  border: `1.5px solid ${tt.selected ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                  backgroundColor: tt.selected ? 'var(--warm-accent-light)' : 'var(--warm-bg-subtle)',
                  transition: 'all 0.15s ease',
                }}>
                  <input type="checkbox" checked={tt.selected}
                    onChange={() => {
                      setTemplateTasks(prev => prev.map((t, j) => j === i ? { ...t, selected: !t.selected } : t));
                    }}
                    style={{ width: 16, height: 16, accentColor: 'var(--warm-accent)', cursor: 'pointer' }} />
                  <TaskIcon iconKey={tt.iconKey || 'sparkle'} size={20} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--warm-text)' }}>
                    {translateTask(tt.name, tt.translationKey)}
                  </span>
                  <EffortDots effort={tt.effort} />
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="tq-btn tq-btn-secondary" onClick={() => setShowTemplates(false)}
              style={{ flex: 1 }}>{t('common.cancel')}</button>
            <button className="tq-btn tq-btn-primary" disabled={templateAdding || !templateTasks.some(t => t.selected)}
              onClick={async () => {
                setTemplateAdding(true);
                const selected = templateTasks.filter(t => t.selected);
                for (const tt of selected) {
                  await api.createTask(room.id, {
                    name: tt.name, effort: tt.effort,
                    frequencyDays: tt.frequencyDays,
                    iconKey: tt.iconKey || 'sparkle',
                    translationKey: tt.translationKey,
                  });
                }
                setTemplateAdding(false);
                setShowTemplates(false);
                onRefresh?.();
              }}
              style={{ flex: 1 }}>
              {templateAdding ? '...' : `${t('roomDetail.addTask')} (${templateTasks.filter(t => t.selected).length})`}
            </button>
          </div>
        </div>
      </div>
    )}
    <UndoToast undo={undo} language={language} onClose={closeUndo} onRestored={() => onRefresh?.()} />
    </>
  );
}
