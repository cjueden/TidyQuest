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
  roomIds: number[] | null;
}

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
    apiFetch<{ coinsEarned: number; health: number; pendingApproval?: boolean; newAchievements?: string[]; completionId?: number }>(`/tasks/${id}/complete`, {
      method: 'POST', body: JSON.stringify({ ...(onBehalfOfUserId ? { onBehalfOfUserId } : {}), ...extra }),
    }),
  approveCompletionsBatch: (ids: number[]) =>
    apiFetch<{ approved: number[]; skipped: Array<{ id: number; error: string }> }>('/completions/approve-batch', { method: 'POST', body: JSON.stringify({ ids }) }),
  rejectCompletionsBatch: (ids: number[]) =>
    apiFetch<{ rejected: number[]; skipped: Array<{ id: number; error: string }> }>('/completions/reject-batch', { method: 'POST', body: JSON.stringify({ ids }) }),
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
  updateProfile: (userId: number, data: { displayName?: string; avatarType?: string; avatarColor?: string; avatarPreset?: string | null; language?: string }) =>
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
  approveCompletion: (completionId: number) =>
    apiFetch<{ success: boolean }>(`/completions/${completionId}/approve`, { method: 'POST' }),
  rejectPendingCompletion: (completionId: number) =>
    apiFetch<{ success: boolean }>(`/completions/${completionId}/reject`, { method: 'DELETE' }),

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
  createBoost: (data: { title: string; multiplier: number; startAt: string; endAt: string; roomIds?: number[] | null }) =>
    apiFetch<CoinBoost>('/boosts', { method: 'POST', body: JSON.stringify(data) }),
  deleteBoost: (id: number) => apiFetch<{ success: boolean }>(`/boosts/${id}`, { method: 'DELETE' }),

  // Recently deleted tasks and rewards (kept 30 days)
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

  updateUserView: (userId: number, data: { taskView?: 'all' | 'mine' | 'mineOnly'; kidMode?: boolean }) =>
    apiFetch<{ id: number; taskView: 'all' | 'mine' | 'mineOnly'; kidMode: number }>(`/users/${userId}/view`, { method: 'PUT', body: JSON.stringify(data) }),
  getKidsConfig: () => apiFetch<{ hidePrivateRooms: boolean }>('/users/kids-config'),
  updateKidsConfig: (data: { hidePrivateRooms: boolean }) =>
    apiFetch<{ hidePrivateRooms: boolean }>('/users/kids-config', { method: 'PUT', body: JSON.stringify(data) }),
  getStrictModeConfig: () =>
    apiFetch<{ strictMode: boolean }>('/users/strict-mode-config'),
  updateStrictModeConfig: (data: { strictMode: boolean }) =>
    apiFetch<{ strictMode: boolean }>('/users/strict-mode-config', { method: 'PUT', body: JSON.stringify(data) }),
};
