import type { Outfit } from '../components/mascot/MascotCard';
const API_BASE = '/api';

export interface RewardPot {
  saved: number;
  target: number;
  remaining: number;
  contributors: Array<{ userId: number; displayName: string; amount: number }>;
  awaitingApproval: boolean;
}

export interface RewardAvailability {
  limit: number;
  period: 'ever' | 'day' | 'week' | 'month';
  scope: 'person' | 'everyone';
  used: number;
  remaining: number;
  resetsAt: string | null;
}

export interface RewardRules {
  visibleTo: number[];
  prices: Record<number, number>;
  limitCount: number | null;
  limitPeriod: 'ever' | 'day' | 'week' | 'month';
  limitScope: 'person' | 'everyone';
  availableFrom: string | null;
  availableUntil: string | null;
  isRotating: boolean;
  isShared: boolean;
  pot: RewardPot | null;
}

export interface RewardRulesInput {
  visibleTo?: number[];
  prices?: Record<number, number | null>;
  limit?: { count: number; period: string; scope: string } | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  isRotating?: boolean;
  isShared?: boolean;
}

export interface CoinBoost {
  id: number;
  title: string;
  multiplier: number;
  startAt: string;
  endAt: string;
  /** Nothing picked (both null) = every chore; otherwise chores in these rooms plus these chores */
  roomIds: number[] | null;
  taskIds: number[] | null;
  /** The picked chores' names (Home's banner) */
  taskNames?: string[];
}

/** Insights (parents): rows are [bucket, userId, taskId, chores, coins, effort] */
export type InsightsPeriod = 'day' | 'week' | 'month' | 'year';
export interface InsightsPerson { id: number; name: string; color: string }
export interface InsightsBars {
  period: InsightsPeriod; offset: number; start: string; end: string; buckets: string[]; earliest: string | null;
  people: InsightsPerson[];
  rooms: Array<{ id: number; name: string; roomType: string }>;
  tasks: Array<{ id: number; name: string; roomId: number; translationKey: string | null }>;
  rows: Array<[number, number, number, number, number, number]>;
  /** Last period per person: [userId, chores, coins, effort] */
  previous: Array<[number, number, number, number]>;
  /** The period is still running, so `previous` stops at the same point (this time last week) */
  previousSoFar: boolean;
}
/** rows are [weekday (0 = Mon), slot, userId, chores, coins, effort] */
export interface InsightsHeatmap { weeks: 4 | 12; start: string; end: string; people: InsightsPerson[]; rows: Array<[number, number, number, number, number, number]> }

export interface TrashItem {
  id: number;
  kind: 'task' | 'reward';
  itemId: number;
  title: string;
  roomId: number | null;
  roomName: string | null;
  roomExists?: boolean;
  deletedAt: string;
  deletedByName: string | null;
  historyCount: number;
}

export type CsvKind = 'tasks' | 'rewards';

export interface CsvImportRow {
  line: number;
  action: 'add' | 'update' | 'unchanged' | 'error';
  room?: string;
  task?: string;
  title?: string;
  newRoom?: boolean;
  changes: Array<{ field: string; from: string; to: string }>;
  error?: { code: string; message: string; field?: string; value?: string };
}

export interface CsvImportResult {
  dryRun: boolean;
  applied: boolean;
  rows: CsvImportRow[];
  summary: { add: number; update: number; unchanged: number; error: number };
  roomsToCreate?: string[];
  unknownColumns: string[];
}

/** Fields the Tasks page can change for many tasks at once */
export interface TaskBatchChanges {
  assignedUserIds?: number[];
  assignmentMode?: 'first' | 'shared' | 'custom' | 'rotating';
  customCoins?: number | null;
  showInDashboard?: boolean;
  onDemand?: boolean;
  roomId?: number;
  allowEarlyCompletion?: boolean;
  effort?: number;
  frequencyDays?: number;
}

/** Optional extras (Settings → Features) */
/** One thing at a time per person: null = the default (a button for kids, off for others) */
export type FocusModeSetting = 'off' | 'button' | 'home' | null;

export interface FeatureFlags {
  rescue: boolean;
  usual: boolean;
  forgot: boolean;
  todos: boolean;
  boardAwards: boolean;
  levels: boolean;
  nextBadge: boolean;
  seasonal: boolean;
  cheers: boolean;
  mascot: boolean;
  teamups: boolean;
  mascotShop: boolean;
  focus: boolean;
  shields: boolean;
}

/** Team-ups on a chore in a list: can you start one, and has a team claimed it today? */
export interface TeamUpInfo { canStart: boolean; teamId: number | null; claimedBy: string[] | null }
/** Home's Team-ups card: a team-up you're on or could join */
export interface TeamupItem {
  id: number; taskId: number; taskName: string; roomId: number; roomName: string; createdBy: number; invitedUserId: number | null;
  members: Array<{ id: number; displayName: string; helper: boolean }>; mine: boolean; canJoin: boolean; share: number | null;
}

/** Unlockables: what levels have unlocked for you and what you picked */
export interface UnlocksView {
  level: number;
  items: Array<{ level: number; kind: 'frame' | 'theme' | 'celebration' | 'title'; id: string; unlocked: boolean }>;
  badgeFrames: Array<{ id: string; titleKey: string; icon: string; unlocked: boolean }>;
  titles: Array<{ id: string; titleKey?: string; text?: string }>;
  titleLevel: number;
  chosen: { frame: string | null; celebration: string; title: string | null; theme: string | null };
  next: { level: number; kind: string; id: string } | null;
}

/** Cheers on one finished chore (counts in 👏 🎉 💪 ⭐ order, and the viewer's own) */
export interface CheerSummary { counts: Array<{ emoji: string; count: number; names: string[] }>; mine: string | null }

export interface FeaturesView { features: FeatureFlags; rescueMultiplier: number; holidaysOff: string[]; mascot: { creature: string; name: string; bedtimeFrom: string; bedtimeTo: string }; teamBonus: number; shieldPrice?: number;
  /** Every creature: the active one, resting ones (with their name and stage) and new eggs */
  mascotRoster?: Array<{ creature: string; status: 'active' | 'resting' | 'new'; name: string; stage: string }> }

export type NotifyKind = 'taskDue' | 'rewardRequest' | 'achievementUnlocked' | 'choreApproval' | 'coinBoost' | 'outcome' | 'summary' | 'nudge' | 'reminder' | 'cheer' | 'teamup';

export interface NotifySettings {
  morningTime: string;
  eveningTime: string;
  recapDay: number;
  recapTime: string;
  quietStart: string;
  quietEnd: string;
  schoolHoursEnabled: boolean;
  schoolStart: string;
  schoolEnd: string;
  haUrl: string;
  hasHaToken: boolean;
  haFamilyService: string;
}

export interface NotifyPerson {
  id: number;
  displayName: string;
  role: string;
  language: string;
  ntfyTopic: string;
  telegramChatId: string;
  haNotifyService: string;
  prefs: Record<NotifyKind, boolean>;
  /** Their own channels that are set up */
  channels: string[];
}

export interface CustomBadge {
  id: number;
  title: string;
  description: string | null;
  icon: string;
  metric: 'task_count' | 'room_count' | 'task_weeks' | 'goal_weeks' | 'completions' | 'streak' | 'coins_earned';
  taskIds: number[];
  roomId: number | null;
  threshold: number;
  bonusCoins: number;
  userIds: number[] | null;
  secret: boolean;
}
export type CustomBadgeInput = Omit<CustomBadge, 'id'>;

export type BoardPeriod = 'week' | 'lastWeek' | 'month' | 'quarter' | 'year';
export type BoardMode = 'coins' | 'goal' | 'improved';

export interface BoardPerson {
  id: number;
  displayName: string;
  avatarColor: string;
  avatarType: string | null;
  avatarPreset: string | null;
  avatarPhotoUrl: string | null;
  coins: number;
  currentStreak: number;
  /** Coins earned in the period */
  points: number;
  chores: number;
  /** Coins in the same stretch of the period before */
  comparePoints: number;
  improvement: number;
  goalTarget: number | null;
  goalPct: number | null;
  /** What the ranking uses in this mode (null: no goal) */
  score: number | null;
  rank: number;
  prevRank: number | null;
  /** Places gained (+) or lost (−) since the period before */
  movement: number;
}

export interface BoardData {
  period: BoardPeriod;
  mode: BoardMode;
  range: { startAt: string; endAt: string };
  people: BoardPerson[];
  /** Off in Settings → Features: no awards or trophy shelf */
  awardsEnabled?: boolean;
  awards: Array<{ key: 'earlyBird' | 'bountyHunter' | 'allRounder' | 'room'; userIds: number[]; value: number; roomId?: number; roomName?: string }>;
  familyGoal: { target: number; prize: string; total: number; reached: boolean } | null;
  trophies: { weeks: Array<{ weekStart: string; userIds: number[]; coins: number }>; wins: Record<number, number> };
}

function getToken(): string | null {
  return localStorage.getItem('tidyquest_token');
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem('tidyquest_token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error(errorBody.error || 'Request failed') as any;
    err.body = errorBody;
    throw err;
  }

  return res.json();
}

export const api = {
  // Auth
  register: (data: { username: string; password: string; displayName: string; avatarColor?: string; language?: string }) =>
    apiFetch<{ token: string; user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { username: string; password: string }) =>
    apiFetch<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => apiFetch<any>('/auth/me'),

  // Dashboard
  dashboard: () => apiFetch<any>('/dashboard'),

  // Rooms
  getRooms: () => apiFetch<any[]>('/rooms'),
  getZones: () => apiFetch<any[]>('/zones'),
  createZone: (name: string) => apiFetch<any>('/zones', { method: 'POST', body: JSON.stringify({ name }) }),
  updateZone: (id: number, data: { name?: string; sortOrder?: number }) =>
    apiFetch<any>(`/zones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteZone: (id: number) => apiFetch<any>(`/zones/${id}`, { method: 'DELETE' }),
  getDefaultTasks: (roomType: string) =>
    apiFetch<Array<{ name: string; frequencyDays: number; effort: number; isSeasonal?: boolean }>>(`/rooms/defaults/${roomType}`),
  createRoom: (data: { name: string; roomType: string; color?: string; accentColor?: string; tasks?: any[]; assignedUserId?: number | null }) =>
    apiFetch<any>('/rooms', { method: 'POST', body: JSON.stringify(data) }),
  updateRoom: (id: number, data: any) =>
    apiFetch<any>(`/rooms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRoom: (id: number) =>
    apiFetch<any>(`/rooms/${id}`, { method: 'DELETE' }),
  /** Copy a room with its tasks; ownerUserId left out keeps the owner, null clears it */
  duplicateRoom: (id: number, data: { name: string; ownerUserId?: number | null }) =>
    apiFetch<{ id: number; name: string }>(`/rooms/${id}/duplicate`, { method: 'POST', body: JSON.stringify(data) }),

  // Tasks
  getTasks: (roomId: number) => apiFetch<any[]>(`/rooms/${roomId}/tasks`),
  createTask: (roomId: number, data: { name: string; notes?: string; frequencyDays?: number; effort?: number; isSeasonal?: boolean; health?: number; iconKey?: string; translationKey?: string; onDemand?: boolean; showInDashboard?: boolean; assignedToChildren?: boolean; assignedUserIds?: number[]; assignmentMode?: 'first' | 'shared' | 'custom' | 'rotating'; assignedUserPercentages?: Record<number, number>; customCoins?: number | null; allowEarlyCompletion?: boolean; repeatLimit?: number | null; repeatPeriod?: 'day' | 'week' }) =>
    apiFetch<any>(`/rooms/${roomId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: number, data: any) =>
    apiFetch<any>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id: number) =>
    apiFetch<{ success: boolean; trashId: number | null }>(`/tasks/${id}`, { method: 'DELETE' }),
  batchUpdateTasks: (ids: number[], changes: TaskBatchChanges) =>
    apiFetch<{ updated: number }>('/tasks/batch', { method: 'POST', body: JSON.stringify({ ids, changes }) }),
  batchDeleteTasks: (ids: number[]) =>
    apiFetch<{ deleted: number; trashIds: number[] }>('/tasks/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  duplicateTask: (id: number) =>
    apiFetch<any>(`/tasks/${id}/duplicate`, { method: 'POST' }),
  resetTask: (id: number) =>
    apiFetch<{ success: boolean; completionsRemoved: number; coinsDeducted: number; lastCompletedAt: string }>(`/tasks/${id}/reset`, { method: 'POST' }),
  completeTask: (id: number, onBehalfOfUserId?: number, extra: { note?: string } = {}) =>
    apiFetch<{ coinsEarned: number; health: number; pendingApproval?: boolean; newAchievements?: string[]; newAchievementInfo?: Array<{ id: string; titleKey: string | null; title: string | null; icon: string }>; completionId?: number }>(`/tasks/${id}/complete`, {
      method: 'POST', body: JSON.stringify({ ...(onBehalfOfUserId ? { onBehalfOfUserId } : {}), ...extra }),
    }),
  approveCompletionsBatch: (ids: number[]) =>
    apiFetch<{ approved: number[]; skipped: Array<{ id: number; error: string }> }>('/completions/approve-batch', { method: 'POST', body: JSON.stringify({ ids }) }),
  rejectCompletionsBatch: (ids: number[], reason?: string) =>
    apiFetch<{ rejected: number[]; skipped: Array<{ id: number; error: string }> }>('/completions/reject-batch', { method: 'POST', body: JSON.stringify({ ids, reason }) }),
  uploadCompletionPhoto: async (completionId: number, file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('photo', file);
    const res = await fetch(`${API_BASE}/completions/${completionId}/photo`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }
    return res.json() as Promise<{ photoUrl: string }>;
  },
  getOverdueTasks: () =>
    apiFetch<any[]>('/tasks/overdue'),

  // Leaderboard
  leaderboard: (period: 'week' | 'month' | 'quarter' | 'year') => apiFetch<any[]>(`/leaderboard?period=${period}`),
  getFeatures: () => apiFetch<FeaturesView>('/features'),
  updateFeatures: (data: { features?: Partial<FeatureFlags>; rescueMultiplier?: number; holidaysOff?: string[]; mascot?: { creature?: string; name?: string; bedtimeFrom?: string; bedtimeTo?: string }; teamBonus?: number; shieldPrice?: number }) =>
    apiFetch<FeaturesView>('/features', { method: 'PUT', body: JSON.stringify(data) }),
  // Today's Rescue Mission (parents): another one, a chosen chore, or none today
  // Streak shields: buy one with your coins, or a parent gives one
  buyShield: () => apiFetch<{ shields: number; coins: number }>('/shields/buy', { method: 'POST' }),
  giveShield: (userId: number) => apiFetch<{ shields: number; coins: number }>('/shields/give', { method: 'POST', body: JSON.stringify({ userId }) }),
  rescueReroll: () => apiFetch<unknown>('/rescue/reroll', { method: 'POST' }),
  rescueChoose: (taskId: number) => apiFetch<unknown>('/rescue', { method: 'PUT', body: JSON.stringify({ taskId }) }),
  rescueSkip: () => apiFetch<unknown>('/rescue', { method: 'DELETE' }),
  // Home: pin to "Your usual", snooze in "Maybe you forgot" (for yourself)
  pinTask: (id: number) => apiFetch<{ pinned: boolean }>(`/tasks/${id}/pin`, { method: 'POST' }),
  unpinTask: (id: number) => apiFetch<{ pinned: boolean }>(`/tasks/${id}/pin`, { method: 'DELETE' }),
  snoozeTask: (id: number, days = 3) => apiFetch<{ snoozedUntil: string }>(`/tasks/${id}/snooze`, { method: 'POST', body: JSON.stringify({ days }) }),
  unsnoozeTask: (id: number) => apiFetch<{ success: boolean }>(`/tasks/${id}/snooze`, { method: 'DELETE' }),
  // "+ To-do" on Home (one-time chores, parents)
  createTodo: (data: { name: string; assignedUserIds?: number[]; doBy?: string | null; customCoins?: number | null; roomId?: number }) =>
    apiFetch<{ id: number; roomId: number }>('/todos', { method: 'POST', body: JSON.stringify(data) }),
  // Notifications to people (Settings → Notifications)
  getNotifySettings: () => apiFetch<NotifySettings>('/notify/settings'),
  updateNotifySettings: (data: Partial<NotifySettings> & { haToken?: string }) => apiFetch<NotifySettings>('/notify/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getNotifyPeople: () => apiFetch<NotifyPerson[]>('/notify/people'),
  getNotifyPerson: (id: number) => apiFetch<NotifyPerson>(`/notify/people/${id}`),
  updateNotifyPerson: (id: number, data: { ntfyTopic?: string; telegramChatId?: string; haNotifyService?: string; prefs?: Partial<Record<NotifyKind, boolean>> }) =>
    apiFetch<NotifyPerson>(`/notify/people/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  testNotifyPerson: (id: number) => apiFetch<{ results: Array<{ channel: string; ok: boolean; error?: string }> }>(`/notify/people/${id}/test`, { method: 'POST' }),
  getNotifyLog: () => apiFetch<Array<{ id: number; sentAt: string; userId: number | null; displayName: string | null; channel: string; kind: string; message: string; ok: number; error: string | null }>>('/notify/log'),
  // Badges parents make (Settings → Badges)
  getCustomBadges: () => apiFetch<{ badges: Array<CustomBadge & { earnedBy: number }>; builtinBonusCoins: number }>('/achievements/custom'),
  createCustomBadge: (data: CustomBadgeInput) => apiFetch<CustomBadge>('/achievements/custom', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomBadge: (id: number, data: CustomBadgeInput) => apiFetch<CustomBadge>(`/achievements/custom/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomBadge: (id: number) => apiFetch<{ success: boolean }>(`/achievements/custom/${id}`, { method: 'DELETE' }),
  setBadgeConfig: (builtinBonusCoins: number) => apiFetch<{ builtinBonusCoins: number }>('/achievements/config', { method: 'PUT', body: JSON.stringify({ builtinBonusCoins }) }),
  getBoard: (period: BoardPeriod, mode: BoardMode) => apiFetch<BoardData>(`/leaderboard/board?period=${period}&mode=${mode}`),
  getFamilyGoal: () => apiFetch<{ target: number; prize: string; progress: { total: number; target: number } | null }>('/leaderboard/family-goal'),
  setFamilyGoal: (target: number, prize: string) =>
    apiFetch<{ target: number; prize: string; progress: { total: number; target: number } | null }>('/leaderboard/family-goal', { method: 'PUT', body: JSON.stringify({ target, prize }) }),

  // History
  history: (limit = 20, offset = 0, filters: { userId?: number; roomId?: number; from?: string; to?: string; q?: string } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return apiFetch<any>(`/history?${params}`);
  },

  // Users
  getUsers: () => apiFetch<any[]>('/users'),
  createUser: (data: { username: string; password: string; displayName: string; avatarColor?: string; language?: string; role?: 'admin' | 'member' | 'child' }) =>
    apiFetch<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateSettings: (userId: number, data: { language?: string; isVacationMode?: boolean }) =>
    apiFetch<any>(`/users/${userId}/settings`, { method: 'PUT', body: JSON.stringify(data) }),
  updateProfile: (userId: number, data: { displayName?: string; avatarType?: string; avatarColor?: string; avatarPreset?: string | null; language?: string; birthday?: string | null; theme?: string | null; holidayColors?: boolean; homeLayout?: { order: string[]; hidden: string[] } | null }) =>
    apiFetch<any>(`/users/${userId}/profile`, { method: 'PUT', body: JSON.stringify(data) }),
  updatePassword: (userId: number, data: { currentPassword?: string; newPassword: string }) =>
    apiFetch<{ success: boolean }>(`/users/${userId}/password`, { method: 'PUT', body: JSON.stringify(data) }),
  updateUserRole: (userId: number, role: 'admin' | 'member' | 'child') =>
    apiFetch<any>(`/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  updateUserGoal: (userId: number, data: { goalCoins: number | null; goalStartAt?: string | null; goalEndAt?: string | null }) =>
    apiFetch<any>(`/users/${userId}/goal`, { method: 'PUT', body: JSON.stringify(data) }),
  getUserGoals: (userId: number) =>
    apiFetch<Array<{ id: number; userId: number; title: string; goalCoins: number; startAt?: string | null; endAt?: string | null; createdAt: string; rewardCoins?: number; repeatWeekly?: number; status?: string }>>(`/users/${userId}/goals`),
  createUserGoal: (userId: number, data: { title: string; goalCoins: number; startAt?: string | null; endAt?: string | null; rewardCoins?: number; repeatWeekly?: boolean }) =>
    apiFetch<any>(`/users/${userId}/goals`, { method: 'POST', body: JSON.stringify(data) }),
  updateGoal: (goalId: number, data: { title: string; goalCoins: number; startAt?: string | null; endAt?: string | null; rewardCoins?: number; repeatWeekly?: boolean }) =>
    apiFetch<any>(`/users/goals/${goalId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGoal: (goalId: number) =>
    apiFetch<{ success: boolean }>(`/users/goals/${goalId}`, { method: 'DELETE' }),
  deleteUser: (userId: number) =>
    apiFetch<{ success: boolean }>(`/users/${userId}`, { method: 'DELETE' }),
  getCoinsConfig: () => apiFetch<{ coinsByEffort: Record<number, number> }>('/users/coins-config'),
  updateCoinsConfig: (data: { coinsByEffort?: Record<number, number>; useDefault?: boolean }) =>
    apiFetch<{ coinsByEffort: Record<number, number> }>('/users/coins-config', { method: 'PUT', body: JSON.stringify(data) }),
  uploadAvatar: async (userId: number, file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await fetch(`${API_BASE}/users/${userId}/avatar-upload`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }
    return res.json();
  },

  // Data
  exportData: () => apiFetch<any>('/export'),
  importData: (data: any) =>
    apiFetch<any>('/import', { method: 'POST', body: JSON.stringify(data) }),
  achievements: () => apiFetch<any>('/achievements'),
  getRegistrationStatus: () =>
    fetch('/api/auth/registration-status').then((r) => r.json()) as Promise<{ registrationEnabled: boolean }>,
  getLoginAvatars: () =>
    fetch('/api/auth/avatars').then((r) => r.json()) as Promise<Array<{ username: string; displayName: string; avatarColor: string; avatarType: string; avatarPreset?: string; avatarPhotoUrl?: string }>>,
  getGamificationConfig: () =>
    apiFetch<{ gamificationEnabled: boolean }>('/users/gamification-config'),
  updateGamificationConfig: (data: { gamificationEnabled: boolean }) =>
    apiFetch<{ gamificationEnabled: boolean }>('/users/gamification-config', { method: 'PUT', body: JSON.stringify(data) }),
  getRegistrationConfig: () =>
    apiFetch<{ registrationEnabled: boolean }>('/users/registration-config'),
  updateRegistrationConfig: (data: { registrationEnabled: boolean }) =>
    apiFetch<{ registrationEnabled: boolean }>('/users/registration-config', { method: 'PUT', body: JSON.stringify(data) }),
  getNotificationsConfig: () =>
    apiFetch<{
      notificationsEnabled: boolean;
      telegramEnabled: boolean;
      chatId: string;
      hasToken: boolean;
      notificationTime: string;
      notificationTypes: { taskDue: boolean; rewardRequest: boolean; achievementUnlocked: boolean; choreApproval?: boolean; coinBoost?: boolean };
      ntfyEnabled: boolean;
      ntfyServerUrl: string;
      ntfyTopic: string;
      hasNtfyToken: boolean;
    }>('/users/notifications-config'),
  updateNotificationsConfig: (data: {
    notificationsEnabled?: boolean;
    telegramEnabled?: boolean;
    botToken?: string;
    chatId?: string;
    notificationTime?: string;
    notificationTypes?: { taskDue: boolean; rewardRequest: boolean; achievementUnlocked: boolean; choreApproval?: boolean; coinBoost?: boolean };
    ntfyEnabled?: boolean;
    ntfyServerUrl?: string;
    ntfyTopic?: string;
    ntfyToken?: string;
  }) =>
    apiFetch<{
      notificationsEnabled: boolean;
      telegramEnabled: boolean;
      chatId: string;
      hasToken: boolean;
      notificationTime: string;
      notificationTypes: { taskDue: boolean; rewardRequest: boolean; achievementUnlocked: boolean; choreApproval?: boolean; coinBoost?: boolean };
      ntfyEnabled: boolean;
      ntfyServerUrl: string;
      ntfyTopic: string;
      hasNtfyToken: boolean;
    }>('/users/notifications-config', { method: 'PUT', body: JSON.stringify(data) }),
  sendNotificationsTest: (data?: { botToken?: string; chatId?: string; provider?: 'telegram' | 'ntfy'; ntfyServerUrl?: string; ntfyTopic?: string; ntfyToken?: string }) =>
    apiFetch<{ success: boolean }>('/users/notifications-test', { method: 'POST', body: JSON.stringify(data || {}) }),
  getRewards: () =>
    apiFetch<{ rewards: Array<{ id: number; title: string; description?: string | null; costCoins: number }>; mine: Array<{ id: number; title: string; costCoins: number; redeemedAt: string; status: string }> }>('/rewards'),
  getRewardsAdmin: () =>
    apiFetch<{ rewards: any[]; redemptions: any[]; rotatingPerWeek?: number; rotatingThisWeek?: number[] }>('/rewards/admin'),
  updateRedemptionStatus: (id: number, status: 'requested' | 'approved' | 'rejected') =>
    apiFetch<any>(`/rewards/redemptions/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
  refundRedemption: (id: number) =>
    apiFetch<{ id: number; status: string }>(`/rewards/redemptions/${id}/refund`, { method: 'POST' }),
  cancelRedemption: (id: number) =>
    apiFetch<{ redemption: any; coins: number }>(`/rewards/redemptions/${id}/cancel`, { method: 'POST' }),
  createReward: (data: { title: string; description?: string; costCoins: number }) =>
    apiFetch<any>('/rewards', { method: 'POST', body: JSON.stringify(data) }),
  updateReward: (id: number, data: { title: string; description?: string; costCoins: number; isActive?: boolean }) =>
    apiFetch<any>(`/rewards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReward: (id: number) =>
    apiFetch<{ success: boolean; trashId: number | null }>(`/rewards/${id}`, { method: 'DELETE' }),
  setRewardCategory: (id: number, category: string) =>
    apiFetch<{ id: number; category: string | null }>(`/rewards/${id}/category`, { method: 'PUT', body: JSON.stringify({ category }) }),
  /** The parents' "Featured" order, first to last */
  orderRewards: (ids: number[]) =>
    apiFetch<{ success: boolean }>('/rewards/order', { method: 'POST', body: JSON.stringify({ ids }) }),
  redeemReward: (id: number) =>
    apiFetch<{ redemption: any; coins: number }>(`/rewards/${id}/redeem`, { method: 'POST' }),

  cancelCompletion: (completionId: number) =>
    apiFetch<{ success: boolean; coinsDeducted: number }>(`/completions/${completionId}`, { method: 'DELETE' }),
  getPendingCompletions: () =>
    apiFetch<{ pending: Array<{
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
    }> }>('/completions/pending'),
  approveCompletion: (completionId: number, extras?: { note?: string; bonus?: number }) =>
    apiFetch<{ success: boolean }>(`/completions/${completionId}/approve`, { method: 'POST', ...(extras ? { body: JSON.stringify(extras) } : {}) }),
  buyAccessory: (itemId: string) =>
    apiFetch<{ outfit: Outfit; coins: number }>('/mascot/buy', { method: 'POST', body: JSON.stringify({ itemId }) }),
  takeOffAccessory: (slot: string) =>
    apiFetch<{ outfit: Outfit }>('/mascot/take-off', { method: 'POST', body: JSON.stringify({ slot }) }),
  startTeamup: (taskId: number, partnerId: number | null) =>
    apiFetch<{ teamup: unknown }>('/teamups', { method: 'POST', body: JSON.stringify({ taskId, partnerId }) }),
  joinTeamup: (id: number) => apiFetch<{ teamup: unknown }>(`/teamups/${id}/join`, { method: 'POST' }),
  leaveTeamup: (id: number) => apiFetch<{ ok: boolean }>(`/teamups/${id}/leave`, { method: 'POST' }),
  declineTeamup: (id: number) => apiFetch<{ ok: boolean }>(`/teamups/${id}/decline`, { method: 'POST' }),
  suggestIcon: (name: string) => apiFetch<{ iconKey: string }>(`/tasks/icon-suggestion?name=${encodeURIComponent(name)}`),
  getUnlocks: () => apiFetch<UnlocksView>('/unlocks'),
  updateUnlocks: (data: { frame?: string | null; celebration?: string; title?: string | null }) =>
    apiFetch<UnlocksView>('/unlocks', { method: 'PUT', body: JSON.stringify(data) }),
  cheer: (completionId: number, emoji: string) =>
    apiFetch<{ cheers: CheerSummary }>('/cheers', { method: 'POST', body: JSON.stringify({ completionId, emoji }) }),
  rejectPendingCompletion: (completionId: number, reason?: string) =>
    apiFetch<{ success: boolean }>(`/completions/${completionId}/reject`, { method: 'DELETE', body: JSON.stringify({ reason }) }),

  adjustCoins: (userId: number, amount: number, reason?: string) =>
    apiFetch<any>(`/users/${userId}/adjust-coins`, { method: 'POST', body: JSON.stringify({ amount, ...(reason ? { reason } : {}) }) }),
  // Reward rules (who sees it, prices, limits, dates, rotation, shared saving)
  updateRewardRules: (id: number, data: RewardRulesInput) =>
    apiFetch<RewardRules & { id: number }>(`/rewards/${id}/rules`, { method: 'PUT', body: JSON.stringify(data) }),
  updateRotationConfig: (rotatingPerWeek: number) =>
    apiFetch<{ rotatingPerWeek: number; rotatingThisWeek: number[] }>('/rewards/rotation-config', { method: 'PUT', body: JSON.stringify({ rotatingPerWeek }) }),
  contributeReward: (id: number, amount: number) =>
    apiFetch<{ coins: number; pot: RewardPot; redemption: unknown }>(`/rewards/${id}/contribute`, { method: 'POST', body: JSON.stringify({ amount }) }),
  // Double coins events
  getBoosts: () => apiFetch<CoinBoost[]>('/boosts'),
  createBoost: (data: { title: string; multiplier: number; startAt: string; endAt: string; roomIds?: number[] | null; taskIds?: number[] | null }) =>
    apiFetch<CoinBoost>('/boosts', { method: 'POST', body: JSON.stringify(data) }),
  deleteBoost: (id: number) => apiFetch<{ success: boolean }>(`/boosts/${id}`, { method: 'DELETE' }),

  // Recently deleted tasks and rewards (kept 30 days)
  // Insights for parents
  getInsightsBars: (period: InsightsPeriod, offset: number) => apiFetch<InsightsBars>(`/insights/bars?period=${period}&offset=${offset}`),
  getInsightsHeatmap: (weeks: 4 | 12) => apiFetch<InsightsHeatmap>(`/insights/heatmap?weeks=${weeks}`),

  getTrash: () => apiFetch<{ items: TrashItem[]; keepDays: number }>('/trash'),
  restoreTrash: (id: number, roomId?: number) =>
    apiFetch<{ kind: 'task' | 'reward'; id: number; roomId?: number }>(`/trash/${id}/restore`, { method: 'POST', body: JSON.stringify(roomId ? { roomId } : {}) }),
  deleteTrash: (id: number) => apiFetch<{ success: boolean }>(`/trash/${id}`, { method: 'DELETE' }),

  // Spreadsheets
  exportCsv: async (kind: CsvKind): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/csv/${kind}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Request failed');
    return res.blob();
  },
  importCsv: (kind: CsvKind, csv: string, dryRun: boolean) =>
    apiFetch<CsvImportResult>(`/csv/${kind}/import`, { method: 'POST', body: JSON.stringify({ csv, dryRun }) }),

  getVacationConfig: () =>
    apiFetch<{ vacationMode: boolean; vacationStartDate: string | null; vacationEndDate: string | null }>('/users/vacation-config'),
  updateVacationConfig: (data: { vacationMode?: boolean; vacationEndDate?: string | null }) =>
    apiFetch<{ vacationMode: boolean; vacationStartDate: string | null; vacationEndDate: string | null }>('/users/vacation-config', { method: 'PUT', body: JSON.stringify(data) }),

  updateUserVacation: (userId: number, data: { isVacationMode?: boolean; vacationEndDate?: string | null }) =>
    apiFetch<any>(`/users/${userId}/vacation`, { method: 'PUT', body: JSON.stringify(data) }),

  updateUserParticipant: (userId: number, isParticipant: boolean) =>
    apiFetch<any>(`/users/${userId}/participant`, { method: 'PUT', body: JSON.stringify({ isParticipant }) }),

  updateUserView: (userId: number, data: { taskView?: 'all' | 'mine' | 'mineOnly'; kidMode?: boolean; focusMode?: FocusModeSetting }) =>
    apiFetch<{ id: number; taskView: 'all' | 'mine' | 'mineOnly'; kidMode: number }>(`/users/${userId}/view`, { method: 'PUT', body: JSON.stringify(data) }),
  getKidsConfig: () => apiFetch<{ hidePrivateRooms: boolean }>('/users/kids-config'),
  updateKidsConfig: (data: { hidePrivateRooms: boolean }) =>
    apiFetch<{ hidePrivateRooms: boolean }>('/users/kids-config', { method: 'PUT', body: JSON.stringify(data) }),
  getStrictModeConfig: () =>
    apiFetch<{ strictMode: boolean }>('/users/strict-mode-config'),
  updateStrictModeConfig: (data: { strictMode: boolean }) =>
    apiFetch<{ strictMode: boolean }>('/users/strict-mode-config', { method: 'PUT', body: JSON.stringify(data) }),
};
