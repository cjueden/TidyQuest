import React, { useState, useEffect } from 'react';
import HealthBar from '../shared/HealthBar';
import { LevelStrip } from '../shared/LevelStrip';
import { TodoQuickAdd } from '../shared/TodoQuickAdd';
import { localeFor } from '../../utils/locale';
import type { BadgeItem, LevelInfo } from '../../utils/badges';
import RingGauge from '../shared/RingGauge';
import UserAvatar from '../shared/UserAvatar';
import { FireIcon, CoinIcon, CheckIcon } from '../icons/UIIcons';
import { getRoomIcon } from '../icons/RoomIcons';
import { TaskIcon } from '../icons/TaskIcons';
import { getHealthColor } from '../../utils/health';
import { useTranslation } from '../../hooks/useTranslation';
import { isTaskForUser, taskCoins } from '../../utils/tasks';
import { useTaskView } from '../../hooks/useTaskView';
import { AllMineToggle } from '../shared/AllMineToggle';
import { PendingApprovals, type PendingItem } from '../shared/PendingApprovals';
import { ProofModal, type Proof } from '../shared/ProofModal';
import type { CoinBoost } from '../../hooks/useApi';
import { formatCoins } from '../../utils/format';
import { AdminCompleteModal } from '../shared/AdminCompleteModal';
import { api } from '../../hooks/useApi';

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
  /** The viewer's own completions of this task still waiting for a parent (Strict Mode) */
  myPendingCount?: number;
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
  avatarColor: string;
  lastActiveDate?: string | null;
  taskView?: 'all' | 'mine' | 'mineOnly';
  kidMode?: number | boolean;
}

interface ActivityEntry {
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
    currentUser: CurrentUser;
    recentActivity: ActivityEntry[];
    badges?: Record<number, string | null>;
  };
  family: FamilyMember[];
  users?: Array<{ id: number; displayName: string; role: string; avatarColor: string; avatarType?: string; avatarPreset?: string; avatarPhotoUrl?: string }>;
  language?: string;
  onCompleteTask: (taskId: number, proof?: Proof) => void;
  onRefresh?: () => void;
  onNavigateToRoom: (roomId: number) => void;
  /** Open a task in its room, scrolled to and highlighted */
  onOpenTask?: (roomId: number, taskId: number) => void;
  coinsByEffort?: Record<number, number>;
  onNavigateToActivity: () => void;
  onRewardRequestAction: (id: number, status: 'approved' | 'rejected') => void | Promise<void>;
  gamificationEnabled?: boolean;
  leaderboardPeriod?: 'week' | 'month' | 'quarter' | 'year';
}

/* ── Component ── */

const Dashboard: React.FC<DashboardProps> = ({
  data,
  family,
  users,
  language,
  onCompleteTask,
  onRefresh,
  onNavigateToRoom,
  onOpenTask,
  coinsByEffort,
  onNavigateToActivity,
  onRewardRequestAction,
  gamificationEnabled = true,
  leaderboardPeriod = 'week',
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
  const boostFor = (q: Quest) => boosts.reduce((m, b) => (!b.roomIds || b.roomIds.includes(q.roomId) ? Math.max(m, b.multiplier) : m), 1);
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
  const readyTasks = filterQuests(allReadyTasks);
  const todoTasks = filterQuests(data.todoQuests ?? []);
  const [showTodoAdd, setShowTodoAdd] = useState(false);
  const [todoNotice, setTodoNotice] = useState('');

  // The Done button for a chore in the newer Home sections (To-do, Your usual, Maybe you forgot,
  // Rescue Mission): the same rules as the lists above, for scheduled and anytime chores alike
  const doneState = (q: Quest): { disabled: boolean; label: string } => {
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
  const finish = (q: Quest) => {
    const isAdminOrMember = currentUser.role === 'admin' || currentUser.role === 'member';
    const hasAssignees = (q.effectiveAssignedUserIds && q.effectiveAssignedUserIds.length > 0) || q.assignedToChildren;
    if (isAdminOrMember && hasAssignees) setAdminModalQuest(q);
    else onCompleteTask(q.id);
  };
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
          {proofButton(q, !state.disabled)}
          <button onClick={(e) => { e.stopPropagation(); if (!state.disabled) finish(q); }} disabled={state.disabled} className={state.disabled ? 'tq-btn' : 'tq-btn tq-btn-primary'}
            style={{ padding: '8px 14px', fontSize: 12, ...(state.disabled ? { opacity: 0.55, cursor: 'default', backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', color: 'var(--warm-text-muted)' } : {}) }}>
            {state.disabled ? state.label : <><CheckIcon /> {state.label}</>}
          </button>
        </span>
      </div>
    );
  };
  const scheduledTasks = filterQuests(allScheduledTasks);
  const onDemandTasks = filterQuests(allOnDemandTasks);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showCustomize, setShowCustomize] = useState(false);

  const ALL_CARDS = [
    { id: 'todaysQuests', label: t('dashboard.todaysQuests') },
    { id: 'todo', label: t('todos.title') },
    { id: 'scheduled', label: t('dashboard.scheduled') },
    { id: 'completedToday', label: t('dashboard.completedToday') },
    { id: 'rooms', label: t('nav.rooms') },
    { id: 'streak', label: t('dashboard.dayStreak') },
    { id: 'coins', label: t('dashboard.coinsStatusTitle') },
    { id: 'myGoal', label: t('dashboard.myGoal') },
    { id: 'childrenGoals', label: t('dashboard.childrenGoals') },
    { id: 'rewardRequests', label: t('dashboard.rewardRequestsTitle') },
    { id: 'pendingApprovals', label: t('approvals.title') },
    { id: 'leaderboard', label: t('app.leaderboardTitle') },
    { id: 'recentActivity', label: t('dashboard.recentActivity') },
  ];
  const LS_KEY = 'tq-dashboard-cards';
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); }
    catch { return new Set(); }
  });
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify([...hiddenCards]));
  }, [hiddenCards]);
  // Kid mode keeps Home to the essentials: their quests and what they finished today
  const KID_CARDS = new Set(['todaysQuests', 'todo', 'completedToday']);
  const isVisible = (id: string) => kidMode ? KID_CARDS.has(id) : !hiddenCards.has(id);
  const toggleCard = (id: string) => setHiddenCards(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
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

  return (
    <>
    {/* Customise panel */}
    {showCustomize && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}
        onClick={(e) => { if (e.target === e.currentTarget) setShowCustomize(false); }}>
        <div style={{ background: 'var(--warm-card)', border: '1.5px solid var(--warm-border)', borderRadius: 20, padding: 24, margin: 20, minWidth: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{t('dashboard.customise')}</div>
            <button onClick={() => setShowCustomize(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-text-muted)', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
              aria-label="Close">✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ALL_CARDS.map(card => (
              <label key={card.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={isVisible(card.id)} onChange={() => toggleCard(card.id)}
                  style={{ width: 16, height: 16, accentColor: 'var(--warm-accent)', cursor: 'pointer' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warm-text)' }}>{card.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
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
              <LevelStrip level={myLevel} nextBadge={nextBadge} language={language} big />
            </div>
          </div>
        )}

        {/* Level and the next badge (kid mode shows them in the card above) */}
        {!kidMode && gamificationEnabled && myLevel && (currentUser.role !== 'admin' || myLevel.coinsEarned > 0) && (
          <div className="tq-card" style={{ gridColumn: '1 / -1', padding: '12px 16px' }}>
            <LevelStrip level={myLevel} nextBadge={nextBadge} language={language} />
          </div>
        )}

        {/* Double coins events running now, with time left */}
        {boosts.length > 0 && (
          <div className="tq-card tq-card-padded boost-banner" style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, var(--warm-accent-light), var(--warm-card))', borderColor: 'var(--warm-accent)' }}>
            {boosts.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: 'var(--warm-accent)' }}>⚡ {b.multiplier}×</span>
                <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: 'var(--warm-text)' }}>{b.title}</span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                    {t('boosts.left').replace('{time}', timeLeft(b.endAt))}
                    {b.roomIds ? ` · ${b.roomIds.map((id) => rooms.find((r) => r.id === id)?.name ?? '').filter(Boolean).join(', ')}` : ` · ${t('boosts.allRooms')}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* House Health Card */}
        {!kidMode && (
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
        )}

        {/* Chores waiting for approval (parents, Strict Mode) */}
        {currentUser.role === 'admin' && isVisible('pendingApprovals') && pendingCompletions.length > 0 && (
          <div className="tq-card tq-card-padded" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)', margin: 0 }}>{t('approvals.title')}</h3>
              <span style={{ fontSize: 11, fontWeight: 800, backgroundColor: 'var(--warm-badge-bg)', color: 'var(--warm-badge-text)', padding: '4px 12px', borderRadius: 99 }}>
                {pendingCompletions.length}
              </span>
            </div>
            <PendingApprovals items={pendingCompletions} language={language} gamificationEnabled={gamificationEnabled} onChanged={() => onRefresh?.()} />
          </div>
        )}

        {/* Today's Quests Card — full width, sections: Ready to Complete / On Demand */}
        {isVisible('todaysQuests') && <div className="tq-card tq-card-padded">
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
                  {proofButton(q, !btnDisabled)}
                  <button onClick={(e) => { e.stopPropagation(); handleDone(); }} disabled={btnDisabled} className={btnDisabled ? 'tq-btn' : 'tq-btn tq-btn-primary'}
                    style={{ padding: '8px 14px', fontSize: 12, ...(btnDisabled ? { opacity: 0.55, cursor: 'default', backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', color: 'var(--warm-text-muted)', boxShadow: 'none' } : { backgroundColor: 'var(--warm-accent)', color: '#fff', boxShadow: '0 4px 14px var(--warm-primary-shadow)' }) }}>
                    {btnDisabled ? btnLabel : <><CheckIcon /> {btnLabel}</>}
                  </button>
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
                  const blocked = notMine || usedUp;
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
                      {proofButton(q, !blocked)}
                      <button onClick={(e) => { e.stopPropagation(); handleDone(); }} disabled={blocked} className={blocked ? 'tq-btn' : 'tq-btn tq-btn-primary'}
                        style={{ padding: '8px 14px', fontSize: 12, ...(blocked ? { opacity: 0.55, cursor: 'default', backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', color: 'var(--warm-text-muted)', boxShadow: 'none' } : { backgroundColor: 'var(--warm-accent)', color: '#fff', boxShadow: '0 4px 14px var(--warm-primary-shadow)' }) }}>
                        {notMine ? t('app.notAssigned') : usedUp ? t(q.repeatPeriod === 'day' ? 'repeat.doneToday' : 'repeat.doneThisWeek') : <><CheckIcon /> {t('roomDetail.done')}</>}
                      </button>
                      </span>
                    </div>
                  );
                })}
                {showMoreBtn('ondemand', onDemandTasks.length)}
              </>
            )}
          </div>
        </div>}

        {/* To-do: one-time chores ("Fix the screen door"); parents can add one here */}
        {isVisible('todo') && (todoTasks.length > 0 || currentUser.role === 'admin') && (
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
        )}

        {/* Scheduled Card — upcoming tasks not yet due */}
        {isVisible('scheduled') && scheduledTasks.length > 0 && (
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
        )}

        {/* Completed Today Card */}
        {isVisible('completedToday') && completedToday.length > 0 && (
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
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: c.roomColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${c.roomAccent}44` }}>
                    <TaskIcon iconKey={c.iconKey} size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>{taskName(c.name, c.translationKey)}</div>
                    <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                      {roomDisplayName(c.roomName, c.roomType || '')} &middot; {c.displayName}
                    </div>
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
        )}

      {/* ── Rooms ── */}
      {isVisible('rooms') && <div className="tq-card tq-card-padded">
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
      </div>}

      {/* ── Widgets ── */}
        {/* Streak Card */}
        {gamificationEnabled && isVisible('streak') && <div
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
        </div>}

        {gamificationEnabled && isVisible('coins') && <div className="tq-card tq-card-padded">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{t('dashboard.coinsStatusTitle')}</div>
            <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '3px 8px', backgroundColor: 'var(--warm-accent-light)', color: 'var(--warm-accent)', border: '1px solid var(--warm-accent)' }}>
              {coinsSortedFamily.length}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {coinsSortedFamily.slice(0, 6).map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <UserAvatar name={u.displayName} color={u.avatarColor} size={28} avatarType={u.avatarType as any} avatarPreset={u.avatarPreset} avatarPhotoUrl={u.avatarPhotoUrl} />
                <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>{u.displayName}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: 'var(--warm-coin)' }}>
                  {formatCoins(u.coins)} <CoinIcon />
                </div>
              </div>
            ))}
          </div>
        </div>}

        {gamificationEnabled && isVisible('myGoal') && myGoal && (
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
        )}

        {gamificationEnabled && isVisible('childrenGoals') && currentUser.role === 'admin' && childrenGoals.length > 0 && (
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
        )}

        {gamificationEnabled && isVisible('rewardRequests') && currentUser.role === 'admin' && (
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
          </div>
        )}

        {/* Mini Leaderboard */}
        {gamificationEnabled && isVisible('leaderboard') && <div className="tq-card tq-card-padded">
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
                <UserAvatar name={u.displayName} color={u.avatarColor} size={32} avatarType={u.avatarType as any} avatarPreset={u.avatarPreset} avatarPhotoUrl={u.avatarPhotoUrl} />
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
        </div>}

        {/* Recent Activity */}
        {isVisible('recentActivity') && <div className="tq-card tq-card-padded">
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
              <UserAvatar name={h.displayName} color={h.avatarColor} size={28} avatarType={h.avatarType as any} avatarPreset={h.avatarPreset} avatarPhotoUrl={h.avatarPhotoUrl} />
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
        </div>}
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
  </>
  );
};

export default Dashboard;
