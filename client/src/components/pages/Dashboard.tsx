import React, { useState, useEffect, useCallback } from 'react';
import HealthBar from '../shared/HealthBar';
import { LevelStrip } from '../shared/LevelStrip';
import { TodoQuickAdd } from '../shared/TodoQuickAdd';
import { localeFor } from '../../utils/locale';
import type { BadgeItem, LevelInfo } from '../../utils/badges';
import RingGauge from '../shared/RingGauge';
import UserAvatar from '../shared/UserAvatar';
import { FireIcon, CoinIcon, CheckIcon } from '../icons/UIIcons';
import { ShieldPanel } from '../shared/StreakShields';
import { getRoomIcon } from '../icons/RoomIcons';
import { TaskIcon } from '../icons/TaskIcons';
import { getHealthColor } from '../../utils/health';
import { useTranslation } from '../../hooks/useTranslation';
import { isTaskForUser, taskCoins } from '../../utils/tasks';
import { useTaskView } from '../../hooks/useTaskView';
import { AllMineToggle } from '../shared/AllMineToggle';
import { PendingApprovals, type PendingItem } from '../shared/PendingApprovals';
import { ProofModal, type Proof } from '../shared/ProofModal';
import type { CheerSummary, CoinBoost, FeatureFlags, TeamUpInfo, TeamupItem } from '../../hooks/useApi';
import { CheerBar } from '../shared/CheerBar';
import { MascotCard, type MascotData, type MascotSuggestion } from '../mascot/MascotCard';
import { TeamUpButton, TeamUpDialog, TeamUpsCard } from '../shared/TeamUp';
import { claimedLabel } from '../../utils/teamups';
import { formatCoins } from '../../utils/format';
import { AdminCompleteModal } from '../shared/AdminCompleteModal';
import { api } from '../../hooks/useApi';
import { TakeBackButton } from '../shared/TakeBackButton';
import { UndoToast, type UndoState } from '../shared/UndoToast';
import { BoostDetails } from '../shared/BoostDetails';
import type { FocusData } from './Focus';
import { HomeLayoutEditor } from '../shared/HomeLayoutEditor';
import { KID_CARDS, LEGACY_HIDDEN_KEY, legacyHidden, moveCard, placeCard, resolveOrder, type HomeCardId, type HomeLayout } from '../../utils/homeLayout';
import { TimerStartButton } from '../shared/ChoreTimer';
import { useChoreTimer } from '../../hooks/useChoreTimer';
import type { ListRoom } from './TaskList';

/* ── Types ── */

interface Room {
  id: number;
  name: string;
  roomType: string;
  color: string;
  accentColor: string;
  health: number;
  taskCount: number;
  criticalCount: number;
}

interface Quest {
  /** Countdown timer in minutes (NEW-1), null = none */
  timerMinutes?: number | null;
  id: number;
  name: string;
  translationKey?: string;
  iconKey?: string;
  health: number;
  effort: number;
  roomId: number;
  roomName: string;
  roomColor: string;
  roomAccent: string;
  lastCompletedAt: string | null;
  isSeasonal: boolean;
  onDemand?: boolean;
  /** One-time chore (the To-do card) */
  oneTime?: number | boolean;
  doBy?: string | null;
  overdue?: boolean;
  /** Your usual: pinned by the viewer */
  pinned?: boolean;
  /** Maybe you forgot: whole days overdue */
  overdueDays?: number;
  frequencyDays: number;
  dueDate?: string;
  dueInDays?: number;
  assignedToChildren?: boolean;
  effectiveAssignedUserId?: number | null;
  effectiveAssignedUserIds?: number[];
  assignedUsers?: Array<{ id: number; displayName: string; avatarColor: string; avatarType?: string; avatarPreset?: string; avatarPhotoUrl?: string }>;
  assignmentMode?: 'first' | 'shared';
  sharedCompletions?: Array<{ userId: number; displayName: string }>;
  completedTodayBy?: { userId: number; displayName: string; avatarColor: string } | null;
  /** Team-ups: can you start one, and has a team claimed it today? */
  teamUp?: TeamUpInfo | null;
  /** The viewer's own completions of this task still waiting for a parent (Strict Mode) */
  myPendingCount?: number;
  /** My latest Done that waits for approval (I can take it back) */
  myPendingId?: number | null;
  notes?: string | null;
  customCoins?: number | null;
  repeatLimit?: number | null;
  repeatPeriod?: 'day' | 'week' | null;
  myRepeatCount?: number;
}

interface CurrentUser {
  id: number;
  role?: 'admin' | 'member' | 'child';
  displayName: string;
  coins: number;
  goalCoins?: number | null;
  currentStreak: number;
  streakShields?: number;
  avatarColor: string;
  lastActiveDate?: string | null;
  taskView?: 'all' | 'mine' | 'mineOnly';
  kidMode?: number | boolean;
  /** Card order and hidden cards (ENH-6); null = the default */
  homeLayout?: HomeLayout | null;
}

interface ActivityEntry {
  userId?: number;
  displayName: string;
  avatarColor: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
  taskName: string;
  translationKey?: string;
  roomId: number;
  roomName: string;
  completedAt: string;
  coinsEarned: number;
}

interface FamilyMember {
  id: number;
  displayName: string;
  avatarColor: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
  coins: number;
  currentStreak: number;
  points: number;
}

interface CompletedTodayEntry {
  completionId: number;
  userId: number;
  approvalNote?: string | null;
  cheers?: CheerSummary;
  completedAt: string;
  coinsEarned: number;
  taskId: number;
  name: string;
  translationKey?: string;
  iconKey?: string;
  roomId: number;
  roomName: string;
  roomType?: string;
  roomColor: string;
  roomAccent: string;
  displayName: string;
  avatarColor: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
}

interface DashboardProps {
  data: {
    houseHealth: number;
    rooms: Room[];
    todaysQuests: Quest[];
    nextTasks: Quest[];
    readyToComplete?: Quest[];
    scheduledUpcoming?: Quest[];
    onDemandQuests?: Quest[];
    /** One-time chores still to do */
    todoQuests?: Quest[];
    /** The viewer's pins, then what they do most */
    usualQuests?: Quest[];
    /** Chores overdue by at least their own interval, worst first */
    forgottenQuests?: Quest[];
    /** Today's Rescue Mission: the chore that pays extra to the first one who does it */
    rescueMission?: { day: string; taskId: number | null; multiplier: number; completedBy: number | null; completedByName: string | null; taskName: string | null; task: Quest | null } | null;
    /** Parents: chores they can choose as the mission instead */
    rescueChoices?: Array<{ id: number; name: string }>;
    /** One thing at a time: null when it's off for this person (NEW-2) */
    focus?: FocusData | null;
    /** Optional extras switched on or off in Settings → Features */
    features?: Partial<FeatureFlags>;
    nextUnlock?: { level: number; kind: string; id: string } | null;
    mascot?: MascotData | null;
    teamups?: TeamupItem[];
    completedToday?: CompletedTodayEntry[];
    myLevel?: LevelInfo | null;
    nextBadge?: BadgeItem | null;
    myGoal?: { goalCoins: number; currentCoins: number; progress: number; goalStartAt?: string | null; goalEndAt?: string | null; completed?: boolean; rewardCoins?: number; title?: string | null } | null;
    /** Double coins events running now */
    coinBoosts?: CoinBoost[];
    childrenGoals?: Array<{ id: number; displayName: string; role: string; coins: number; currentCoins?: number; goalCoins: number | null; progress: number | null; goalStartAt?: string | null; goalEndAt?: string | null }>;
    pendingRewardRequests?: Array<{ id: number; title: string; displayName: string; costCoins: number; redeemedAt: string; status: 'requested' | 'approved' | 'rejected' }>;
    /** Chores waiting for a parent (admins only) */
    pendingCompletions?: PendingItem[];
    strictMode?: boolean;
    /** Streak shields: null when they're off */
    shields?: { price: number; max: number; every: number } | null;
    currentUser: CurrentUser;
    recentActivity: ActivityEntry[];
    badges?: Record<number, string | null>;
  };
  family: FamilyMember[];
  users?: Array<{ id: number; displayName: string; role: string; avatarColor: string; avatarType?: string; avatarPreset?: string; avatarPhotoUrl?: string }>;
  language?: string;
  onCompleteTask: (taskId: number, proof?: Proof) => void;
  onRefresh?: () => void;
  /** Coins changed outside a chore (a streak shield bought): refresh the header's total */
  onCoinsChanged?: () => void;
  /** Every room with its chores (the dashboard's own rooms are summaries), for a double coins event's chore list */
  allRooms?: ListRoom[];
  onNavigateToRoom: (roomId: number) => void;
  /** Open a task in its room, scrolled to and highlighted */
  onOpenTask?: (roomId: number, taskId: number) => void;
  coinsByEffort?: Record<number, number>;
  onNavigateToActivity: () => void;
  onNavigateToRewards?: () => void;
  onOpenFocus?: () => void;
  onRewardRequestAction: (id: number, status: 'approved' | 'rejected') => void | Promise<void>;
  gamificationEnabled?: boolean;
  leaderboardPeriod?: 'week' | 'month' | 'quarter' | 'year';
  /** The holiday showing now dresses the mascot (seasons.ts costume) */
  seasonCostume?: string | null;
}

/* ── Component ── */

const Dashboard: React.FC<DashboardProps> = ({
  data,
  family,
  users,
  language,
  onCompleteTask,
  onRefresh,
  onCoinsChanged,
  allRooms = [],
  onNavigateToRoom,
  onOpenTask,
  coinsByEffort,
  onNavigateToActivity,
  onNavigateToRewards,
  onOpenFocus,
  onRewardRequestAction,
  gamificationEnabled = true,
  leaderboardPeriod = 'week',
  seasonCostume = null,
}) => {
  const { taskName, roomDisplayName, timeAgo, t } = useTranslation(language);

  // Task rows open the task in its room; the Done button inside stops the tap from bubbling
  const openTaskProps = (q: Quest) => onOpenTask ? {
    'data-task-id': q.id,
    role: 'button',
    tabIndex: 0,
    onClick: () => onOpenTask(q.roomId, q.id),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpenTask(q.roomId, q.id); },
  } : {};
  // Double coins events: the biggest running boost that covers a task's room (boosts don't stack)
  const boosts = gamificationEnabled ? (data.coinBoosts ?? []) : [];
  // Today's Rescue Mission pays extra too (the bigger multiplier wins, like on the server)
  const mission = gamificationEnabled ? data.rescueMission ?? null : null;
  const missionBonus = (taskId: number) => (mission && mission.taskId === taskId && !mission.completedBy ? mission.multiplier : 1);
  // A boost counts for a chore when nothing was picked, or its room or the chore itself was (as on the server)
  const covers = (b: CoinBoost, taskId: number, roomId: number) => (!b.roomIds && !b.taskIds) || !!b.roomIds?.includes(roomId) || !!b.taskIds?.includes(taskId);
  const multiplierFor = (taskId: number, roomId: number) => boosts.reduce((m, b) => (covers(b, taskId, roomId) ? Math.max(m, b.multiplier) : m), missionBonus(taskId));
  const boostFor = (q: Quest) => multiplierFor(q.id, q.roomId);
  // The event whose chore list is open (tap the banner)
  const [openBoostId, setOpenBoostId] = useState<number | null>(null);
  const openBoost = boosts.find((b) => b.id === openBoostId) ?? null;
  // "Kitchen, Clean Shower & Tub, Rake +2 more"
  const boostTargets = (b: CoinBoost) => {
    const names = [...(b.roomIds ?? []).map((id) => rooms.find((r) => r.id === id)?.name ?? '').filter(Boolean), ...(b.taskNames ?? [])];
    if (names.length === 0) return t('boosts.allRooms');
    return names.slice(0, 3).join(', ') + (names.length > 3 ? ` ${t('boosts.andMore').replace('{n}', String(names.length - 3))}` : '');
  };
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (boosts.length === 0) return;
    const id = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(id);
  }, [boosts.length]);
  const timeLeft = (endAt: string) => {
    const mins = Math.max(0, Math.round((new Date(endAt).getTime() - nowTs) / 60000));
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  };
  const questDetails = (q: Quest) => (
    <>
      {q.notes && (
        <div className="quest-notes" style={{ fontSize: 11, color: 'var(--warm-text-muted)', fontWeight: 600, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
          {q.notes}
        </div>
      )}
      {gamificationEnabled && (
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-accent)', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
          <CoinIcon />
          {boostFor(q) > 1 ? (
            <>
              <span style={{ textDecoration: 'line-through', color: 'var(--warm-text-light)', fontWeight: 700 }}>{formatCoins(taskCoins(q, coinsByEffort))}</span>
              {formatCoins(Math.round(taskCoins(q, coinsByEffort) * boostFor(q)))}
              <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', backgroundColor: 'var(--warm-accent)', borderRadius: 6, padding: '1px 5px' }}>⚡ {boostFor(q)}×</span>
            </>
          ) : formatCoins(taskCoins(q, coinsByEffort))}
        </div>
      )}
    </>
  );
  const { houseHealth, rooms, todaysQuests, nextTasks, readyToComplete, scheduledUpcoming, onDemandQuests, completedToday = [], myGoal, childrenGoals = [], pendingRewardRequests = [], currentUser, recentActivity, badges, myLevel = null, nextBadge = null } = data;

  const BADGE_COLORS: Record<string, string> = {
    bronze: '#CD7F32',
    silver: '#A8A9AD',
    gold: '#FFD700',
    platinum: '#B0C4DE',
    legend: '#9B59B6',
  };
  const allReadyTasks = readyToComplete ?? todaysQuests.filter(q => !q.onDemand);
  const allScheduledTasks = scheduledUpcoming ?? nextTasks;
  const allOnDemandTasks = onDemandQuests ?? todaysQuests.filter(q => q.onDemand);
  const [adminModalQuest, setAdminModalQuest] = useState<Quest | null>(null);
  // All / Mine: a parent can make someone start on Mine or lock it (Kid mode always shows Mine)
  const { filter: taskFilter, setFilter: setTaskFilter, locked: filterLocked } = useTaskView(currentUser);
  const kidMode = !!currentUser.kidMode;
  // Strict Mode: kids can finish a chore with a note or photo for the parent who approves it
  const [proofQuest, setProofQuest] = useState<Quest | null>(null);
  const canAddProof = !!data.strictMode && currentUser.role === 'child';
  const proofButton = (q: Quest, enabled: boolean) => canAddProof && enabled ? (
    <button onClick={(e) => { e.stopPropagation(); setProofQuest(q); }} className="tq-btn tq-btn-secondary"
      title={t('proof.addProof')} aria-label={t('proof.addProof')} style={{ padding: '8px 10px', fontSize: 14 }}>📎</button>
  ) : null;
  const pendingCompletions = data.pendingCompletions ?? [];
  const filterQuests = (quests: Quest[]) => {
    if (taskFilter === 'all') return quests;
    return quests.filter(q => isTaskForUser(q, currentUser.id, currentUser.role));
  };
  const readyAll = filterQuests(allReadyTasks);
  const todoTasks = filterQuests(data.todoQuests ?? []);
  const [showTodoAdd, setShowTodoAdd] = useState(false);
  const [todoNotice, setTodoNotice] = useState('');

  // The Done button for a chore in the newer Home sections (To-do, Your usual, Maybe you forgot,
  // Rescue Mission): the same rules as the lists above, for scheduled and anytime chores alike
  const doneState = (q: Quest): { disabled: boolean; label: string } => {
    const claimed = claimedLabel(q.teamUp);
    if (claimed) return { disabled: true, label: claimed };
    const isAdminOrMember = currentUser.role === 'admin' || currentUser.role === 'member';
    const hasAssignees = (q.effectiveAssignedUserIds && q.effectiveAssignedUserIds.length > 0) || q.assignedToChildren;
    const ids = q.effectiveAssignedUserIds ?? [];
    if (!isAdminOrMember && ids.length > 0 && !ids.includes(currentUser.id)) return { disabled: true, label: t('app.notAssigned') };
    if (!isAdminOrMember && (q.myPendingCount ?? 0) > 0) return { disabled: true, label: t('app.waitingForApproval') };
    if (q.onDemand) {
      if (!isAdminOrMember && q.repeatLimit && (q.myRepeatCount ?? 0) >= q.repeatLimit) return { disabled: true, label: t(q.repeatPeriod === 'day' ? 'repeat.doneToday' : 'repeat.doneThisWeek') };
      return { disabled: false, label: t('roomDetail.done') };
    }
    if (q.assignmentMode === 'shared') {
      if (q.sharedCompletions?.some((c) => c.userId === currentUser.id) && !isAdminOrMember) return { disabled: true, label: t('app.doneBy').replace('{name}', t('common.you')) };
    } else if (q.completedTodayBy && (!isAdminOrMember || !hasAssignees)) {
      return { disabled: true, label: t('app.doneBy').replace('{name}', q.completedTodayBy.displayName) };
    }
    return { disabled: false, label: t('roomDetail.done') };
  };
  const timer = useChoreTimer();
  const finish = (q: Quest) => {
    const isAdminOrMember = currentUser.role === 'admin' || currentUser.role === 'member';
    const hasAssignees = (q.effectiveAssignedUserIds && q.effectiveAssignedUserIds.length > 0) || q.assignedToChildren;
    if (isAdminOrMember && hasAssignees) setAdminModalQuest(q);
    else onCompleteTask(q.id);
  };
  // Timer chores (NEW-1): ▶ Start next to Done; kids start it first, and Done comes when it ends
  const timerWaits = (q: Quest, enabled: boolean) => enabled && !!timer?.mustWait(q);
  const timerButton = (q: Quest, enabled: boolean) => (enabled
    ? <TimerStartButton task={{ ...q, name: taskName(q.name, q.translationKey) }} language={language} primary={timerWaits(q, true)} />
    : null);
  /** One chore row: icon, name, room, a line of extra info, coins, and its Done button */
  const questRow = (q: Quest, opts: { key: string; info?: React.ReactNode; actions?: React.ReactNode; highlight?: boolean }) => {
    const state = doneState(q);
    return (
      <div key={opts.key} {...openTaskProps(q)} style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, cursor: onOpenTask ? 'pointer' : undefined,
        backgroundColor: opts.highlight ? 'var(--warm-accent-light)' : 'var(--warm-bg-subtle)',
        border: `1.5px solid ${opts.highlight ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
      }}>
        <div style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: q.roomColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${q.roomAccent}44` }}>
          <TaskIcon iconKey={q.iconKey} size={24} />
        </div>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{taskName(q.name, q.translationKey)}</div>
          <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{roomDisplayName(q.roomName, roomTypeById.get(q.roomId) || '')}</div>
          {opts.info}
          {questDetails(q)}
        </div>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {opts.actions}
          <TeamUpButton info={q.teamUp} onClick={() => setTeamPick(q)} language={language} />
          <TakeBackButton completionId={q.myPendingId} onDone={() => onRefresh?.()} language={language} />
          {proofButton(q, !state.disabled && !timerWaits(q, true))}
          {timerButton(q, !state.disabled)}
          {!timerWaits(q, !state.disabled) && <button onClick={(e) => { e.stopPropagation(); if (!state.disabled) finish(q); }} disabled={state.disabled} className={state.disabled ? 'tq-btn' : 'tq-btn tq-btn-primary'}
            style={{ padding: '8px 14px', fontSize: 12, ...(state.disabled ? { opacity: 0.55, cursor: 'default', backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', color: 'var(--warm-text-muted)' } : {}) }}>
            {state.disabled ? state.label : <><CheckIcon /> {state.label}</>}
          </button>}
        </span>
      </div>
    );
  };
  const scheduledTasks = filterQuests(allScheduledTasks);
  const onDemandTasks = filterQuests(allOnDemandTasks);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showCustomize, setShowCustomize] = useState(false);
  // The chore someone is picking a team-up partner for
  const [teamPick, setTeamPick] = useState<Quest | null>(null);

  const CARD_LABELS: Record<HomeCardId, string> = {
    focus: t('focus.title'),
    mascot: t('mascot.title'),
    teamups: t('teamups.title'),
    houseHealth: t('dashboard.houseHealth'),
    pendingApprovals: t('approvals.title'),
    rescue: t('rescue.title'),
    usual: t('home.usualTitle'),
    forgot: t('home.forgotTitle'),
    todaysQuests: t('dashboard.todaysQuests'),
    todo: t('todos.title'),
    scheduled: t('dashboard.scheduled'),
    completedToday: t('dashboard.completedToday'),
    rooms: t('nav.rooms'),
    streak: t('dashboard.dayStreak'),
    coins: t('dashboard.coinsStatusTitle'),
    myGoal: t('dashboard.myGoal'),
    childrenGoals: t('dashboard.childrenGoals'),
    rewardRequests: t('dashboard.rewardRequestsTitle'),
    leaderboard: t('app.leaderboardTitle'),
    recentActivity: t('dashboard.recentActivity'),
  };
  // This person's card order and hidden cards (saved on the server; the old browser-only hidden set
  // is brought over the first time)
  const [layout, setLayout] = useState<HomeLayout>(() => currentUser.homeLayout ?? { order: [], hidden: legacyHidden() });
  useEffect(() => {
    if (currentUser.homeLayout || legacyHidden().length === 0) return;
    api.updateProfile(currentUser.id, { homeLayout: { order: [], hidden: legacyHidden() } })
      .then(() => { try { localStorage.removeItem(LEGACY_HIDDEN_KEY); } catch { /* ignore */ } onRefresh?.(); })
      .catch(() => {});
  }, [currentUser.id, currentUser.homeLayout, onRefresh]);
  const [layoutError, setLayoutError] = useState(false);
  const saveLayout = (next: HomeLayout) => {
    setLayout(next);
    api.updateProfile(currentUser.id, { homeLayout: next.order.length || next.hidden.length ? next : null })
      // Home's data carries the layout, so reload it (Home comes back in this order after a page change)
      .then(() => onRefresh?.())
      .catch(() => setLayoutError(true));
  };
  const cardOrder = resolveOrder(layout.order);
  const hiddenCards = new Set(layout.hidden);
  // Customise lists the cards this person can get; kid mode keeps Home to the essentials (KID_CARDS),
  // and kids arrange and hide within those
  const isParent = currentUser.role === 'admin';
  const cardApplies: Partial<Record<HomeCardId, boolean>> = {
    focus: !!data.focus,
    mascot: !!data.mascot,
    teamups: data.features?.teamups !== false,
    rescue: gamificationEnabled && data.features?.rescue !== false,
    usual: data.features?.usual !== false,
    forgot: data.features?.forgot !== false,
    todo: data.features?.todos !== false,
    pendingApprovals: isParent,
    childrenGoals: isParent && gamificationEnabled,
    rewardRequests: isParent && gamificationEnabled,
    streak: gamificationEnabled,
    coins: gamificationEnabled,
    myGoal: gamificationEnabled,
    leaderboard: gamificationEnabled,
  };
  const listedCards = cardOrder.filter((id) => (!kidMode || KID_CARDS.has(id)) && cardApplies[id as HomeCardId] !== false);
  const isVisible = (id: string) => (!kidMode || KID_CARDS.has(id)) && !hiddenCards.has(id);
  // Your usual: pins always; the rest only when they can be done right now (6 at most)
  const usualShown = (data.usualQuests ?? []).filter((q) => q.pinned || !doneState(q).disabled).slice(0, 6);
  // Maybe you forgot: the 3 worst for this view; while that card shows, they leave "Ready to complete"
  const forgottenShown = filterQuests(data.forgottenQuests ?? []).slice(0, 3);
  const forgottenIds = new Set(isVisible('forgot') ? forgottenShown.map((q) => q.id) : []);
  // The mission has its own card: it leaves the other lists while that card shows
  const missionShown = isVisible('rescue') && !!mission && (!!mission.task || !!mission.completedBy);
  if (missionShown && mission?.taskId) forgottenIds.add(mission.taskId);
  const readyTasks = readyAll.filter((q) => !forgottenIds.has(q.id));
  const missionAction = async (fn: () => Promise<unknown>) => { await fn(); onRefresh?.(); };
  const togglePin = async (q: Quest) => {
    if (q.pinned) await api.unpinTask(q.id); else await api.pinTask(q.id);
    onRefresh?.();
  };
  // 💤 hides the chore for you for 3 days; the toast lets you take it back
  const [snoozeUndo, setSnoozeUndo] = useState<UndoState | null>(null);
  const closeSnoozeUndo = useCallback(() => setSnoozeUndo(null), []);
  const snooze = async (q: Quest) => {
    await api.snoozeTask(q.id, 3);
    setSnoozeUndo({ message: t('home.snoozed').replace('{name}', taskName(q.name, q.translationKey)), onUndo: () => api.unsnoozeTask(q.id) });
    onRefresh?.();
  };
  const toggleCard = (id: string) => saveLayout({
    order: cardOrder,
    hidden: hiddenCards.has(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id],
  });
  const LIMIT = 7;
  const isExpanded = (key: string) => !!expanded[key];
  const toggleExpand = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));
  const showMoreBtn = (key: string, total: number) => total > LIMIT && (
    <button className="tq-btn tq-btn-secondary" onClick={() => toggleExpand(key)}
      style={{ marginTop: 8, width: '100%', fontSize: 12, padding: '8px' }}>
      {isExpanded(key) ? t('common.showLess') : t('common.showMore').replace('{n}', `${total - LIMIT}`)}
    </button>
  );
  const sortedRooms = [...rooms].sort((a, b) => a.health - b.health);
  const roomTypeById = new Map(rooms.map((r) => [r.id, r.roomType]));
  // "What should I do?": chores the mascot can suggest, best first (only ones you can do right now)
  const mascotIdeas: MascotSuggestion[] = [];
  {
    const seen = new Set<number>();
    const add = (q: Quest | null | undefined, reason: MascotSuggestion['reason']) => {
      if (!q || seen.has(q.id) || doneState(q).disabled) return;
      seen.add(q.id);
      mascotIdeas.push({ taskId: q.id, roomId: q.roomId, name: taskName(q.name, q.translationKey), roomName: roomDisplayName(q.roomName, roomTypeById.get(q.roomId) || ''), coins: gamificationEnabled ? taskCoins(q, coinsByEffort) : null, reason });
    };
    const due = readyToComplete ?? [];
    if (mission && !mission.completedBy) add(mission.task as Quest | null, 'rescue');
    for (const x of data.teamups ?? []) if (x.canJoin) add([...due, ...(onDemandQuests ?? [])].find((q) => q.id === x.taskId), 'teamup');
    for (const q of due) if ((q.effectiveAssignedUserIds ?? []).includes(currentUser.id)) add(q, 'yours');
    for (const q of due) if (q.roomId === data.mascot?.messiestRoom?.id) add(q, 'messiest');
    for (const q of [...due].sort((a, b) => a.effort - b.effort)) add(q, 'quick');
  }
  const totalTasks = rooms.reduce((s, r) => s + r.taskCount, 0);
  const totalCritical = rooms.reduce((s, r) => s + r.criticalCount, 0);
  const sortedFamily = [...family].sort((a, b) => b.points - a.points);
  const coinsSortedFamily = [...family].sort((a, b) => b.coins - a.coins);
  const todayIso = new Date().toISOString().slice(0, 10);
  const streakDoneToday = currentUser.lastActiveDate === todayIso;

  const healthMessage =
    houseHealth >= 70
      ? t('dashboard.healthGreat')
      : houseHealth >= 40
        ? t('dashboard.healthMedium')
        : t('dashboard.healthLow');

  // Home's cards by id; they're shown in this person's order (Customise, ENH-6)
  const homeCards: Record<string, React.ReactNode> = {
    // One thing at a time: today's line, one chore at a time
    focus: data.focus && isVisible('focus') && (
        <button type="button" className="tq-card tq-card-padded focus-card" onClick={onOpenFocus}>
          <span style={{ fontSize: 34 }} aria-hidden="true">🎯</span>
          <span style={{ flex: '1 1 0', width: 0, textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: 17, fontWeight: 900, color: 'var(--warm-text)' }}>{t('focus.title')}</span>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--warm-text-muted)', marginTop: 2 }}>
              {data.focus.line.length === 0
                ? (data.focus.done > 0 ? t('focus.cardDone') : t('focus.nothing'))
                : data.focus.line.length === 1 ? t('focus.cardLeftOne') : t('focus.cardLeft').replace('{n}', String(data.focus.line.length))}
            </span>
          </span>
          <span className="tq-btn tq-btn-primary" style={{ flexShrink: 0 }}>{data.focus.line.length > 0 ? t('focus.go') : '›'}</span>
        </button>
      ),
    // The house mascot: mood, what it needs, and how close it is to growing
    mascot: data.mascot && isVisible('mascot') && (
        <MascotCard m={data.mascot} costume={seasonCostume} language={language} suggestions={mascotIdeas} userId={currentUser.id}
          isParent={currentUser.role === 'admin'} coins={currentUser.coins} onChanged={() => onRefresh?.()} />
      ),
    // Team-ups you're on, and invites you can join
    teamups: isVisible('teamups') && (
        <TeamUpsCard items={data.teamups ?? []} userId={currentUser.id} language={language}
          onDone={(taskId) => onCompleteTask(taskId)} onChanged={() => onRefresh?.()} />
      ),
    // House Health Card
    houseHealth: isVisible('houseHealth') && (
      <div
        className="tq-card tq-card-padded dashboard-hero"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 20,
          background: 'var(--warm-streak-bg)',
        }}
      >
        <RingGauge value={houseHealth} size={130} strokeWidth={11} />
        <div style={{ flex: '1 1 170px', minWidth: 0 }}>
        <button onClick={() => setShowCustomize(v => !v)} className="tq-btn tq-btn-secondary"
          style={{ float: 'right', fontSize: 11, padding: '5px 10px', marginBottom: 6 }}>
          ⚙ {t('dashboard.customise')}
        </button>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--warm-text-light)',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {t('dashboard.houseHealth')}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--warm-text-secondary)',
              marginBottom: 14,
              lineHeight: 1.4,
            }}
          >
            {healthMessage}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: t('dashboard.roomsCount'), value: rooms.length, color: 'var(--warm-accent)' },
              { label: t('dashboard.tasksCount'), value: totalTasks, color: '#4AABDE' },
              { label: t('dashboard.criticalCount'), value: totalCritical, color: 'var(--warm-badge-text)' },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--warm-card)',
                  borderRadius: 14,
                  padding: '10px 8px',
                  textAlign: 'center',
                  border: '1.5px solid var(--warm-border)',
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 700 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      ),
    // Chores waiting for approval (parents, Strict Mode)
    pendingApprovals: currentUser.role === 'admin' && isVisible('pendingApprovals') && pendingCompletions.length > 0 && (
        <div className="tq-card tq-card-padded" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: 0 }}>{t('approvals.title')}</h3>
            <span style={{ fontSize: 11, fontWeight: 800, backgroundColor: 'var(--warm-badge-bg)', color: 'var(--warm-badge-text)', padding: '4px 12px', borderRadius: 99 }}>
              {pendingCompletions.length}
            </span>
          </div>
          <PendingApprovals items={pendingCompletions} language={language} gamificationEnabled={gamificationEnabled} extras={data.features?.cheers !== false} onChanged={() => onRefresh?.()} />
        </div>
      ),
    // Rescue Mission: today's most-forgotten chore pays extra to the first one who does it
    rescue: missionShown && mission && (
        <div className="tq-card tq-card-padded rescue-card" style={{ gridColumn: '1 / -1', minWidth: 0, borderColor: 'var(--warm-accent)', background: 'linear-gradient(135deg, var(--warm-accent-light), var(--warm-card))' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: 'var(--warm-text)', margin: 0 }}>⚡ {t('rescue.title')}</h3>
            {!mission.completedBy && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-text-muted)' }}>{t('rescue.endsMidnight')}</span>}
          </div>
          {mission.completedBy ? (
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--health-green)' }}>
              ✅ {mission.taskName ? `${taskName(mission.taskName, mission.task?.translationKey)} · ` : ''}{t('rescue.rescuedBy').replace('{name}', mission.completedByName ?? '?')}
            </div>
          ) : mission.task && (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-accent)', marginBottom: 8 }}>{t('rescue.pays').replace('{m}', String(mission.multiplier))}</div>
              {questRow(mission.task, { key: `rescue-${mission.task.id}`, highlight: true })}
            </>
          )}
          {currentUser.role === 'admin' && !mission.completedBy && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
              <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => void missionAction(api.rescueReroll)}>🔄 {t('rescue.another')}</button>
              {(data.rescueChoices ?? []).length > 1 && (
                <select className="tq-input-compact" value="" aria-label={t('rescue.choose')} style={{ flex: '1 1 140px', width: 0, minWidth: 0, maxWidth: '100%' }}
                  onChange={(e) => { if (e.target.value) void missionAction(() => api.rescueChoose(Number(e.target.value))); }}>
                  <option value="">{t('rescue.choose')}</option>
                  {(data.rescueChoices ?? []).filter((c) => c.id !== mission.taskId).map((c) => <option key={c.id} value={c.id}>{taskName(c.name, undefined)}</option>)}
                </select>
              )}
              <button className="tq-btn tq-btn-sm" onClick={() => void missionAction(api.rescueSkip)}>{t('rescue.skip')}</button>
            </div>
          )}
        </div>
      ),
    // Your usual: pinned and most-done tasks, one tap away
    usual: isVisible('usual') && usualShown.length > 0 && (
        <div className="tq-card tq-card-padded">
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: '0 0 12px' }}>⭐ {t('home.usualTitle')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {usualShown.map((q) => questRow(q, {
              key: `usual-${q.id}`,
              actions: (
                <button className="tq-btn tq-btn-secondary" onClick={(e) => { e.stopPropagation(); void togglePin(q); }}
                  title={q.pinned ? t('home.unpin') : t('home.pin')} aria-label={q.pinned ? t('home.unpin') : t('home.pin')} aria-pressed={!!q.pinned}
                  style={{ padding: '8px 10px', fontSize: 14, color: q.pinned ? 'var(--warm-accent)' : 'var(--warm-text-light)' }}>{q.pinned ? '★' : '☆'}</button>
              ),
            }))}
          </div>
        </div>
      ),
    // Maybe you forgot about these: overdue by a whole interval or more
    forgot: isVisible('forgot') && forgottenShown.length > 0 && (
        <div className="tq-card tq-card-padded" style={{ borderColor: 'var(--warm-streak-border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: '0 0 12px' }}>🤔 {t('home.forgotTitle')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {forgottenShown.map((q) => questRow(q, {
              key: `forgot-${q.id}`,
              info: (
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--health-red)', marginTop: 2 }}>
                  ⏰ {(q.overdueDays ?? 0) === 1 ? t('home.overdueDay') : t('home.overdueDays').replace('{n}', String(q.overdueDays ?? 0))}
                  {q.lastCompletedAt ? ` · ${timeAgo(q.lastCompletedAt)}` : ''}
                </div>
              ),
              actions: (
                <button className="tq-btn tq-btn-secondary" onClick={(e) => { e.stopPropagation(); void snooze(q); }}
                  title={t('home.snooze')} aria-label={t('home.snooze')} style={{ padding: '8px 10px', fontSize: 14 }}>💤</button>
              ),
            }))}
          </div>
        </div>
      ),
    // Today's Quests Card — full width, sections: Ready to Complete / On Demand
    todaysQuests: isVisible('todaysQuests') && <div className="tq-card tq-card-padded">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: 0 }}>
            {t('dashboard.todaysQuests')}
          </h3>
          {!filterLocked && (
            <AllMineToggle value={taskFilter} onChange={setTaskFilter} allLabel={t('dashboard.allTasks')} mineLabel={t('dashboard.myTasks')} />
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* ── Ready to Complete ── */}
          {readyTasks.length > 0 && (
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
              {t('dashboard.readyToComplete')}
            </div>
          )}
          {(isExpanded('ready') ? readyTasks : readyTasks.slice(0, LIMIT)).map((q) => {
            const isAdminOrMember = currentUser.role === 'admin' || currentUser.role === 'member';
            const hasAssignees = (q.effectiveAssignedUserIds && q.effectiveAssignedUserIds.length > 0) || q.assignedToChildren;
            let btnDisabled = false;
            let btnLabel = t('roomDetail.done');
            if (q.assignmentMode === 'shared') {
              const myCompletion = q.sharedCompletions?.find(c => c.userId === currentUser.id);
              if (myCompletion && !isAdminOrMember) {
                btnDisabled = true;
                btnLabel = t('app.doneBy').replace('{name}', t('common.you') || 'You');
              }
            } else if (q.completedTodayBy) {
              if (!isAdminOrMember || !hasAssignees) {
                btnDisabled = true;
                btnLabel = t('app.doneBy').replace('{name}', q.completedTodayBy.displayName);
              }
            } else if (!isAdminOrMember) {
              const ids = q.effectiveAssignedUserIds ?? [];
              if (ids.length > 0 && !ids.includes(currentUser.id)) {
                btnDisabled = true;
                btnLabel = t('app.notAssigned');
              }
            }
            if (!isAdminOrMember && (q.myPendingCount ?? 0) > 0) {
              btnDisabled = true;
              btnLabel = t('app.waitingForApproval');
            }
            const claimed = claimedLabel(q.teamUp);
            if (claimed) { btnDisabled = true; btnLabel = claimed; }
            const handleDone = () => {
              if (btnDisabled) return;
              if (isAdminOrMember && hasAssignees) setAdminModalQuest(q);
              else onCompleteTask(q.id);
            };
            return (
              <div key={q.id} {...openTaskProps(q)} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', cursor: onOpenTask ? 'pointer' : undefined }}>
                <div style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: q.roomColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${q.roomAccent}44` }}>
                  <TaskIcon iconKey={q.iconKey} size={24} />
                </div>
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warm-text)' }}>{taskName(q.name, q.translationKey)}</div>
                  <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                    {roomDisplayName(q.roomName, roomTypeById.get(q.roomId) || '')}
                    {q.lastCompletedAt ? ` \u00B7 ${timeAgo(q.lastCompletedAt)}` : ''}
                  </div>
                  {questDetails(q)}
                  <div style={{ marginTop: 5 }}><HealthBar value={q.health} height={6} showLabel={false} /></div>
                </div>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <TeamUpButton info={q.teamUp} onClick={() => setTeamPick(q)} language={language} />
                <TakeBackButton completionId={q.myPendingId} onDone={() => onRefresh?.()} language={language} />
                {proofButton(q, !btnDisabled && !timerWaits(q, true))}
                {timerButton(q, !btnDisabled)}
                {!timerWaits(q, !btnDisabled) && <button onClick={(e) => { e.stopPropagation(); handleDone(); }} disabled={btnDisabled} className={btnDisabled ? 'tq-btn' : 'tq-btn tq-btn-primary'}
                  style={{ padding: '8px 14px', fontSize: 12, ...(btnDisabled ? { opacity: 0.55, cursor: 'default', backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', color: 'var(--warm-text-muted)', boxShadow: 'none' } : { backgroundColor: 'var(--warm-accent)', color: '#fff', boxShadow: '0 4px 14px var(--warm-primary-shadow)' }) }}>
                  {btnDisabled ? btnLabel : <><CheckIcon /> {btnLabel}</>}
                </button>}
                </span>
              </div>
            );
          })}
          {showMoreBtn('ready', readyTasks.length)}

          {readyTasks.length === 0 && onDemandTasks.length === 0 && (
            <div className="tq-empty-state" style={{ padding: '16px 4px' }}>{t('dashboard.noQuests')}</div>
          )}

          {/* ── On Demand ── */}
          {onDemandTasks.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: readyTasks.length > 0 ? 10 : 2, marginBottom: 2 }}>
                {t('dashboard.onDemand')}
              </div>
              {(isExpanded('ondemand') ? onDemandTasks : onDemandTasks.slice(0, LIMIT)).map((q) => {
                const isAdminOrMember = currentUser.role === 'admin' || currentUser.role === 'member';
                const hasAssignees = (q.effectiveAssignedUserIds && q.effectiveAssignedUserIds.length > 0) || q.assignedToChildren;
                const ids = q.effectiveAssignedUserIds ?? [];
                const notMine = !isAdminOrMember && ids.length > 0 && !ids.includes(currentUser.id);
                const pending = q.myPendingCount ?? 0;
                const usedUp = !isAdminOrMember && !!q.repeatLimit && (q.myRepeatCount ?? 0) >= q.repeatLimit;
                const claimed = claimedLabel(q.teamUp);
                const blocked = notMine || usedUp || !!claimed;
                const handleDone = () => {
                  if (blocked) return;
                  if (isAdminOrMember && hasAssignees) setAdminModalQuest(q);
                  else onCompleteTask(q.id);
                };
                return (
                  <div key={q.id} {...openTaskProps(q)} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', cursor: onOpenTask ? 'pointer' : undefined }}>
                    <div style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: q.roomColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${q.roomAccent}44` }}>
                      <TaskIcon iconKey={q.iconKey} size={24} />
                    </div>
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warm-text)' }}>{taskName(q.name, q.translationKey)}</div>
                      <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                        {roomDisplayName(q.roomName, roomTypeById.get(q.roomId) || '')}
                        {q.lastCompletedAt ? ` \u00B7 ${timeAgo(q.lastCompletedAt)}` : ''}
                      </div>
                      {pending > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--warm-accent)', fontWeight: 700, marginTop: 2 }}>
                          ⏳ {t('app.waitingCount').replace('{n}', String(pending))}
                        </div>
                      )}
                      {!!q.repeatLimit && (
                        <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 700, marginTop: 2 }}>
                          {q.myRepeatCount ?? 0}/{q.repeatLimit} {t(q.repeatPeriod === 'day' ? 'repeat.today' : 'repeat.thisWeek')}
                        </div>
                      )}
                      {questDetails(q)}
                    </div>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <TeamUpButton info={q.teamUp} onClick={() => setTeamPick(q)} language={language} />
                    <TakeBackButton completionId={q.myPendingId} onDone={() => onRefresh?.()} language={language} />
                    {proofButton(q, !blocked && !timerWaits(q, true))}
                    {timerButton(q, !blocked)}
                    {!timerWaits(q, !blocked) && <button onClick={(e) => { e.stopPropagation(); handleDone(); }} disabled={blocked} className={blocked ? 'tq-btn' : 'tq-btn tq-btn-primary'}
                      style={{ padding: '8px 14px', fontSize: 12, ...(blocked ? { opacity: 0.55, cursor: 'default', backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', color: 'var(--warm-text-muted)', boxShadow: 'none' } : { backgroundColor: 'var(--warm-accent)', color: '#fff', boxShadow: '0 4px 14px var(--warm-primary-shadow)' }) }}>
                      {claimed ? claimed : notMine ? t('app.notAssigned') : usedUp ? t(q.repeatPeriod === 'day' ? 'repeat.doneToday' : 'repeat.doneThisWeek') : <><CheckIcon /> {t('roomDetail.done')}</>}
                    </button>}
                    </span>
                  </div>
                );
              })}
              {showMoreBtn('ondemand', onDemandTasks.length)}
            </>
          )}
        </div>
      </div>,
    // To-do: one-time chores ("Fix the screen door"); parents can add one here
    todo: isVisible('todo') && data.features?.todos !== false && (todoTasks.length > 0 || currentUser.role === 'admin') && (
        <div className="tq-card tq-card-padded">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: 0 }}>📝 {t('todos.title')}</h3>
            {currentUser.role === 'admin' && !showTodoAdd && (
              <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => { setShowTodoAdd(true); setTodoNotice(''); }}>+ {t('todos.add')}</button>
            )}
          </div>
          {showTodoAdd && (
            <TodoQuickAdd language={language}
              people={(users ?? []).map((u) => ({ id: u.id, displayName: u.displayName }))}
              onCancel={() => setShowTodoAdd(false)}
              onAdded={(name) => { setShowTodoAdd(false); setTodoNotice(t('todos.added').replace('{name}', name)); onRefresh?.(); }} />
          )}
          {todoNotice && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--health-green)', marginBottom: 8 }}>{todoNotice}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(isExpanded('todo') ? todoTasks : todoTasks.slice(0, LIMIT)).map((q) => questRow(q, {
              key: `todo-${q.id}`,
              info: (q.doBy || q.overdue) ? (
                <div style={{ fontSize: 11, fontWeight: 800, marginTop: 2, color: q.overdue ? 'var(--health-red)' : 'var(--warm-text-muted)' }}>
                  {q.overdue ? `⚠️ ${t('todos.overdue')}` : ''}{q.overdue && q.doBy ? ' · ' : ''}
                  {q.doBy ? t('todos.byDate').replace('{date}', new Date(`${q.doBy}T12:00:00`).toLocaleDateString(localeFor(language), { weekday: 'short', month: 'short', day: 'numeric' })) : ''}
                </div>
              ) : null,
            }))}
            {showMoreBtn('todo', todoTasks.length)}
          </div>
        </div>
      ),
    // Scheduled Card — upcoming tasks not yet due
    scheduled: isVisible('scheduled') && scheduledTasks.length > 0 && (
        <div className="tq-card tq-card-padded">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: 0 }}>
              {t('dashboard.scheduled')}
            </h3>
            <span style={{ fontSize: 11, fontWeight: 800, backgroundColor: 'var(--warm-badge-bg)', color: 'var(--warm-badge-text)', padding: '4px 12px', borderRadius: 99 }}>
              {scheduledTasks.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(isExpanded('scheduled') ? scheduledTasks : scheduledTasks.slice(0, LIMIT)).map((q) => (
              <div key={q.id} {...openTaskProps(q)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', cursor: onOpenTask ? 'pointer' : undefined }}>
                <div style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: q.roomColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${q.roomAccent}44` }}>
                  <TaskIcon iconKey={q.iconKey} size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>{taskName(q.name, q.translationKey)}</div>
                  <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 600 }}>{roomDisplayName(q.roomName, roomTypeById.get(q.roomId) || '')}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-streak-subtext)', backgroundColor: 'var(--warm-accent-light)', border: '1px solid var(--warm-streak-border)', borderRadius: 999, padding: '3px 8px' }}>
                  {(q.dueInDays ?? 0) <= 0 ? t('calendar.today') : q.dueInDays === 1 ? t('calendar.tomorrow') : t('calendar.inDays').replace('{days}', `${q.dueInDays}`)}
                </div>
              </div>
            ))}
            {showMoreBtn('scheduled', scheduledTasks.length)}
          </div>
        </div>
      ),
    // Completed Today Card
    completedToday: isVisible('completedToday') && completedToday.length > 0 && (
        <div className="tq-card tq-card-padded">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: 0 }}>
              {t('dashboard.completedToday')}
            </h3>
            <span style={{ fontSize: 11, fontWeight: 800, backgroundColor: 'var(--warm-badge-bg)', color: 'var(--warm-badge-text)', padding: '4px 12px', borderRadius: 99 }}>
              {completedToday.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(isExpanded('completed') ? completedToday : completedToday.slice(0, LIMIT)).map((c, i) => (
              <div key={c.completionId ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: c.roomColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${c.roomAccent}44` }}>
                  <TaskIcon iconKey={c.iconKey} size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>{taskName(c.name, c.translationKey)}</div>
                  <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                    {roomDisplayName(c.roomName, c.roomType || '')} &middot; {c.displayName}
                  </div>
                  {c.approvalNote && <div style={{ fontSize: 11, color: 'var(--warm-text-secondary)', fontWeight: 600, overflowWrap: 'anywhere' }}>💬 “{c.approvalNote}”</div>}
                  {c.cheers && <CheerBar completionId={c.completionId} cheers={c.cheers} canCheer={c.userId !== currentUser.id} language={language} mascotName={data.mascot?.name} />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 800, color: 'var(--warm-accent)' }}>
                  {gamificationEnabled && <><CoinIcon /> +{c.coinsEarned}</>}
                  <CheckIcon />
                </div>
              </div>
            ))}
            {showMoreBtn('completed', completedToday.length)}
          </div>
        </div>
      ),
    // Rooms
    rooms: isVisible('rooms') && <div className="tq-card tq-card-padded">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: 0 }}>
            {t('nav.rooms')}
          </h3>
          <span style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 700 }}>
            {t('dashboard.sortedUrgency')}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(isExpanded('rooms') ? sortedRooms : sortedRooms.slice(0, LIMIT)).map((room) => {
            const RoomIcon = getRoomIcon(room.roomType || room.name);
            return (
              <div
                key={room.id}
                className="tq-card tq-card-hover"
                style={{ cursor: 'pointer' }}
                onClick={() => onNavigateToRoom(room.id)}
              >
                <div style={{ padding: '16px 18px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 16,
                        backgroundColor: room.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: `1.5px solid ${room.accentColor}33`,
                      }}
                    >
                      <RoomIcon />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-text)' }}>
                        {roomDisplayName(room.name, room.roomType)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                        {room.taskCount} {t('rooms.tasks')}
                        {room.criticalCount > 0 && (
                          <span style={{ color: 'var(--warm-badge-text)', fontWeight: 800 }}>
                            {' '}
                            &middot; {room.criticalCount} {t('dashboard.criticalCount')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 900,
                        color: getHealthColor(room.health),
                      }}
                    >
                      {room.health}%
                    </div>
                  </div>
                  <HealthBar value={room.health} height={8} showLabel={false} />
                </div>
              </div>
            );
          })}
          {showMoreBtn('rooms', sortedRooms.length)}
        </div>
      </div>,
    // Streak Card
    streak: gamificationEnabled && isVisible('streak') && <div
        className="tq-card tq-card-padded"
        style={{
          background: 'var(--warm-streak-bg)',
          borderColor: 'var(--warm-streak-border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: 'var(--warm-card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1.5px solid var(--warm-streak-border)',
            }}
          >
            <FireIcon />
          </div>
          <div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 900,
                color: 'var(--warm-streak-text)',
                lineHeight: 1,
              }}
            >
              {currentUser.currentStreak}
            </div>
            <div style={{ fontSize: 12, color: 'var(--warm-streak-subtext)', fontWeight: 700 }}>
              {t('dashboard.dayStreak')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 7,
                borderRadius: 4,
                backgroundColor:
                  i < (currentUser.currentStreak % 7 || 7)
                    ? 'var(--warm-accent)'
                    : 'var(--warm-streak-border)',
              }}
            />
          ))}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--warm-streak-subtext)',
            marginTop: 10,
            fontWeight: 600,
          }}
        >
          {streakDoneToday ? t('dashboard.streakDoneToday') : t('dashboard.keepStreak')}
        </div>
        {data.shields && (
          <ShieldPanel shields={currentUser.streakShields ?? 0} streak={currentUser.currentStreak} coins={currentUser.coins} config={data.shields}
            language={language} onChanged={() => { onRefresh?.(); onCoinsChanged?.(); }} />
        )}
      </div>,
    coins: gamificationEnabled && isVisible('coins') && <div className="tq-card tq-card-padded">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{t('dashboard.coinsStatusTitle')}</div>
          <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '3px 8px', backgroundColor: 'var(--warm-accent-light)', color: 'var(--warm-accent)', border: '1px solid var(--warm-accent)' }}>
            {coinsSortedFamily.length}
          </span>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {coinsSortedFamily.slice(0, 6).map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <UserAvatar userId={u.id} name={u.displayName} color={u.avatarColor} size={28} avatarType={u.avatarType as any} avatarPreset={u.avatarPreset} avatarPhotoUrl={u.avatarPhotoUrl} />
              <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>{u.displayName}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: 'var(--warm-coin)' }}>
                {formatCoins(u.coins)} <CoinIcon />
              </div>
            </div>
          ))}
        </div>
      </div>,
    myGoal: gamificationEnabled && isVisible('myGoal') && myGoal && (
        <div className="tq-card tq-card-padded">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{t('dashboard.myGoal')}</div>
            {myGoal.completed && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--health-green)', background: 'var(--health-green-bg, rgba(34,197,94,0.12))', padding: '2px 8px', borderRadius: 8 }}>{t('dashboard.goalCompleted')}</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--warm-text-muted)', fontWeight: 700, marginBottom: 8 }}>
            {myGoal.currentCoins}/{myGoal.goalCoins} {t('leaderboard.points')}
          </div>
          {(myGoal.goalStartAt || myGoal.goalEndAt) && (
            <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 700, marginBottom: 8 }}>
              {(myGoal.goalStartAt ? new Date(myGoal.goalStartAt).toLocaleDateString() : '...')} - {(myGoal.goalEndAt ? new Date(myGoal.goalEndAt).toLocaleDateString() : '...')}
            </div>
          )}
          <HealthBar value={myGoal.progress} height={8} showLabel={false} />
          {(myGoal.rewardCoins ?? 0) > 0 && (
            <div style={{ fontSize: 11, fontWeight: 800, color: myGoal.completed ? 'var(--health-green)' : 'var(--warm-text-muted)', marginTop: 6 }}>
              {myGoal.completed ? `🎉 +${formatCoins(myGoal.rewardCoins)} ${t('goals.bonusEarned')}` : t('goals.bonusWhenReached').replace('{n}', formatCoins(myGoal.rewardCoins))}
            </div>
          )}
        </div>
      ),
    childrenGoals: gamificationEnabled && isVisible('childrenGoals') && currentUser.role === 'admin' && childrenGoals.length > 0 && (
        <div className="tq-card tq-card-padded">
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)', marginBottom: 8 }}>{t('dashboard.childrenGoals')}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {childrenGoals.map((cg) => (
              <div key={cg.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--warm-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--warm-text-secondary)' }}>
                  <span>{cg.displayName}</span>
                  <span>{cg.goalCoins ? `${formatCoins(cg.currentCoins ?? cg.coins)}/${formatCoins(cg.goalCoins)}` : t('dashboard.noGoal')}</span>
                </div>
                {(cg.goalStartAt || cg.goalEndAt) && (
                  <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 700, marginTop: 2 }}>
                    {(cg.goalStartAt ? new Date(cg.goalStartAt).toLocaleDateString() : '...')} - {(cg.goalEndAt ? new Date(cg.goalEndAt).toLocaleDateString() : '...')}
                  </div>
                )}
                {cg.goalCoins && <HealthBar value={cg.progress || 0} height={6} showLabel={false} />}
              </div>
            ))}
          </div>
        </div>
      ),
    rewardRequests: gamificationEnabled && isVisible('rewardRequests') && currentUser.role === 'admin' && (
        <div className="tq-card tq-card-padded">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{t('dashboard.rewardRequestsTitle')}</div>
            <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '3px 8px', backgroundColor: 'var(--warm-accent-light)', color: 'var(--warm-accent)', border: '1px solid var(--warm-accent)' }}>
              {pendingRewardRequests.length}
            </span>
          </div>
          {pendingRewardRequests.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 700 }}>
              {t('dashboard.rewardRequestEmpty')}
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {pendingRewardRequests.slice(0, 6).map((rr) => (
              <div key={rr.id} style={{ border: '1px solid var(--warm-border)', backgroundColor: 'var(--warm-bg-subtle)', borderRadius: 12, padding: '8px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text)' }}>{rr.displayName}</div>
                <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 700 }}>{rr.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 700 }}>
                    {timeAgo(rr.redeemedAt)}
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 800, color: 'var(--warm-accent)' }}>
                      <CoinIcon /> {rr.costCoins}
                    </span>
                    <button className="tq-btn tq-btn-secondary" onClick={() => onRewardRequestAction(rr.id, 'approved')} style={{ padding: '4px 7px', fontSize: 10 }}>
                      {t('dashboard.approve')}
                    </button>
                    <button className="tq-btn" onClick={() => onRewardRequestAction(rr.id, 'rejected')} style={{ padding: '4px 7px', fontSize: 10, backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>
                      {t('dashboard.reject')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {pendingRewardRequests.length > 6 && onNavigateToRewards && (
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={onNavigateToRewards} style={{ marginTop: 8, width: '100%' }}>
              {t('home.seeAllRequests').replace('{n}', String(pendingRewardRequests.length))}
            </button>
          )}
        </div>
      ),
    // Mini Leaderboard
    leaderboard: gamificationEnabled && isVisible('leaderboard') && <div className="tq-card tq-card-padded">
        <h3
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: 'var(--warm-text)',
            margin: '0 0 12px',
          }}
        >
          {leaderboardPeriod === 'month' ? t('leaderboard.thisMonth')
            : leaderboardPeriod === 'quarter' ? t('leaderboard.thisQuarter')
            : leaderboardPeriod === 'year' ? t('leaderboard.thisYear')
            : t('leaderboard.thisWeek')}
        </h3>
        {sortedFamily.map((u, i) => (
          <div
            key={u.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 0',
              borderBottom:
                i < sortedFamily.length - 1 ? '1px solid var(--warm-border)' : 'none',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                backgroundColor: i === 0 ? 'var(--warm-accent-light)' : 'var(--warm-bg-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 900,
                color: i === 0 ? 'var(--warm-accent)' : 'var(--warm-text-light)',
                border: i === 0 ? '1.5px solid var(--warm-accent)' : '1px solid var(--warm-border)',
              }}
            >
              #{i + 1}
            </div>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <UserAvatar userId={u.id} name={u.displayName} color={u.avatarColor} size={32} avatarType={u.avatarType as any} avatarPreset={u.avatarPreset} avatarPhotoUrl={u.avatarPhotoUrl} />
              {badges?.[u.id] && (
                <span
                  title={t(`achievements.badge_${badges[u.id]}`)}
                  style={{
                    fontSize: 8,
                    background: BADGE_COLORS[badges[u.id]!] || '#888',
                    color: 'white',
                    borderRadius: '50%',
                    width: 16,
                    height: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'absolute',
                    bottom: -2,
                    right: -2,
                    fontWeight: 900,
                  }}
                >★</span>
              )}
            </div>
            <div
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--warm-text)',
              }}
            >
              {u.displayName}
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--warm-accent)' }}>
              {u.points}
            </div>
          </div>
        ))}
      </div>,
    // Recent Activity
    recentActivity: isVisible('recentActivity') && <div className="tq-card tq-card-padded">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: 'var(--warm-text)',
              margin: 0,
            }}
          >
            {t('dashboard.recentActivity')}
          </h3>
          <button
            className="tq-btn tq-btn-secondary"
            onClick={onNavigateToActivity}
            style={{ padding: '6px 12px', fontSize: 11 }}
          >
            {t('dashboard.more')}
          </button>
        </div>
        {recentActivity.slice(0, 5).map((h, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 0',
              borderBottom: i < 4 ? '1px solid var(--warm-border-subtle)' : 'none',
            }}
          >
            <UserAvatar userId={h.userId} name={h.displayName} color={h.avatarColor} size={28} avatarType={h.avatarType as any} avatarPreset={h.avatarPreset} avatarPhotoUrl={h.avatarPhotoUrl} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>
                {taskName(h.taskName, h.translationKey)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                {t('history.by')} {h.displayName}
              </div>
              <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                {roomDisplayName(h.roomName, roomTypeById.get(h.roomId) || '')} &middot; {timeAgo(h.completedAt)}
              </div>
            </div>
            {gamificationEnabled && <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 11,
                fontWeight: 800,
                color: 'var(--warm-coin)',
              }}
            >
              +{h.coinsEarned} <CoinIcon />
            </div>}
          </div>
        ))}
      </div>,
  };

  return (
    <>
    {/* Customise: this person's card order and hidden cards */}
    {showCustomize && (
      <HomeLayoutEditor
        cards={listedCards.map((id) => ({ id, label: CARD_LABELS[id as HomeCardId] ?? id, visible: !hiddenCards.has(id) }))}
        onPlace={(id, target, where) => saveLayout({ ...layout, order: placeCard(cardOrder, id, target, where) })}
        onStep={(id, dir) => saveLayout({ ...layout, order: moveCard(cardOrder, id, dir, listedCards) })}
        onToggle={toggleCard}
        onReset={() => saveLayout({ order: [], hidden: [] })}
        onClose={() => { setShowCustomize(false); setLayoutError(false); }}
        error={layoutError}
        t={t}
      />
    )}

    <div className="dashboard-grid">

        {/* Kid mode: coins, streak and this week's goal, big and up front */}
        {kidMode && gamificationEnabled && (
          <div className="tq-card tq-card-padded kid-hero" style={{ gridColumn: '1 / -1', background: 'var(--warm-streak-bg)', borderColor: 'var(--warm-streak-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 36, fontWeight: 900, color: 'var(--warm-streak-text)' }}>
                <span style={{ transform: 'scale(1.6)', display: 'inline-flex', marginRight: 6 }}><CoinIcon /></span>{formatCoins(currentUser.coins)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 22, fontWeight: 800, color: 'var(--warm-streak-text)' }}>
                <FireIcon /> {currentUser.currentStreak}
              </div>
            </div>
            {/* Kid mode has no streak card, so buying a shield lives here */}
            {data.shields && (
              <ShieldPanel shields={currentUser.streakShields ?? 0} streak={currentUser.currentStreak} coins={currentUser.coins} config={data.shields}
                language={language} onChanged={() => { onRefresh?.(); onCoinsChanged?.(); }} />
            )}
            {myGoal && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 15, fontWeight: 800, color: 'var(--warm-text)', marginBottom: 6 }}>
                  <span>{myGoal.completed ? `🎉 ${t('dashboard.goalCompleted')}` : t('dashboard.myGoal')}</span>
                  <span>{myGoal.currentCoins} / {myGoal.goalCoins}</span>
                </div>
                <HealthBar value={myGoal.progress} height={14} showLabel={false} />
                {(myGoal.rewardCoins ?? 0) > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 800, color: myGoal.completed ? 'var(--health-green)' : 'var(--warm-text-muted)', marginTop: 6 }}>
                    {myGoal.completed ? `+${formatCoins(myGoal.rewardCoins)} ${t('goals.bonusEarned')}` : t('goals.bonusWhenReached').replace('{n}', formatCoins(myGoal.rewardCoins))}
                  </div>
                )}
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <LevelStrip level={myLevel} nextBadge={nextBadge} language={language} big userId={currentUser.id} nextUnlock={data.nextUnlock} />
            </div>
          </div>
        )}

        {/* Level and the next badge (kid mode shows them in the card above) */}
        {!kidMode && gamificationEnabled && myLevel && (currentUser.role !== 'admin' || myLevel.coinsEarned > 0) && (
          <div className="tq-card" style={{ gridColumn: '1 / -1', padding: '12px 16px' }}>
            <LevelStrip level={myLevel} nextBadge={nextBadge} language={language} userId={currentUser.id} nextUnlock={data.nextUnlock} />
          </div>
        )}

        {teamPick && (
          <TeamUpDialog task={{ id: teamPick.id, name: taskName(teamPick.name, teamPick.translationKey) }} language={language}
            people={(users ?? []).filter((u) => u.id !== currentUser.id && ((teamPick.effectiveAssignedUserIds ?? []).length === 0 || teamPick.effectiveAssignedUserIds!.includes(u.id)))}
            onClose={() => setTeamPick(null)} onStarted={() => onRefresh?.()} />
        )}

        {/* Double coins events running now, with time left */}
        {boosts.length > 0 && (
          <div className="tq-card tq-card-padded boost-banner" style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, var(--warm-accent-light), var(--warm-card))', borderColor: 'var(--warm-accent)' }}>
            {boosts.map((b) => (
              <button key={b.id} type="button" className="boost-banner-row" onClick={() => setOpenBoostId(b.id)} aria-haspopup="dialog"
                style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'Nunito', color: 'inherit' }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: 'var(--warm-accent)' }}>⚡ {b.multiplier}×</span>
                <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: 'var(--warm-text)' }}>{b.title}</span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                    {t('boosts.left').replace('{time}', timeLeft(b.endAt))}
                    {` · ${boostTargets(b)}`}
                  </span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)', whiteSpace: 'nowrap' }}>{t('boosts.seeChores')} ›</span>
              </button>
            ))}
          </div>
        )}

        {/* The cards, in this person's order */}
        {cardOrder.filter(isVisible).map((id) => <React.Fragment key={id}>{homeCards[id]}</React.Fragment>)}

        {/* Always here, so a hidden or moved card can come back */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
          <button type="button" className="tq-btn tq-btn-secondary" onClick={() => setShowCustomize(true)} style={{ fontSize: 12 }}>
            ⚙ {t('dashboard.customise')}
          </button>
        </div>
    </div>
    {proofQuest && (
      <ProofModal
        taskTitle={taskName(proofQuest.name, proofQuest.translationKey)}
        language={language}
        onClose={() => setProofQuest(null)}
        onSubmit={async (proof) => { onCompleteTask(proofQuest.id, proof); setProofQuest(null); }}
      />
    )}
    {adminModalQuest && (
      <AdminCompleteModal
        task={adminModalQuest}
        allUsers={(users || []) as any[]}
        language={language}
        onConfirm={async (userIds) => {
          try {
            for (const uid of userIds) {
              await api.completeTask(adminModalQuest.id, uid);
            }
          } catch (e) {
            console.error('Failed to complete task for some users:', e);
          }
          setAdminModalQuest(null);
          onRefresh?.();
        }}
        onClose={() => setAdminModalQuest(null)}
      />
    )}
    {openBoost && (
      <BoostDetails boost={openBoost} rooms={allRooms} userId={currentUser.id} role={currentUser.role} coinsByEffort={coinsByEffort}
        multiplierFor={multiplierFor} language={language} onClose={() => setOpenBoostId(null)}
        onOpenTask={(roomId, taskId) => (onOpenTask ? onOpenTask(roomId, taskId) : onNavigateToRoom(roomId))} onOpenRoom={onNavigateToRoom} />
    )}
    <UndoToast undo={snoozeUndo} language={language} onClose={closeSnoozeUndo} onRestored={() => onRefresh?.()} />
  </>
  );
};

export default Dashboard;
