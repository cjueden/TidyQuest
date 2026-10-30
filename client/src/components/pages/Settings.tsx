import { useCallback, useContext, useEffect, useState } from 'react';
import { UserAvatar } from '../shared/UserAvatar';
import { EffortDots } from '../shared/EffortDots';
import { Toggle } from '../shared/Toggle';
import { ShieldIcons } from '../shared/StreakShields';
import { PendingApprovals } from '../shared/PendingApprovals';
import { RewardRulesEditor } from '../shared/RewardRulesEditor';
import { CoinBoostsAdmin } from '../shared/CoinBoostsAdmin';
import { GoalRow } from '../shared/GoalRow';
import { TrashAdmin } from '../shared/TrashAdmin';
import { FamilyGoalAdmin } from '../shared/FamilyGoalAdmin';
import { BirthdayInput } from '../shared/BirthdayInput';
import { ThemePicker } from '../shared/ThemePicker';
import { isTheme, type Theme } from '../../utils/themes';
import { CustomBadgesAdmin } from '../shared/CustomBadgesAdmin';
import { FeaturesAdmin } from '../shared/FeaturesAdmin';
import { NotificationLog, NotifyScheduleAdmin, PeopleNotifyAdmin } from '../shared/NotifyAdmin';
import { CsvTransfer } from '../shared/CsvTransfer';
import { UndoToast, type UndoState } from '../shared/UndoToast';
import { byFeatured, rulesSummary } from '../../utils/rewardRules';
import { formatCoins } from '../../utils/format';
import { BellIcon, DownloadIcon, UploadIcon, LockIcon, CoinIcon } from '../icons/UIIcons';
import { AVATAR_PRESETS } from '../icons/AvatarPresets';
import { useTranslation } from '../../hooks/useTranslation';
import type { User } from '../../hooks/useAuth';
import { api, type FocusModeSetting, type RewardRules } from '../../hooks/useApi';
import { CosmeticsContext } from '../../utils/unlocks';
import { useNavigate } from 'react-router-dom';
import { localeFor } from '../../utils/locale';
import { weekdayName } from '../../utils/schedule';
import { useWeekStart } from '../../utils/week';
import { TimeZonePicker } from '../shared/TimeZonePicker';
import { FamilyCodeCard, SignInEmailCard } from '../shared/HostedAccount';
import { limitError, useHosted, type HostedAccount } from '../../utils/hosted';
import { dateStr, endOfHomeDay } from '../../utils/clock';

interface FamilyUser {
  id: number;
  displayName: string;
  role?: 'admin' | 'member' | 'child';
  avatarColor: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
  coins: number;
  currentStreak: number;
  streakShields?: number;
  language?: string;
  /** 'MM-DD' */
  birthday?: string | null;
  theme?: string | null;
  goalCoins?: number | null;
  goalStartAt?: string | null;
  goalEndAt?: string | null;
  isVacationMode?: number;
  vacationStartDate?: string | null;
  vacationEndDate?: string | null;
  isParticipant?: number;
  taskView?: 'all' | 'mine' | 'mineOnly';
  kidMode?: number | boolean;
  focusMode?: FocusModeSetting;
}

interface VacationConfig {
  vacationMode: boolean;
  vacationStartDate: string | null;
  vacationEndDate: string | null;
}

interface PendingCompletion {
  id: number;
  taskId: number;
  userId: number;
  completedAt: string;
  coinsEarned: number;
  taskName: string;
  translationKey?: string | null;
  roomId: number;
  roomName: string;
  displayName: string;
  note?: string | null;
  photoUrl?: string | null;
}

interface SettingsProps {
  user: User;
  family: FamilyUser[];
  /** For choosing rooms in double coins events, and tasks for parent-made badges */
  rooms?: Array<{ id: number; name: string; roomType?: string; tasks?: Array<{ id: number; name: string; translationKey?: string }> }>;
  vacationConfig?: VacationConfig;
  onUpdateVacation?: (data: { vacationMode?: boolean; vacationEndDate?: string | null }) => Promise<void>;
  onUpdateRole: (userId: number, role: 'admin' | 'member' | 'child') => void;
  onAddMember: (data: { username: string; password: string; displayName: string; role: 'child' }) => Promise<void>;
  onDeleteUser: (userId: number) => Promise<void>;
  onUpdateMemberProfile: (userId: number, data: { avatarType?: string; avatarColor?: string; avatarPreset?: string | null; language?: string; birthday?: string | null; theme?: string | null }) => Promise<void>;
  onChangePassword: (userId: number, data: { currentPassword?: string; newPassword: string }) => Promise<void>;
  coinsByEffort: Record<number, number>;
  onSaveCoinsByEffort: (values: Record<number, number>) => Promise<void>;
  onResetCoinsByEffort: () => Promise<void>;
  onExport: () => void;
  onImport: () => void;
  onAdjustCoins?: (userId: number, amount: number, reason?: string) => Promise<void>;
  gamificationEnabled?: boolean;
  onGamificationChange?: (enabled: boolean) => void;
  /** Tasks or rooms changed here (spreadsheet import, restore from the trash): reload them */
  onDataChanged?: () => void;
  /** Streak shields (null when off) and a parent giving one */
  shields?: { max: number } | null;
  onGiveShield?: (userId: number) => Promise<void>;
  /** The family's first day of the week changed (FIX-11): save it and reload the dashboard */
  onWeekStartChange?: (weekStart: 0 | 1) => Promise<void>;
  /** The family's time zone (dashboard timeZone) and whether a parent picked it (timeZoneSet) */
  timeZone?: { zone: string; set: boolean };
  onTimeZoneChange?: (zone: string) => Promise<void>;
  /** Hosted mode: the family code and this person's sign-in email (null when self-hosted) */
  hostedAccount?: HostedAccount | null;
  onHostedChanged?: () => void;
}

const COLORS = ['#F97316', '#9B72CF', '#4AABDE', '#5CB85C', '#D4A017', '#E25A5A', '#38BDF8', '#EC4899'];

const REWARDS_SHOWN = 12;

export function Settings({
  user,
  family,
  vacationConfig,
  onUpdateVacation,
  onUpdateRole,
  onAddMember,
  onDeleteUser,
  onUpdateMemberProfile,
  onChangePassword,
  coinsByEffort,
  onSaveCoinsByEffort,
  onResetCoinsByEffort,
  onExport,
  onImport,
  onAdjustCoins,
  rooms = [],
  gamificationEnabled = true,
  onGamificationChange,
  onDataChanged,
  shields = null,
  onGiveShield,
  onWeekStartChange,
  timeZone,
  onTimeZoneChange,
  hostedAccount = null,
  onHostedChanged = () => {},
}: SettingsProps) {
  const { t } = useTranslation(user.language);
  const weekStart = useWeekStart();
  /** The day being saved, shown until the dashboard brings the new week start back */
  const [weekStartPick, setWeekStartPick] = useState<0 | 1 | null>(null);
  // Each person's level, so a parent sees which themes a kid has unlocked
  const cosmetics = useContext(CosmeticsContext);
  const navigate = useNavigate();
  const isAdmin = user.role === 'admin';
  // Hosted mode only sends to ntfy.sh and Telegram
  const hosted = useHosted();
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [coinsDraft, setCoinsDraft] = useState<Record<number, number>>(coinsByEffort);
  const [memberEditOpen, setMemberEditOpen] = useState<Record<number, boolean>>({});
  const [memberPassword, setMemberPassword] = useState<Record<number, string>>({});
  const [memberPasswordMsg, setMemberPasswordMsg] = useState<Record<number, string>>({});
  const [logoutAllMsg, setLogoutAllMsg] = useState<Record<number, string>>({});
  const [memberGoals, setMemberGoals] = useState<Record<number, Array<{ id: number; title: string; goalCoins: number; rewardCoins?: number; repeatWeekly?: number; status?: string; startAt?: string | null; endAt?: string | null }>>>({});
  const [goalRepeat, setGoalRepeat] = useState<Record<number, boolean>>({});
  const [rulesOpenId, setRulesOpenId] = useState<number | null>(null);
  const [rotatingPerWeek, setRotatingPerWeek] = useState('3');
  const [coinReason, setCoinReason] = useState<Record<number, string>>({});
  const [goalDraft, setGoalDraft] = useState<Record<number, { title: string; goalCoins: string; rewardCoins: string; endAt: string }>>({});
  const [rewardsAdmin, setRewardsAdmin] = useState<Array<{ id: number; title: string; description?: string | null; costCoins: number; isActive?: boolean; isPreset?: boolean; category?: string | null; sortOrder?: number } & Partial<RewardRules>>>([]);
  const [rewardRequests, setRewardRequests] = useState<Array<{ id: number; title: string; displayName: string; costCoins: number; redeemedAt: string; status: string }>>([]);
  const [rewardDraft, setRewardDraft] = useState({ title: '', description: '', costCoins: '30' });
  const [editingRewardId, setEditingRewardId] = useState<number | null>(null);
  const [editingRewardTitle, setEditingRewardTitle] = useState('');
  const [editingRewardDesc, setEditingRewardDesc] = useState('');
  const [editingRewardCategory, setEditingRewardCategory] = useState('');
  const [undo, setUndo] = useState<UndoState | null>(null);
  const closeUndo = useCallback(() => setUndo(null), []);
  const [trashVersion, setTrashVersion] = useState(0);
  const [editingRewardCost, setEditingRewardCost] = useState('');
  const [memberProfile, setMemberProfile] = useState<Record<number, {
    language: string;
    avatarType: 'letter' | 'preset';
    avatarColor: string;
    avatarPreset: string;
    birthday: string;
    theme: string;
  }>>({});
  const [memberProfileMsg, setMemberProfileMsg] = useState<Record<number, string>>({});
  const [memberGoalMsg, setMemberGoalMsg] = useState<Record<number, string>>({});
  const [coinAdjust, setCoinAdjust] = useState<Record<number, string>>({});
  const [coinAdjustMsg, setCoinAdjustMsg] = useState<Record<number, string>>({});
  const [memberVacation, setMemberVacation] = useState<Record<number, boolean>>({});
  const [memberParticipant, setMemberParticipant] = useState<Record<number, boolean>>({});
  const [memberView, setMemberView] = useState<Record<number, { taskView: 'all' | 'mine' | 'mineOnly'; kidMode: boolean; focusMode: FocusModeSetting }>>({});
  const [hidePrivateRooms, setHidePrivateRooms] = useState(true);
  const [vacationEnabled, setVacationEnabled] = useState(!!vacationConfig?.vacationMode);
  const [vacationEndDate, setVacationEndDate] = useState(vacationConfig?.vacationEndDate ?? null);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [strictModeEnabled, setStrictModeEnabled] = useState(false);
  const [pendingCompletions, setPendingCompletions] = useState<PendingCompletion[]>([]);
  const [notifMasterEnabled, setNotifMasterEnabled] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [notifChatId, setNotifChatId] = useState('');
  const [notifToken, setNotifToken] = useState('');
  const [notifTime, setNotifTime] = useState('09:00');
  const [notifTypes, setNotifTypes] = useState<{ taskDue: boolean; rewardRequest: boolean; achievementUnlocked: boolean; choreApproval?: boolean; coinBoost?: boolean; outcome?: boolean; summary?: boolean; nudge?: boolean; reminder?: boolean }>({ taskDue: true, rewardRequest: true, achievementUnlocked: true, choreApproval: true, coinBoost: true, outcome: true, summary: true, nudge: true, reminder: true });
  const [notifHasToken, setNotifHasToken] = useState(false);
  const [notifMsg, setNotifMsg] = useState('');
  const [ntfyEnabled, setNtfyEnabled] = useState(false);
  const [ntfyServerUrl, setNtfyServerUrl] = useState('https://ntfy.sh');
  const [ntfyTopic, setNtfyTopic] = useState('');
  const [ntfyToken, setNtfyToken] = useState('');
  const [ntfyHasToken, setNtfyHasToken] = useState(false);

  const locale = localeFor(user.language);

  const formatDate = (isoDate?: string | null): string => {
    if (!isoDate) return '-';
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
  };

  const rewardStatusLabel = (status: string): string => {
    if (status === 'requested') return t('rewards.statusPending');
    if (status === 'approved') return t('rewards.statusApproved');
    if (status === 'rejected') return t('rewards.statusRejected');
    if (status === 'cancelled') return t('rewards.statusCancelled');
    return status;
  };

  const rewardPresetKeyByTitle: Record<string, string> = {
    'movie night pick': 'movie_night',
    'ice cream treat': 'ice_cream',
    'stay up 30 min': 'late_bedtime',
    'game time bonus': 'game_bonus',
    'choose dinner': 'choose_dinner',
    'park adventure': 'park_adventure',
    'no-chore pass': 'chore_pass',
    'family board game': 'board_game',
  };

  const rewardTitle = (r: { title: string; isPreset?: boolean }): string => {
    const k = rewardPresetKeyByTitle[r.title.toLowerCase()];
    if (k) return t(`rewardsPreset.${k}.title`);
    return r.title;
  };

  const rewardDesc = (r: { title: string; description?: string | null; isPreset?: boolean }): string => {
    const k = rewardPresetKeyByTitle[r.title.toLowerCase()];
    if (k) return t(`rewardsPreset.${k}.desc`);
    return r.description || '-';
  };

  useEffect(() => {
    setCoinsDraft(coinsByEffort);
  }, [coinsByEffort]);

  useEffect(() => {
    setVacationEnabled(!!vacationConfig?.vacationMode);
    setVacationEndDate(vacationConfig?.vacationEndDate ?? null);
  }, [vacationConfig?.vacationMode, vacationConfig?.vacationEndDate]);

  useEffect(() => {
    if (!isAdmin) return;
    api.getRegistrationConfig()
      .then((cfg) => setRegistrationEnabled(cfg.registrationEnabled))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    api.getKidsConfig().then((cfg) => setHidePrivateRooms(!!cfg.hidePrivateRooms)).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    api.getStrictModeConfig()
      .then((cfg) => setStrictModeEnabled(!!cfg.strictMode))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    api.getNotificationsConfig()
      .then((cfg) => {
        setNotifMasterEnabled(!!cfg.notificationsEnabled);
        setTelegramEnabled(!!cfg.telegramEnabled);
        setNotifChatId(cfg.chatId || '');
        setNotifTime(cfg.notificationTime || '09:00');
        setNotifTypes(cfg.notificationTypes || { taskDue: true, rewardRequest: true, achievementUnlocked: true });
        setNotifHasToken(!!cfg.hasToken);
        setNtfyEnabled(!!cfg.ntfyEnabled);
        setNtfyServerUrl(cfg.ntfyServerUrl || 'https://ntfy.sh');
        setNtfyTopic(cfg.ntfyTopic || '');
        setNtfyHasToken(!!cfg.hasNtfyToken);
      })
      .catch(() => {});
  }, [isAdmin]);

  const loadAdminGoals = async () => {
    if (!isAdmin) return;
    const entries = await Promise.all(
      family.filter((u) => u.id !== user.id && u.role !== 'admin').map(async (u) => ({ userId: u.id, goals: await api.getUserGoals(u.id) }))
    );
    const next: Record<number, Array<{ id: number; title: string; goalCoins: number; startAt?: string | null; endAt?: string | null }>> = {};
    entries.forEach((e) => { next[e.userId] = e.goals; });
    setMemberGoals(next);
  };

  // Undo an approval made by mistake (the coins go back, the request shows as rejected)
  const refundRedemption = async (rr: { id: number; title: string; costCoins: number }) => {
    if (!confirm(t('settings.refundRewardConfirm').replace('{reward}', rewardTitle(rr)).replace('{coins}', String(rr.costCoins)))) return;
    try {
      const updated = await api.refundRedemption(rr.id);
      setRewardRequests((prev) => prev.map((x) => (x.id === rr.id ? { ...x, status: updated.status } : x)));
      onDataChanged?.(); // coin totals
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    }
  };

  const loadRewardsAdmin = async () => {
    if (!isAdmin) return;
    const data = await api.getRewardsAdmin();
    // isActive comes as 0/1; hidden rewards (ENH-1) must read as false
    setRewardsAdmin((data.rewards || []).map((r) => ({ ...r, isActive: r.isActive === undefined ? true : !!r.isActive })));
    if (typeof data.rotatingPerWeek === 'number') setRotatingPerWeek(String(data.rotatingPerWeek));
    setRewardRequests(data.redemptions || []);
  };

  const loadPendingCompletions = async () => {
    if (!isAdmin) return;
    const data = await api.getPendingCompletions();
    setPendingCompletions(data.pending || []);
  };

  useEffect(() => {
    if (!isAdmin) return;
    void loadAdminGoals();
    void loadRewardsAdmin();
    void loadPendingCompletions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, family.length]);

  const resetMemberForm = () => {
    setShowAddMember(false);
    setAddMemberError('');
    setNewMemberName('');
    setNewMemberUsername('');
    setNewMemberPassword('');
  };

  const initMemberProfile = (u: FamilyUser) => {
    setMemberProfile((prev) => ({
      ...prev,
      [u.id]: prev[u.id] || {
        language: u.language || 'en',
        avatarType: u.avatarType === 'preset' ? 'preset' : 'letter',
        avatarColor: u.avatarColor || '#F97316',
        avatarPreset: u.avatarPreset || 'cat',
        birthday: u.birthday ?? '',
        theme: u.theme ?? '',
      },
    }));
  };

  const handleAddMember = async () => {
    if (!newMemberName.trim() || !newMemberUsername.trim() || !newMemberPassword.trim()) return;
    setAddMemberError('');
    try {
      await onAddMember({
        displayName: newMemberName.trim(),
        username: newMemberUsername.trim(),
        password: newMemberPassword,
        role: 'child',
      });
    } catch (err) {
      // A taken username, or hosted mode's limit on people
      setAddMemberError(limitError(err, t, (err as Error)?.message || t('common.actionFailed')));
      return;
    }
    resetMemberForm();
  };

  const handleSaveChildProfile = async (u: FamilyUser) => {
    const p = memberProfile[u.id];
    if (!p) return;
    await onUpdateMemberProfile(u.id, {
      language: p.language,
      avatarType: p.avatarType,
      avatarColor: p.avatarColor,
      avatarPreset: p.avatarType === 'preset' ? p.avatarPreset : null,
      birthday: p.birthday || null,
      theme: p.theme || null,
    });
    setMemberProfileMsg((prev) => ({ ...prev, [u.id]: t('common.saved') }));
    window.setTimeout(() => {
      setMemberProfileMsg((prev) => ({ ...prev, [u.id]: '' }));
    }, 2000);
  };

  const handleSetChildPassword = async (u: FamilyUser) => {
    const pwd = memberPassword[u.id] || '';
    if (!pwd.trim()) return;
    try {
      await onChangePassword(u.id, { newPassword: pwd });
      setMemberPassword((prev) => ({ ...prev, [u.id]: '' }));
      setMemberPasswordMsg((prev) => ({ ...prev, [u.id]: t('settings.passwordResetSignedOut').replace('{name}', u.displayName) }));
    } catch (err: any) {
      setMemberPasswordMsg((prev) => ({ ...prev, [u.id]: err?.message || t('settings.passwordUpdateFailed') }));
    }
  };

  // NEW-8: e.g. a lost tablet; their own devices only, everyone else stays signed in
  const handleLogoutAllDevices = async (u: FamilyUser) => {
    if (!confirm(t('settings.logoutAllDevicesConfirm').replace('{name}', u.displayName))) return;
    try {
      await api.logoutAllDevices(u.id);
      setLogoutAllMsg((prev) => ({ ...prev, [u.id]: t('settings.logoutAllDevicesDone').replace('{name}', u.displayName) }));
    } catch {
      setLogoutAllMsg((prev) => ({ ...prev, [u.id]: t('settings.logoutAllDevicesFailed') }));
    }
  };

  const handleAddGoal = async (u: FamilyUser) => {
    const d = goalDraft[u.id] || { title: '', goalCoins: '', rewardCoins: '', endAt: '' };
    if (!d.title.trim() || !d.goalCoins.trim()) return;
    const goalCoins = Math.max(1, Math.round(Number(d.goalCoins)));
    const rewardCoins = Number(d.rewardCoins) || 0;
    await api.createUserGoal(u.id, {
      title: d.title.trim(),
      goalCoins,
      rewardCoins,
      startAt: null,
      endAt: d.endAt ? endOfHomeDay(d.endAt) : null,
      repeatWeekly: !!goalRepeat[u.id],
    });
    setGoalRepeat((prev) => ({ ...prev, [u.id]: false }));
    setGoalDraft((prev) => ({ ...prev, [u.id]: { title: '', goalCoins: '', rewardCoins: '', endAt: '' } }));
    await loadAdminGoals();
  };

  const handleDeleteGoal = async (goalId: number, userId: number) => {
    try {
      await api.deleteGoal(goalId);
      await loadAdminGoals();
      setMemberGoalMsg((prev) => ({ ...prev, [userId]: t('settings.goalDeleted') }));
    } catch (err: any) {
      setMemberGoalMsg((prev) => ({ ...prev, [userId]: err?.message || t('settings.goalDeleteFailed') }));
    }
    window.setTimeout(() => {
      setMemberGoalMsg((prev) => ({ ...prev, [userId]: '' }));
    }, 2500);
  };

  const handleCreateReward = async () => {
    if (!rewardDraft.title.trim() || !rewardDraft.costCoins.trim()) return;
    await api.createReward({
      title: rewardDraft.title.trim(),
      description: rewardDraft.description.trim(),
      costCoins: Math.max(1, Math.round(Number(rewardDraft.costCoins))),
    });
    setRewardDraft({ title: '', description: '', costCoins: '30' });
    await loadRewardsAdmin();
  };

  const handleSeedRewards = async () => {
    const presets = [
      { title: 'Movie Night Pick', description: 'Choisir le film du soir en famille.', costCoins: 40 },
      { title: 'Ice Cream Treat', description: 'Une glace ou un dessert special.', costCoins: 30 },
      { title: 'Stay Up 30 Min', description: 'Se coucher 30 minutes plus tard.', costCoins: 35 },
      { title: 'Game Time Bonus', description: '30 minutes de jeu supplementaire.', costCoins: 50 },
      { title: 'Choose Dinner', description: 'Choisir le menu du diner.', costCoins: 45 },
      { title: 'Park Adventure', description: 'Sortie au parc en mode aventure.', costCoins: 60 },
      { title: 'No-Chore Pass', description: 'Une tache au choix sautee cette semaine.', costCoins: 80 },
      { title: 'Family Board Game', description: 'Choisir un jeu de societe pour la soiree.', costCoins: 25 },
    ];
    const existing = new Set(rewardsAdmin.map((r) => r.title.toLowerCase()));
    for (const p of presets) {
      if (!existing.has(p.title.toLowerCase())) {
        await api.createReward(p);
      }
    }
    await loadRewardsAdmin();
  };

  const startRewardEdit = (r: { id: number; title: string; description?: string | null; costCoins: number; category?: string | null }) => {
    setEditingRewardId(r.id);
    setEditingRewardCategory(r.category ?? '');
    setEditingRewardTitle(r.title);
    setEditingRewardDesc(r.description || '');
    setEditingRewardCost(String(r.costCoins));
  };

  // The catalog shows the first rewards; "Show all" opens the rest (a family can have 100+)
  const [showAllRewards, setShowAllRewards] = useState(false);
  // The admin list in the "Featured" order kids see first; ↑/↓ swaps neighbours and saves the whole order
  const orderedRewards = [...rewardsAdmin].sort((a, b) => Number(b.isActive !== false) - Number(a.isActive !== false) || byFeatured(a, b));
  const moveReward = async (id: number, step: -1 | 1) => {
    const ids = orderedRewards.map((r) => r.id);
    const i = ids.indexOf(id);
    const j = i + step;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api.orderRewards(ids);
    await loadRewardsAdmin();
  };
  const rewardCategories = [...new Set(rewardsAdmin.map((r) => r.category).filter((c): c is string => !!c))].sort();
  const deleteReward = async (r: { id: number; title: string }) => {
    const { trashId } = await api.deleteReward(r.id);
    await loadRewardsAdmin();
    setTrashVersion((v) => v + 1);
    if (trashId) setUndo({ trashIds: [trashId], message: t('trash.deleted').replace('{name}', rewardTitle(r)) });
  };

  const cancelRewardEdit = () => {
    setEditingRewardId(null);
    setEditingRewardTitle('');
    setEditingRewardDesc('');
    setEditingRewardCost('');
  };

  // Hide or show a reward (ENH-1): kids stop seeing it; requests already made still go through
  const toggleRewardHidden = async (r: { id: number; title: string; description?: string | null; costCoins: number; isActive?: boolean }) => {
    const show = r.isActive === false;
    const set = (isActive: boolean) => api.updateReward(r.id, { title: r.title, description: r.description || '', costCoins: r.costCoins, isActive });
    try {
      await set(show);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      return;
    }
    await loadRewardsAdmin();
    // A hidden reward moves to the end of the list (often past "Show all"), so say where it went
    setUndo({
      message: t(show ? 'pause.rewardShown' : 'pause.rewardHidden').replace('{name}', rewardTitle(r)),
      onUndo: async () => { await set(!show); await loadRewardsAdmin(); },
    });
  };

  const saveRewardEdit = async (r: { id: number; isActive?: boolean; category?: string | null }) => {
    const parsed = Math.max(1, Math.round(Number(editingRewardCost)));
    if (!Number.isFinite(parsed)) return;
    if (!editingRewardTitle.trim()) return;
    await api.updateReward(r.id, {
      title: editingRewardTitle.trim(),
      description: editingRewardDesc.trim() || '',
      costCoins: parsed,
      isActive: r.isActive !== false,
    });
    if (editingRewardCategory.trim() !== (r.category ?? '')) await api.setRewardCategory(r.id, editingRewardCategory.trim());
    cancelRewardEdit();
    await loadRewardsAdmin();
  };

  const saveNotifications = async () => {
    setNotifMsg('');
    try {
      if (notifMasterEnabled && !telegramEnabled && !ntfyEnabled) {
        setNotifMsg(t('settings.providerRequired'));
        return;
      }
      if (notifMasterEnabled && telegramEnabled && !notifChatId.trim()) {
        setNotifMsg(t('settings.telegramChatIdRequired'));
        return;
      }
      if (notifMasterEnabled && telegramEnabled && !notifHasToken && !notifToken.trim()) {
        setNotifMsg(t('settings.telegramTokenRequired'));
        return;
      }

      const payload: Record<string, any> = {
        notificationsEnabled: notifMasterEnabled,
        telegramEnabled,
        chatId: notifChatId.trim(),
        notificationTime: notifTime,
        notificationTypes: notifTypes,
        ntfyEnabled,
        ntfyServerUrl: ntfyServerUrl.trim() || 'https://ntfy.sh',
        ntfyTopic: ntfyTopic.trim(),
      };
      if (notifToken.trim()) payload.botToken = notifToken.trim();
      if (ntfyToken.trim()) payload.ntfyToken = ntfyToken.trim();
      const next = await api.updateNotificationsConfig(payload);
      setNotifMasterEnabled(!!next.notificationsEnabled);
      setTelegramEnabled(!!next.telegramEnabled);
      setNotifChatId(next.chatId || '');
      setNotifTime(next.notificationTime || '09:00');
      setNotifTypes(next.notificationTypes || { taskDue: true, rewardRequest: true, achievementUnlocked: true });
      setNotifHasToken(next.hasToken);
      setNotifToken('');
      setNtfyEnabled(!!next.ntfyEnabled);
      setNtfyServerUrl(next.ntfyServerUrl || 'https://ntfy.sh');
      setNtfyTopic(next.ntfyTopic || '');
      setNtfyHasToken(!!next.hasNtfyToken);
      setNtfyToken('');
      setNotifMsg(t('settings.notificationsSaved'));
    } catch (err: any) {
      setNotifMsg(err?.message || t('settings.notificationsSaveFailed'));
    }
  };

  const testTelegram = async () => {
    setNotifMsg('');
    try {
      await api.sendNotificationsTest({
        provider: 'telegram',
        chatId: notifChatId.trim() || undefined,
        botToken: notifToken.trim() || undefined,
      });
      setNotifMsg(t('settings.notificationsTestSent'));
    } catch (err: any) {
      setNotifMsg(err?.message || t('settings.notificationsTestFailed'));
    }
  };

  const testNtfy = async () => {
    setNotifMsg('');
    try {
      await api.sendNotificationsTest({
        provider: 'ntfy',
        ntfyServerUrl: ntfyServerUrl.trim() || undefined,
        ntfyTopic: ntfyTopic.trim() || undefined,
        ntfyToken: ntfyToken.trim() || undefined,
      });
      setNotifMsg(t('settings.ntfyTestSent'));
    } catch (err: any) {
      setNotifMsg(err?.message || t('settings.ntfyTestFailed'));
    }
  };

  const saveCoins = async () => {
    await onSaveCoinsByEffort(coinsDraft);
  };

  const resetCoins = async () => {
    await onResetCoinsByEffort();
    setCoinsDraft({ 1: 5, 2: 10, 3: 15, 4: 20, 5: 25 });
  };

  return (
    <div className="page-enter settings-page">
      {/* The guide: setup, how it all connects, troubleshooting (its own page) */}
      <div className="tq-card tq-card-padded" style={{ display: 'grid', gap: 8 }}>
        <h3 className="tq-card-title" style={{ margin: 0 }}>📖 {t('guide.title')}</h3>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)' }}>{t('guide.settingsDesc')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" onClick={() => navigate('/guide')}>{t('guide.open')}</button>
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => navigate('/guide#troubleshooting')}>🧰 {t('guide.troubleshooting')}</button>
        </div>
      </div>
      {/* Two columns that each grow at their own height, grouped; one column on phones. Long lists go full width below. */}
      <div className={`settings-cols${isAdmin ? '' : ' settings-cols-single'}`}>
        <div className="settings-col">
          <div className="settings-group-title">🏠 {t('settingsGroups.household')}</div>
          <div className="tq-card tq-card-padded">
            <h3 className="tq-card-title">{t('settings.general')}</h3>
            {user.role !== 'child' && (<>
            {/* Master Notifications toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: (isAdmin && notifMasterEnabled) ? 'none' : '1px solid var(--warm-border)' }}>
              <BellIcon />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.notifications')}</div>
                <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('settings.notificationsDesc')}</div>
              </div>
              <Toggle checked={notifMasterEnabled} onChange={isAdmin ? setNotifMasterEnabled : () => {}} />
            </div>
            {isAdmin && (
              <div style={{ display: 'grid', gap: 8, marginTop: notifMasterEnabled ? 10 : 0, marginBottom: 8, padding: notifMasterEnabled ? 10 : 0, border: notifMasterEnabled ? '1px solid var(--warm-border)' : 'none', borderRadius: 10 }}>
                {notifMasterEnabled ? (
                  <>
                    {/* Notification time */}
                    <div style={{ display: 'grid', gap: 4 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>{t('settings.notificationTime')}</label>
                      <input type="time" className="tq-input" value={notifTime} onChange={(e) => setNotifTime(e.target.value || '09:00')} />
                    </div>
                    {/* Notification types */}
                    <div style={{ display: 'grid', gap: 6, marginTop: 2 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                        <input type="checkbox" checked={notifTypes.taskDue} onChange={(e) => setNotifTypes((prev) => ({ ...prev, taskDue: e.target.checked }))} style={{ marginRight: 6 }} />
                        {t('settings.notificationTypeTaskDue')}
                      </label>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                        <input type="checkbox" checked={notifTypes.rewardRequest} onChange={(e) => setNotifTypes((prev) => ({ ...prev, rewardRequest: e.target.checked }))} style={{ marginRight: 6 }} />
                        {t('settings.notificationTypeRewardRequest')}
                      </label>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                        <input type="checkbox" checked={notifTypes.achievementUnlocked} onChange={(e) => setNotifTypes((prev) => ({ ...prev, achievementUnlocked: e.target.checked }))} style={{ marginRight: 6 }} />
                        {t('settings.notificationTypeAchievementUnlocked')}
                      </label>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                        <input type="checkbox" checked={notifTypes.choreApproval !== false} onChange={(e) => setNotifTypes((prev) => ({ ...prev, choreApproval: e.target.checked }))} style={{ marginRight: 6 }} />
                        {t('settings.notificationTypeChoreApproval')}
                      </label>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                        <input type="checkbox" checked={notifTypes.coinBoost !== false} onChange={(e) => setNotifTypes((prev) => ({ ...prev, coinBoost: e.target.checked }))} style={{ marginRight: 6 }} />
                        {t('settings.notificationTypeCoinBoost')}
                      </label>
                      {(['reminder', 'outcome', 'summary', 'nudge'] as const).map((k) => (
                        <label key={k} style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
                          <input type="checkbox" checked={notifTypes[k] !== false} onChange={(e) => setNotifTypes((prev) => ({ ...prev, [k]: e.target.checked }))} style={{ marginRight: 6 }} />
                          {t(`notifyAdmin.kind_${k}`)} <span style={{ fontWeight: 600, color: 'var(--warm-text-light)' }}>· {t(`notifyAdmin.kindDesc_${k}`)}</span>
                        </label>
                      ))}
                    </div>

                    {/* Telegram sub-toggle */}
                    <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--warm-border)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21.2 4.4L2.4 11.1c-.6.2-.6.7 0 .9l4.8 1.5 1.8 5.8c.2.5.7.5 1 .2l2.6-2.1 5.1 3.7c.5.4 1.1.1 1.2-.5L22.2 5.4c.2-.8-.4-1.3-1-1z" stroke="var(--warm-text-light)" strokeWidth="1.5" strokeLinejoin="round" fill="none"/></svg>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--warm-text)' }}>Telegram</div>
                        <Toggle checked={telegramEnabled} onChange={setTelegramEnabled} />
                      </div>
                      {telegramEnabled && (
                        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                          <input className="tq-input" value={notifChatId} onChange={(e) => setNotifChatId(e.target.value)} placeholder={t('settings.telegramChatId')} />
                          <div style={{ fontSize: 11, color: 'var(--warm-text-muted)', fontWeight: 700 }}>{t('settings.telegramChatIdHint')}</div>
                          <input type="password" className="tq-input" value={notifToken} onChange={(e) => setNotifToken(e.target.value)} placeholder={notifHasToken ? t('settings.telegramTokenConfigured') : t('settings.telegramToken')} />
                          <div style={{ fontSize: 11, color: 'var(--warm-text-muted)', fontWeight: 700 }}>{t('settings.telegramTokenHint')}</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={saveNotifications}>{t('common.save')}</button>
                            <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={testTelegram}>{t('settings.sendTestNotification')}</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ntfy sub-toggle */}
                    <div style={{ padding: 10, border: '1px solid var(--warm-border)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 2a7 7 0 0 0-7 7v3l-1.5 2h17L17 12V9a7 7 0 0 0-7-7z" stroke="var(--warm-text-light)" strokeWidth="1.5" fill="none"/><path d="M8 16a2 2 0 0 0 4 0" stroke="var(--warm-text-light)" strokeWidth="1.5" fill="none"/></svg>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--warm-text)' }}>ntfy</div>
                        <Toggle checked={ntfyEnabled} onChange={setNtfyEnabled} />
                      </div>
                      {ntfyEnabled && (
                        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                          {!hosted && (
                            <div style={{ display: 'grid', gap: 4 }}>
                              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>{t('settings.ntfyServerUrl')}</label>
                              <input className="tq-input" value={ntfyServerUrl} onChange={(e) => setNtfyServerUrl(e.target.value)} placeholder="https://ntfy.sh" />
                            </div>
                          )}
                          <div style={{ display: 'grid', gap: 4 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>{t('settings.ntfyTopic')}</label>
                            <input className="tq-input" value={ntfyTopic} onChange={(e) => setNtfyTopic(e.target.value)} placeholder={t('settings.ntfyTopicPlaceholder')} />
                          </div>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>{t('settings.ntfyToken')}</label>
                            <input type="password" className="tq-input" value={ntfyToken} onChange={(e) => setNtfyToken(e.target.value)} placeholder={ntfyHasToken ? t('settings.ntfyTokenConfigured') : t('settings.ntfyTokenPlaceholder')} />
                            <div style={{ fontSize: 11, color: 'var(--warm-text-muted)', fontWeight: 700 }}>{t('settings.ntfyTokenHint')}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={saveNotifications}>{t('common.save')}</button>
                            <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={testNtfy}>{t('settings.sendTestNotification')}</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {notifMsg && <div style={{ fontSize: 11, color: notifMsg.includes('✓') || notifMsg.includes('saved') || notifMsg.includes('sent') || notifMsg.includes('enregistr') || notifMsg.includes('envoy') ? 'var(--health-green)' : 'var(--warm-text-muted)', fontWeight: 700 }}>{notifMsg}</div>}
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--warm-text-muted)', fontWeight: 700 }}>
                    {t('settings.notificationsDisabledHint')}
                  </div>
                )}
              </div>
            )}
            </>)}
            {isAdmin && (
            <div style={{ padding: '14px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="8" r="4" stroke="var(--warm-text-light)" strokeWidth="1.5" fill="none" />
                  <path d="M5 17L6.5 13H13.5L15 17" stroke="var(--warm-text-light)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.vacationMode')}</div>
                  <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('settings.vacationDesc')}</div>
                  {vacationEnabled && vacationConfig?.vacationStartDate && (
                    <div style={{ fontSize: 11, color: 'var(--warm-accent)', marginTop: 2 }}>
                      {t('settings.vacationSince')} {new Date(vacationConfig.vacationStartDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <Toggle
                  checked={vacationEnabled}
                  onChange={async (val) => {
                    setVacationEnabled(val);
                    if (!val) setVacationEndDate(null);
                    void onUpdateVacation?.({ vacationMode: val }).catch(() => {
                      setVacationEnabled(!val);
                    });
                  }}
                />
              </div>
              {vacationEnabled && (
                <div style={{ marginTop: 10, paddingLeft: 34, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)' }}>
                    {t('settings.vacationReturnDate')}
                  </label>
                  <input
                    type="date"
                    className="tq-input-compact"
                    value={vacationEndDate ? vacationEndDate.slice(0, 10) : ''}
                    min={dateStr()}
                    onChange={async (e) => {
                      const val = e.target.value || null;
                      setVacationEndDate(val);
                      void onUpdateVacation?.({ vacationEndDate: val }).catch(() => {
                        setVacationEndDate(vacationConfig?.vacationEndDate ?? null);
                      });
                    }}
                  />
                </div>
              )}
              {/* Per-user vacation toggles */}
              <div style={{ marginTop: 14, paddingLeft: 34, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-secondary)', marginBottom: 2 }}>{t('settings.perUserVacation')}</div>
                {family.filter((u) => u.role !== 'admin').map((u) => {
                  const isOn = !!(memberVacation[u.id] ?? u.isVacationMode);
                  return (
                    <div key={u.id} style={{ padding: '8px 10px', borderRadius: 12, backgroundColor: 'var(--warm-bg-subtle)', border: '1px solid var(--warm-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <UserAvatar userId={u.id} name={u.displayName} color={u.avatarColor} size={28} avatarType={u.avatarType as any} avatarPreset={u.avatarPreset} avatarPhotoUrl={u.avatarPhotoUrl} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>{u.displayName}</div>
                          {isOn && u.vacationStartDate && (
                            <div style={{ fontSize: 10, color: 'var(--warm-accent)' }}>{t('settings.vacationSince')} {new Date(u.vacationStartDate).toLocaleDateString()}</div>
                          )}
                        </div>
                        <Toggle checked={isOn} onChange={async (val) => {
                          setMemberVacation((prev) => ({ ...prev, [u.id]: val }));
                          try {
                            await api.updateUserVacation(u.id, { isVacationMode: val });
                          } catch {
                            setMemberVacation((prev) => ({ ...prev, [u.id]: !val }));
                          }
                        }} />
                      </div>
                      {isOn && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 38 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)', whiteSpace: 'nowrap' }}>
                            {t('settings.vacationReturnDate')}
                          </label>
                          <input
                            type="date"
                            className="tq-input-compact"
                            value={u.vacationEndDate ? u.vacationEndDate.slice(0, 10) : ''}
                            min={dateStr()}
                            onChange={async (e) => {
                              const val = e.target.value || null;
                              try {
                                await api.updateUserVacation(u.id, { vacationEndDate: val });
                              } catch { /* ignore */ }
                            }}
                            style={{ fontSize: 11 }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            )}
            {isAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px solid var(--warm-border)' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2a4 4 0 0 1 4 4v1h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1V6a4 4 0 0 1 4-4zm0 1.5A2.5 2.5 0 0 0 7.5 6v1h5V6A2.5 2.5 0 0 0 10 3.5z" fill="var(--warm-text-light)" />
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.registrationEnabled')}</div>
                  <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('settings.registrationEnabledDesc')}</div>
                </div>
                <Toggle
                  checked={registrationEnabled}
                  onChange={async (val) => {
                    setRegistrationEnabled(val);
                    await api.updateRegistrationConfig({ registrationEnabled: val }).catch(() => {
                      setRegistrationEnabled(!val);
                    });
                  }}
                />
              </div>
            )}
            {isAdmin && gamificationEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px solid var(--warm-border)' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 6h12M4 10h12M4 14h12" stroke="var(--warm-text-light)" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M14 4l2 2-2 2" stroke="var(--warm-text-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.strictMode')}</div>
                  <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('settings.strictModeDesc')}</div>
                </div>
                <Toggle
                  checked={strictModeEnabled}
                  onChange={async (val) => {
                    setStrictModeEnabled(val);
                    await api.updateStrictModeConfig({ strictMode: val }).catch(() => {
                      setStrictModeEnabled(!val);
                    });
                  }}
                />
              </div>
            )}
            {isAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px solid var(--warm-border)' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="4" width="14" height="13" rx="2" stroke="var(--warm-text-light)" strokeWidth="1.5" />
                  <path d="M3 8h14M7 2v4M13 2v4" stroke="var(--warm-text-light)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.weekStart')}</div>
                  <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('settings.weekStartDesc')}</div>
                </div>
                <select className="tq-input-compact" aria-label={t('settings.weekStart')} value={weekStartPick ?? weekStart} disabled={weekStartPick !== null}
                  onChange={(e) => {
                    const v = Number(e.target.value) === 0 ? 0 : 1;
                    setWeekStartPick(v);
                    (onWeekStartChange?.(v) ?? Promise.resolve()).catch(() => {}).finally(() => setWeekStartPick(null));
                  }}>
                  {[0, 1].map((d) => <option key={d} value={d}>{weekdayName(d, user.language, 'long')}</option>)}
                </select>
              </div>
            )}
            {isAdmin && timeZone && onTimeZoneChange && (
              <TimeZonePicker zone={timeZone.zone} zoneSet={timeZone.set} language={user.language} onChange={onTimeZoneChange} />
            )}
            {isAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px solid var(--warm-border)' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="8" width="14" height="9" rx="2" stroke="var(--warm-text-light)" strokeWidth="1.5" />
                  <path d="M6.5 8V6a3.5 3.5 0 017 0v2" stroke="var(--warm-text-light)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.hidePrivateRooms')}</div>
                  <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('settings.hidePrivateRoomsDesc')}</div>
                </div>
                <Toggle
                  checked={hidePrivateRooms}
                  onChange={async (val) => {
                    setHidePrivateRooms(val);
                    await api.updateKidsConfig({ hidePrivateRooms: val }).catch(() => setHidePrivateRooms(!val));
                  }}
                />
              </div>
            )}
            {isAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px solid var(--warm-border)' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 1l2.5 5.5L18 7.5l-4 4 1 5.5L10 14.5 4.5 17l1-5.5-4-4 5.5-1z" fill="var(--warm-text-light)" />
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.gamificationEnabled')}</div>
                  <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('settings.gamificationEnabledDesc')}</div>
                </div>
                <Toggle
                  checked={gamificationEnabled}
                  onChange={async (val) => {
                    onGamificationChange?.(val);
                    await api.updateGamificationConfig({ gamificationEnabled: val }).catch(() => {
                      onGamificationChange?.(!val);
                    });
                  }}
                />
              </div>
            )}
            {!isAdmin && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--warm-text-muted)', fontWeight: 700 }}>
                {t('settings.adminRequired')}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: '1px solid var(--warm-border)' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="var(--warm-text-light)" strokeWidth="1.5" />
                <path d="M10 6v4.5l3 1.5" stroke="var(--warm-text-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.version')}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--warm-text-muted)', textAlign: 'right' }}>
                v{__APP_VERSION__}{__APP_BUILD__ && <span style={{ display: 'block', fontSize: 11, color: 'var(--warm-text-light)' }}>{__APP_BUILD__}</span>}
              </span>
            </div>
          </div>
          {hostedAccount?.isParent && <SignInEmailCard account={hostedAccount} language={user.language} onChanged={onHostedChanged} />}
          {hostedAccount && isAdmin && <FamilyCodeCard account={hostedAccount} language={user.language} onChanged={onHostedChanged} />}
          {isAdmin && strictModeEnabled && <div className="settings-group-title">✅ {t('settingsGroups.approvals')}</div>}
          {isAdmin && strictModeEnabled && (
            <div className="tq-card settings-admin-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-text)', margin: '0 0 12px' }}>{t('settings.pendingValidations')}</h3>
              <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, marginBottom: 10 }}>{t('settings.pendingValidationsDesc')}</div>
              <PendingApprovals items={pendingCompletions} language={user.language} gamificationEnabled={gamificationEnabled} onChanged={loadPendingCompletions} />
              {pendingCompletions.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('settings.noPendingValidations')}</div>
              )}
            </div>
          )}
          {isAdmin && gamificationEnabled && <div className="settings-group-title">🪙 {t('settingsGroups.coinsGoals')}</div>}
          {isAdmin && gamificationEnabled && (
            <div className="tq-card tq-card-padded settings-admin-card">
              <h3 className="tq-card-title">{t('settings.coinsPerEffort')}</h3>
              <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, marginBottom: 10 }}>{t('settings.coinsPerEffortDesc')}</div>
              <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                {[1, 2, 3, 4, 5].map((e) => (
                    <div key={e} className="coins-effort-row" style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 116px', alignItems: 'center', gap: 10, backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', borderRadius: 12, padding: '8px 10px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>{t('roomDetail.effort')} {e}</div>
                      <div className="coins-effort-dots"><EffortDots effort={e} /></div>
                      <div className="coins-effort-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CoinIcon />
                        <input
                          type="number"
                          className="tq-input"
                        min={0}
                        value={coinsDraft[e] ?? coinsByEffort[e] ?? e * 5}
                        onChange={(ev) => setCoinsDraft((prev) => ({ ...prev, [e]: Math.max(0, parseInt(ev.target.value || '0', 10)) }))}
                        title={`${t('roomDetail.effort')} ${e}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={saveCoins}>{t('common.save')}</button>
                <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={resetCoins}>{t('settings.useDefaultCoins')}</button>
              </div>
            </div>
          )}
          {isAdmin && gamificationEnabled && (
            <div className="tq-card tq-card-padded settings-admin-card">
              <h3 className="tq-card-title">{t('settings.goalsSection')}</h3>
              <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, marginBottom: 10 }}>{t('settings.goalsSectionDesc')}</div>
              <div style={{ backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text)', marginBottom: 6 }}>🤝 {t('board.familyGoalAdmin')}</div>
                <FamilyGoalAdmin language={user.language} />
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {family
                  .filter((u) => u.id !== user.id && u.role !== 'admin')
                  .map((u) => (
                    <div key={u.id} style={{ backgroundColor: 'var(--warm-bg-subtle)', border: '1.5px solid var(--warm-border)', borderRadius: 12, padding: '10px 12px' }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text)', marginBottom: 8 }}>{u.displayName}</div>
                      <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                        {(memberGoals[u.id] || []).map((g) => (
                          <GoalRow key={g.id} goal={g} language={user.language} formatDate={formatDate} onChanged={loadAdminGoals} onDelete={() => handleDeleteGoal(g.id, u.id)} />
                        ))}
                      </div>
                      {memberGoalMsg[u.id] && (
                        <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 700 }}>{memberGoalMsg[u.id]}</div>
                      )}
                      <div className="goal-member-form" style={{ display: 'grid', gridTemplateColumns: '1.4fr 100px 90px 130px auto', gap: 8 }}>
                        <input
                          className="tq-input"
                          value={goalDraft[u.id]?.title || ''}
                          onChange={(e) => setGoalDraft((prev) => ({ ...prev, [u.id]: { ...(prev[u.id] || { title: '', goalCoins: '', rewardCoins: '', endAt: '' }), title: e.target.value } }))}
                          placeholder={t('settings.goalTitle')}
                        />
                        <input
                          type="number"
                          className="tq-input"
                          min={1}
                          value={goalDraft[u.id]?.goalCoins || ''}
                          onChange={(e) => setGoalDraft((prev) => ({ ...prev, [u.id]: { ...(prev[u.id] || { title: '', goalCoins: '', rewardCoins: '', endAt: '' }), goalCoins: e.target.value } }))}
                          placeholder={t('settings.goalCoins')}
                        />
                        <input
                          type="number"
                          className="tq-input"
                          min={0}
                          value={goalDraft[u.id]?.rewardCoins || ''}
                          onChange={(e) => setGoalDraft((prev) => ({ ...prev, [u.id]: { ...(prev[u.id] || { title: '', goalCoins: '', rewardCoins: '', endAt: '' }), rewardCoins: e.target.value } }))}
                          placeholder={t('settings.goalReward')}
                          title={t('settings.goalRewardDesc')}
                        />
                        <input
                          type="date"
                          className="tq-input goal-member-end-date"
                          value={goalDraft[u.id]?.endAt || ''}
                          onChange={(e) => setGoalDraft((prev) => ({ ...prev, [u.id]: { ...(prev[u.id] || { title: '', goalCoins: '', rewardCoins: '', endAt: '' }), endAt: e.target.value } }))}
                          title={t('settings.goalEnd')}
                          lang={locale}
                          style={{ minWidth: 0 }}
                        />
                        <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => handleAddGoal(u)}>{t('settings.addGoal')}</button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!goalRepeat[u.id]} onChange={(e) => setGoalRepeat((prev) => ({ ...prev, [u.id]: e.target.checked }))} style={{ accentColor: 'var(--warm-accent)' }} />
                          {t('goals.repeatWeekly')}
                        </label>
                        {/* Template: a weekly win this week, reusing their last target and bonus */}
                        <button className="tq-btn tq-btn-sm" onClick={() => {
                          const last = (memberGoals[u.id] || [])[0];
                          setGoalDraft((prev) => ({ ...prev, [u.id]: { title: t('goals.weeklyWinTitle'), goalCoins: String(last?.goalCoins ?? 100), rewardCoins: String(last?.rewardCoins ?? 20), endAt: '' } }));
                          setGoalRepeat((prev) => ({ ...prev, [u.id]: true }));
                        }}>⭐ {t('goals.weeklyWinTemplate')}</button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
        <div className="settings-col">
          {isAdmin && notifMasterEnabled && <div className="settings-group-title">🔔 {t('settingsGroups.notifications')}</div>}
          {isAdmin && notifMasterEnabled && (
            <div className="tq-card tq-card-padded settings-admin-card">
              <h3 className="tq-card-title">👪 {t('notifyAdmin.peopleTitle')}</h3>
              <PeopleNotifyAdmin language={user.language} />
            </div>
          )}
          {isAdmin && notifMasterEnabled && (
            <div className="tq-card tq-card-padded settings-admin-card">
              <h3 className="tq-card-title">⏰ {t('notifyAdmin.timingTitle')}</h3>
              <NotifyScheduleAdmin language={user.language} />
            </div>
          )}
          {isAdmin && notifMasterEnabled && (
            <div className="tq-card tq-card-padded settings-admin-card">
              <h3 className="tq-card-title">📜 {t('notifyAdmin.logTitle')}</h3>
              <NotificationLog language={user.language} />
            </div>
          )}
          {isAdmin && <div className="settings-group-title">✨ {t('settingsGroups.gameExtras')}</div>}
          {isAdmin && gamificationEnabled && (
            <div className="tq-card tq-card-padded settings-admin-card">
              <h3 className="tq-card-title">{t('boosts.title')}</h3>
              <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, marginBottom: 10 }}>{t('boosts.desc')}</div>
              <CoinBoostsAdmin rooms={rooms} language={user.language} />
            </div>
          )}
          {isAdmin && (
            <div className="tq-card tq-card-padded settings-admin-card">
              <h3 className="tq-card-title">🧩 {t('features.title')}</h3>
              <FeaturesAdmin language={user.language} onChanged={onDataChanged} />
            </div>
          )}
          {isAdmin && gamificationEnabled && (
            <div className="tq-card tq-card-padded settings-admin-card">
              <h3 className="tq-card-title">🏅 {t('badges.adminTitle')}</h3>
              <CustomBadgesAdmin rooms={rooms} language={user.language}
                family={family.filter((m) => m.role !== 'admin' || m.isParticipant).map((m) => ({ id: m.id, displayName: m.displayName }))} />
            </div>
          )}
          {isAdmin && <div className="settings-group-title">💾 {t('settingsGroups.data')}</div>}
          {isAdmin && (
          <div className="tq-card tq-card-padded">
            <h3 className="tq-card-title">{t('settings.dataPrivacy')}</h3>
            {[
              { icon: <DownloadIcon />, title: t('settings.exportData'), desc: t('settings.exportDesc'), btn: t('settings.download'), action: onExport },
              { icon: <UploadIcon />, title: t('settings.importData'), desc: t('settings.importDesc'), btn: t('settings.upload'), action: onImport },
              { icon: <LockIcon />, title: t('settings.privacy'), desc: t('settings.privacyDesc'), btn: null, action: null },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < 2 ? '1px solid var(--warm-border)' : 'none' }}>
                {s.icon}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{s.desc}</div>
                </div>
                {s.btn && (
                  <button className="tq-btn tq-btn-sm" onClick={isAdmin ? s.action! : () => {}} disabled={!isAdmin} style={{ backgroundColor: 'var(--warm-accent-light)', color: 'var(--warm-accent)', border: '1.5px solid var(--warm-accent)' }}>
                    {s.btn}
                  </button>
                )}
              </div>
            ))}
          </div>
          )}
          {isAdmin && (
            <div className="tq-card tq-card-padded settings-admin-card">
              <h3 className="tq-card-title">{t('csv.title')}</h3>
              <CsvTransfer language={user.language} onImported={() => { onDataChanged?.(); void loadRewardsAdmin(); }} />
            </div>
          )}
          {isAdmin && (
            <div className="tq-card tq-card-padded settings-admin-card">
              <h3 className="tq-card-title">{t('trash.title')}</h3>
              <TrashAdmin rooms={rooms} language={user.language} reloadKey={trashVersion}
                onRestored={() => { onDataChanged?.(); void loadRewardsAdmin(); }} />
            </div>
          )}
        </div>
      </div>
      {isAdmin && gamificationEnabled && <div className="settings-group-title">🎁 {t('settingsGroups.rewards')}</div>}
      {isAdmin && gamificationEnabled && (
        <div className="tq-card tq-card-padded settings-admin-card">
          <h3 className="tq-card-title">{t('settings.rewardsSection')}</h3>
          <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, marginBottom: 10 }}>{t('settings.rewardsSectionDesc')}</div>
          <div className="rewards-add-form" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 100px auto auto', gap: 8, marginBottom: 10 }}>
            <input className="tq-input" value={rewardDraft.title} onChange={(e) => setRewardDraft((p) => ({ ...p, title: e.target.value }))} placeholder={t('settings.rewardTitle')} />
            <input className="tq-input" value={rewardDraft.description} onChange={(e) => setRewardDraft((p) => ({ ...p, description: e.target.value }))} placeholder={t('settings.rewardDesc')} />
            <input className="tq-input" type="number" min={1} value={rewardDraft.costCoins} onChange={(e) => setRewardDraft((p) => ({ ...p, costCoins: e.target.value }))} placeholder={t('settings.rewardCost')} />
            <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={handleSeedRewards}>{t('settings.addPresetRewards')}</button>
            <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={handleCreateReward}>{t('settings.create')}</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10, fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
            {t('rewardRules.rotatingPerWeek')}
            <input type="number" min={0} max={50} className="tq-input-compact" value={rotatingPerWeek} onChange={(e) => setRotatingPerWeek(e.target.value)} style={{ width: 60 }} />
            <button className="tq-btn tq-btn-sm" onClick={async () => { await api.updateRotationConfig(Math.max(0, Math.round(Number(rotatingPerWeek) || 0))); await loadRewardsAdmin(); }}>{t('common.save')}</button>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {(showAllRewards ? orderedRewards : orderedRewards.slice(0, REWARDS_SHOWN)).map((r, index) => (
              <div key={r.id} className="rewards-list-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 100px auto', gap: 8, alignItems: 'center', border: '1px solid var(--warm-border)', borderRadius: 10, padding: '8px 10px', backgroundColor: r.isActive ? 'var(--warm-bg-subtle)' : 'var(--warm-bg-warm)' }}>
                {editingRewardId === r.id ? (
                  <>
                    <input
                      className="tq-input"
                      value={editingRewardTitle}
                      onChange={(e) => setEditingRewardTitle(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') await saveRewardEdit(r);
                        if (e.key === 'Escape') cancelRewardEdit();
                      }}
                      style={{ fontSize: 12, fontWeight: 800 }}
                    />
                    <input
                      className="tq-input"
                      value={editingRewardDesc}
                      onChange={(e) => setEditingRewardDesc(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') await saveRewardEdit(r);
                        if (e.key === 'Escape') cancelRewardEdit();
                      }}
                      style={{ fontSize: 11 }}
                    />
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text)', opacity: r.isActive === false ? 0.55 : 1 }}>
                      {r.isActive === false && <span style={{ marginRight: 6, fontSize: 10, padding: '1px 6px', borderRadius: 6, border: '1px solid var(--warm-border)', color: 'var(--warm-text-secondary)' }}>{t('pause.hidden')}</span>}
                      {rewardTitle(r)}
                      {r.category && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-muted)' }}>🏷 {r.category}</div>}
                      {rulesSummary(r, family, t) && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-accent)' }}>{rulesSummary(r, family, t)}</div>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{rewardDesc(r)}</div>
                  </>
                )}
                {editingRewardId === r.id ? (
                  <input
                    type="number"
                    min={1}
                    value={editingRewardCost}
                    onChange={(e) => setEditingRewardCost(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') await saveRewardEdit(r);
                      if (e.key === 'Escape') cancelRewardEdit();
                    }}
                    style={{ padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--warm-border)', fontFamily: 'Nunito', fontSize: 12 }}
                  />
                ) : (
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)', display: 'flex', alignItems: 'center', gap: 4 }}><CoinIcon /> {formatCoins(r.costCoins)}</div>
                )}
                {editingRewardId === r.id ? (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="tq-btn tq-btn-primary" onClick={async () => { await saveRewardEdit(r); }} style={{ padding: '4px 8px', fontSize: 10 }}>{t('common.save')}</button>
                    <button className="tq-btn" onClick={cancelRewardEdit} style={{ padding: '4px 8px', fontSize: 10 }}>{t('common.cancel')}</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="tq-btn" onClick={() => moveReward(r.id, -1)} disabled={index === 0} aria-label={t('rewardOrder.up')} title={t('rewardOrder.up')} style={{ padding: '4px 7px', fontSize: 10 }}>↑</button>
                    <button className="tq-btn" onClick={() => moveReward(r.id, 1)} disabled={index === orderedRewards.length - 1} aria-label={t('rewardOrder.down')} title={t('rewardOrder.down')} style={{ padding: '4px 7px', fontSize: 10 }}>↓</button>
                    <button className="tq-btn" onClick={() => setRulesOpenId(rulesOpenId === r.id ? null : r.id)} style={{ padding: '4px 8px', fontSize: 10 }}>{t('rewardRules.rules')}</button>
                    <button className="tq-btn" onClick={() => toggleRewardHidden(r)} aria-pressed={r.isActive === false} style={{ padding: '4px 8px', fontSize: 10 }}>{r.isActive === false ? t('pause.show') : t('pause.hide')}</button>
                    <button className="tq-btn" onClick={() => startRewardEdit(r)} style={{ padding: '4px 8px', fontSize: 10 }}>{t('common.edit')}</button>
                    <button className="tq-btn" onClick={() => deleteReward(r)} style={{ padding: '4px 8px', fontSize: 10, backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>{t('common.delete')}</button>
                  </div>
                )}
                {editingRewardId === r.id && (
                  <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>
                    {t('rewardOrder.category')}
                    <input className="tq-input-compact" list="reward-categories" value={editingRewardCategory} maxLength={40}
                      onChange={(e) => setEditingRewardCategory(e.target.value)} placeholder={t('rewardOrder.categoryPlaceholder')} style={{ flex: 1, minWidth: 0 }} />
                  </label>
                )}
                {rulesOpenId === r.id && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <RewardRulesEditor reward={r} family={family} language={user.language} onSaved={loadRewardsAdmin} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {orderedRewards.length > REWARDS_SHOWN && (
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" style={{ marginTop: 8 }} onClick={() => setShowAllRewards((v) => !v)}>
              {showAllRewards ? t('settings.showFewerRewards') : t('settings.showAllRewards').replace('{n}', String(orderedRewards.length))}
            </button>
          )}
          <datalist id="reward-categories">{rewardCategories.map((c) => <option key={c} value={c} />)}</datalist>
          <div style={{ marginTop: 14 }}>
            <h4 className="tq-card-title" style={{ fontSize: 13 }}>{t('settings.rewardRequests')}</h4>
            <div style={{ display: 'grid', gap: 6 }}>
              {rewardRequests.map((rr) => (
                <div key={rr.id} className="rewards-requests-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 90px 110px 130px', gap: 8, alignItems: 'center', border: '1px solid var(--warm-border)', borderRadius: 10, padding: '8px 10px', backgroundColor: 'var(--warm-bg-subtle)' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text)' }}>{rr.displayName}</div>
                  <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 700 }}>{rewardTitle(rr)}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-accent)', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}><CoinIcon /> {rr.costCoins}</div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: rr.status === 'approved' ? '#15803D' : rr.status === 'rejected' ? '#B91C1C' : rr.status === 'cancelled' ? '#374151' : 'var(--warm-text-light)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    {rewardStatusLabel(rr.status)}
                    {rr.status === 'approved' && (
                      <button
                        type="button"
                        className="tq-btn tq-btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 10 }}
                        onClick={() => void refundRedemption(rr)}
                      >
                        {t('settings.refundReward')}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 700 }}>{formatDate(rr.redeemedAt)}</div>
                </div>
              ))}
              {rewardRequests.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('settings.noRewardRequests')}</div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="settings-group-title">👨‍👩‍👧‍👦 {t('settingsGroups.family')}</div>
      <div className="tq-card tq-card-padded settings-admin-card family-members-card" style={{ gridColumn: '1 / -1' }}>
        <div className="family-members-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 className="tq-card-title" style={{ margin: 0 }}>{t('settings.familyMembers')}</h3>
          <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={() => isAdmin && setShowAddMember(true)} disabled={!isAdmin} style={{ opacity: isAdmin ? 1 : 0.5 }}>
            + {t('settings.addMember')}
          </button>
        </div>
        {showAddMember && (
          <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: 'var(--warm-bg-warm)', border: '1.5px solid var(--warm-border)' }}>
            <div className="family-members-add-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto auto', gap: 8 }}>
              <input className="tq-input" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder={t('settings.memberDisplayName')} />
              <input className="tq-input" value={newMemberUsername} onChange={(e) => setNewMemberUsername(e.target.value)} placeholder={t('settings.memberUsername')} />
              <input className="tq-input" value={newMemberPassword} onChange={(e) => setNewMemberPassword(e.target.value)} type="password" placeholder={t('settings.memberPassword')} />
              <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={resetMemberForm}>{t('common.cancel')}</button>
              <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={handleAddMember}>{t('settings.create')}</button>
            </div>
            {addMemberError && <div role="alert" style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{addMemberError}</div>}
          </div>
        )}
        <div className="family-members-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {family.map((u) => (
            <div key={u.id} className="family-member-card" style={{ backgroundColor: 'var(--warm-bg-warm)', borderRadius: 16, border: '1.5px solid var(--warm-border)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <UserAvatar userId={u.id} name={u.displayName} color={u.avatarColor} size={44} avatarType={u.avatarType as any} avatarPreset={u.avatarPreset} avatarPhotoUrl={u.avatarPhotoUrl} />
                <div style={{ flex: 1 }}>
                  <div className="family-member-title-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{u.displayName}</div>
                    <span style={{
                      fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
                    color: u.role === 'admin' ? '#C2410C' : u.role === 'member' ? '#0369A1' : '#8A7A6A',
                    backgroundColor: u.role === 'admin' ? '#FFF1E5' : u.role === 'member' ? '#EAF6FF' : '#F4EEE7',
                    border: `1px solid ${u.role === 'admin' ? '#FDBA74' : u.role === 'member' ? '#BAE6FD' : '#E2D5C5'}`,
                    borderRadius: 999, padding: '2px 7px',
                  }}>
                      {u.role === 'admin' ? t('settings.roleAdmin') : u.role === 'member' ? t('settings.roleMember') : t('settings.roleChild')}
                  </span>
                  </div>
                  <div className="family-member-stats" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{u.coins} {t('settings.coins')}</span>
                    <span style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600 }}>{u.currentStreak}d {t('settings.streak')}</span>
                    {shields && <ShieldIcons count={u.streakShields} language={user.language} style={{ fontSize: 11 }} />}
                  </div>
                </div>
              </div>
              {isAdmin && (u.id !== user.id || gamificationEnabled) && (
                <div className="family-member-actions" style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {u.id !== user.id && (
                    <select
                      className="tq-input"
                      value={u.role || 'member'}
                      onChange={(e) => onUpdateRole(u.id, e.target.value as 'admin' | 'member' | 'child')}
                      style={{ width: 'auto', cursor: 'pointer', fontSize: 11 }}
                    >
                      <option value="admin">{t('settings.roleAdmin')}</option>
                      <option value="member">{t('settings.roleMember')}</option>
                      <option value="child">{t('settings.roleChild')}</option>
                    </select>
                  )}
                  <button
                    onClick={() => {
                      initMemberProfile(u);
                      setMemberEditOpen((prev) => ({ ...prev, [u.id]: !prev[u.id] }));
                    }}
                    className="tq-btn tq-btn-secondary tq-btn-sm"
                  >
                    {t('settings.manageMember')}
                  </button>
                  {shields && onGiveShield && (u.streakShields ?? 0) < shields.max && (
                    <button
                      onClick={() => {
                        if (confirm(t('shields.giveConfirm').replace('{name}', u.displayName))) void onGiveShield(u.id).catch(() => alert(t('shields.giveFailed')));
                      }}
                      className="tq-btn tq-btn-secondary tq-btn-sm"
                    >
                      🛡️ {t('shields.give')}
                    </button>
                  )}
                  {u.id !== user.id && (
                    <button
                      onClick={() => {
                        if (confirm(t('settings.deleteUserConfirm').replace('{user}', u.displayName))) {
                          onDeleteUser(u.id);
                        }
                      }}
                      className="tq-btn tq-btn-sm"
                      style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}
                    >
                      {t('settings.deleteUser')}
                    </button>
                  )}
                </div>
              )}
              {isAdmin && u.id !== user.id && u.role === 'admin' && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--warm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.participantMode')}</div>
                    <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 500, marginTop: 2 }}>{t('settings.participantDesc')}</div>
                  </div>
                  <Toggle
                    checked={!!(memberParticipant[u.id] ?? u.isParticipant)}
                    onChange={async (val) => {
                      setMemberParticipant((prev) => ({ ...prev, [u.id]: val }));
                      await api.updateUserParticipant(u.id, val);
                    }}
                  />
                </div>
              )}
              {isAdmin && u.id !== user.id && (() => {
                const view = memberView[u.id] ?? { taskView: u.taskView ?? 'all', kidMode: !!u.kidMode, focusMode: u.focusMode ?? null };
                const saveView = async (next: { taskView: 'all' | 'mine' | 'mineOnly'; kidMode: boolean; focusMode: FocusModeSetting }) => {
                  setMemberView((prev) => ({ ...prev, [u.id]: next }));
                  await api.updateUserView(u.id, next).catch(() => setMemberView((prev) => ({ ...prev, [u.id]: view })));
                };
                return (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--warm-border)', display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 160px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.taskView')}</div>
                        <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 500, marginTop: 2 }}>{t('settings.taskViewDesc')}</div>
                      </div>
                      <select className="tq-input" value={view.taskView} style={{ width: 'auto', cursor: 'pointer', fontSize: 12 }}
                        onChange={(e) => saveView({ ...view, taskView: e.target.value as 'all' | 'mine' | 'mineOnly' })}>
                        <option value="all">{t('settings.taskViewAll')}</option>
                        <option value="mine">{t('settings.taskViewMine')}</option>
                        <option value="mineOnly">{t('settings.taskViewMineOnly')}</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>{t('settings.kidMode')}</div>
                        <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 500, marginTop: 2 }}>{t('settings.kidModeDesc')}</div>
                      </div>
                      <Toggle checked={view.kidMode} onChange={(val) => saveView({ ...view, kidMode: val })} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 160px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' }}>🎯 {t('focus.title')}</div>
                        <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 500, marginTop: 2 }}>{t('focus.settingDesc')}</div>
                      </div>
                      <select className="tq-input" value={view.focusMode ?? ''} style={{ width: 'auto', cursor: 'pointer', fontSize: 12 }}
                        aria-label={t('focus.title')}
                        onChange={(e) => saveView({ ...view, focusMode: (e.target.value || null) as FocusModeSetting })}>
                        <option value="">{u.role === 'child' ? t('focus.defaultButton') : t('focus.defaultOff')}</option>
                        <option value="off">{t('focus.modeOff')}</option>
                        <option value="button">{t('focus.modeButton')}</option>
                        <option value="home">{t('focus.modeHome')}</option>
                      </select>
                    </div>
                  </div>
                );
              })()}
              {isAdmin && memberEditOpen[u.id] && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--warm-border)', display: 'grid', gap: 8 }}>
                  {u.id !== user.id && (<>
                    <select className="tq-input" value={memberProfile[u.id]?.language || 'en'} onChange={(e) => setMemberProfile((prev) => ({ ...prev, [u.id]: { ...prev[u.id], language: e.target.value } }))} style={{ cursor: 'pointer' }}>
                      <option value="en">English</option>
                      <option value="fr">Français</option>
                      <option value="de">Deutsch</option>
                      <option value="es">Español</option>
                      <option value="it">Italiano</option>
                      <option value="nl">Nederlands</option>
                    </select>
                    <select className="tq-input" value={memberProfile[u.id]?.avatarType || 'letter'} onChange={(e) => setMemberProfile((prev) => ({ ...prev, [u.id]: { ...prev[u.id], avatarType: e.target.value as 'letter' | 'preset' } }))} style={{ cursor: 'pointer' }}>
                      <option value="letter">{t('profile.letterMode')}</option>
                      <option value="preset">{t('profile.characterMode')}</option>
                    </select>
                    {(memberProfile[u.id]?.avatarType || 'letter') === 'letter' ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {COLORS.map((c) => (
                          <button key={c} onClick={() => setMemberProfile((prev) => ({ ...prev, [u.id]: { ...prev[u.id], avatarColor: c } }))} style={{ width: 20, height: 20, borderRadius: 8, border: (memberProfile[u.id]?.avatarColor || '#F97316') === c ? '2px solid #3D2F1E' : '1px solid transparent', backgroundColor: c }} />
                        ))}
                      </div>
                    ) : (
                      <select className="tq-input" value={memberProfile[u.id]?.avatarPreset || 'cat'} onChange={(e) => setMemberProfile((prev) => ({ ...prev, [u.id]: { ...prev[u.id], avatarPreset: e.target.value } }))} style={{ cursor: 'pointer' }}>
                        {Object.keys(AVATAR_PRESETS).map((id) => (
                          <option key={id} value={id}>{t(`avatars.${id}`)}</option>
                        ))}
                      </select>
                    )}
                    <ThemePicker value={isTheme(memberProfile[u.id]?.theme) ? memberProfile[u.id].theme as Theme : null} language={user.language} level={cosmetics[u.id]?.level}
                      onChange={(theme) => setMemberProfile((prev) => ({ ...prev, [u.id]: { ...prev[u.id], theme } }))} />
                    <BirthdayInput value={memberProfile[u.id]?.birthday ?? ''} language={user.language}
                      onChange={(birthday) => setMemberProfile((prev) => ({ ...prev, [u.id]: { ...prev[u.id], birthday } }))} />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={() => handleSaveChildProfile(u)}>{t('common.save')}</button>
                      {memberProfileMsg[u.id] && (
                        <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 700 }}>{memberProfileMsg[u.id]}</div>
                      )}
                    </div>
                    <div className="member-edit-password-row" style={{ display: 'flex', gap: 8 }}>
                      <input type="password" className="tq-input" value={memberPassword[u.id] || ''} onChange={(e) => setMemberPassword((prev) => ({ ...prev, [u.id]: e.target.value }))} placeholder={t('settings.newPassword')} style={{ flex: 1 }} />
                      <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => handleSetChildPassword(u)}>{t('settings.resetPassword')}</button>
                    </div>
                    {memberPasswordMsg[u.id] && (
                      <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 700 }}>{memberPasswordMsg[u.id]}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => handleLogoutAllDevices(u)}>🚪 {t('settings.logoutAllDevices')}</button>
                      {logoutAllMsg[u.id] && (
                        <span style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 700 }}>{logoutAllMsg[u.id]}</span>
                      )}
                    </div>
                  </>)}
                  {gamificationEnabled && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('settings.coinsBalance')}: {formatCoins(u.coins)}</span>
                    <input
                      type="number"
                      className="tq-input-compact"
                      value={coinAdjust[u.id] || ''}
                      onChange={(e) => setCoinAdjust((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      placeholder={t('settings.adjustCoins')}
                      style={{ width: 80 }}
                    />
                    <input
                      className="tq-input-compact"
                      value={coinReason[u.id] || ''}
                      maxLength={200}
                      onChange={(e) => setCoinReason((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      placeholder={t('coins.reasonPlaceholder')}
                      style={{ flex: '1 1 140px', minWidth: 0 }}
                    />
                    <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={async () => {
                      const amt = parseInt(coinAdjust[u.id] || '0');
                      if (!amt) return;
                      const reason = (coinReason[u.id] || '').trim() || undefined;
                      if (onAdjustCoins) {
                        await onAdjustCoins(u.id, amt, reason);
                      } else {
                        await api.adjustCoins(u.id, amt, reason);
                      }
                      setCoinAdjust((prev) => ({ ...prev, [u.id]: '' }));
                      setCoinReason((prev) => ({ ...prev, [u.id]: '' }));
                      setCoinAdjustMsg((prev) => ({ ...prev, [u.id]: `${amt > 0 ? '+' : ''}${amt} ✓` }));
                      setTimeout(() => setCoinAdjustMsg((prev) => ({ ...prev, [u.id]: '' })), 2000);
                    }}>{t('settings.adjustCoins')}</button>
                    {coinAdjustMsg[u.id] && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-accent)' }}>{coinAdjustMsg[u.id]}</span>}
                  </div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <UndoToast undo={undo} language={user.language} onClose={closeUndo}
        onRestored={async () => { await loadRewardsAdmin(); setTrashVersion((v) => v + 1); }} />
    </div>
  );
}
