import db from '../database';
import { startOfLocalWeek } from './periods';

/**
 * The Board page: who's ahead (by coins, by their own weekly goal, or by how much they improved),
 * the period's awards, the family team goal, and the trophy shelf of past weekly winners.
 * Only people who take part in chores are on it (kids, members, parents who opted in).
 */

export const BOARD_PERIODS = ['week', 'lastWeek', 'month', 'quarter', 'year'] as const;
export const BOARD_MODES = ['coins', 'goal', 'improved'] as const;
export type BoardPeriod = typeof BOARD_PERIODS[number];
export type BoardMode = typeof BOARD_MODES[number];

interface Range { start: Date; end: Date }

const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/**
 * The period, the same stretch of the period before it (this week so far vs. last week up to the
 * same moment, so "improved" is fair mid-week), and the whole period before (for rank movement).
 */
export function boardRanges(period: BoardPeriod, now: Date = new Date()): { current: Range; compare: Range; previous: Range } {
  const week = startOfLocalWeek(now);
  const daysBefore = (d: Date, n: number) => { const out = new Date(d); out.setDate(out.getDate() - n); return out; };
  if (period === 'week' || period === 'lastWeek') {
    const start = period === 'week' ? week : daysBefore(week, 7);
    const end = period === 'week' ? now : week;
    return {
      current: { start, end },
      compare: { start: daysBefore(start, 7), end: daysBefore(end, 7) },
      previous: { start: daysBefore(start, 7), end: start },
    };
  }
  const months = period === 'month' ? 1 : period === 'quarter' ? 3 : 12;
  const first = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1)
    : period === 'quarter' ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    : new Date(now.getFullYear(), 0, 1);
  const prevStart = addMonths(first, -months);
  const elapsed = now.getTime() - first.getTime();
  return {
    current: { start: first, end: now },
    compare: { start: prevStart, end: new Date(Math.min(prevStart.getTime() + elapsed, first.getTime())) },
    previous: { start: prevStart, end: first },
  };
}

interface Person {
  id: number; displayName: string; avatarColor: string; avatarType: string | null; avatarPreset: string | null;
  avatarPhotoUrl: string | null; coins: number; currentStreak: number;
}

function participants(): Person[] {
  return db.prepare(
    `SELECT id, displayName, avatarColor, avatarType, avatarPreset, avatarPhotoUrl, coins, currentStreak FROM users
     WHERE role IN ('child', 'member') OR (role = 'admin' AND isParticipant = 1) ORDER BY displayName`
  ).all() as Person[];
}

function coinsIn(range: Range): Map<number, { coins: number; chores: number }> {
  const rows = db.prepare(
    `SELECT userId, COALESCE(SUM(coinsEarned), 0) AS coins, COUNT(*) AS chores FROM task_completions
     WHERE status = 'approved' AND completedAt >= ? AND completedAt < ? GROUP BY userId`
  ).all(range.start.toISOString(), range.end.toISOString()) as Array<{ userId: number; coins: number; chores: number }>;
  return new Map(rows.map((r) => [r.userId, { coins: r.coins, chores: r.chores }]));
}

/** Each person's goal target for the period: the goals that overlap it (their weekly Weekly Win). */
function goalTargets(range: Range): Map<number, number> {
  const rows = db.prepare(
    `SELECT userId, COALESCE(SUM(goalCoins), 0) AS target FROM user_goals
     WHERE startAt IS NOT NULL AND endAt IS NOT NULL AND startAt < ? AND endAt > ? GROUP BY userId`
  ).all(range.end.toISOString(), range.start.toISOString()) as Array<{ userId: number; target: number }>;
  return new Map(rows.map((r) => [r.userId, r.target]));
}

/** Standard competition ranking (1, 2, 2, 4) by score, highest first; null scores rank last. */
function rankBy<T extends { score: number | null }>(items: T[]): Map<T, number> {
  const sorted = [...items].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  const ranks = new Map<T, number>();
  sorted.forEach((item, i) => {
    const prev = sorted[i - 1];
    ranks.set(item, prev && prev.score === item.score ? ranks.get(prev)! : i + 1);
  });
  return ranks;
}

export interface Award { key: 'earlyBird' | 'bountyHunter' | 'allRounder' | 'room'; userIds: number[]; value: number; roomId?: number; roomName?: string }

/** The period's awards. Ties share an award; each needs a minimum so a single chore doesn't win. */
function awardsFor(range: Range, ids: Set<number>): Award[] {
  const rows = (db.prepare(
    `SELECT c.userId, c.completedAt, t.onDemand, t.roomId, r.name AS roomName, r.assignedUserId AS roomOwner FROM task_completions c
     JOIN tasks t ON t.id = c.taskId JOIN rooms r ON r.id = t.roomId
     WHERE c.status = 'approved' AND c.completedAt >= ? AND c.completedAt < ?`
  ).all(range.start.toISOString(), range.end.toISOString()) as Array<{ userId: number; completedAt: string; onDemand: number; roomId: number; roomName: string; roomOwner: number | null }>)
    .filter((r) => ids.has(r.userId));

  const best = (counts: Map<number, number>, min: number) => {
    const top = Math.max(0, ...counts.values());
    return top >= min ? { userIds: [...counts].filter(([, n]) => n === top).map(([id]) => id).sort((a, b) => a - b), value: top } : null;
  };
  const tally = (pick: (r: typeof rows[number]) => boolean) => {
    const m = new Map<number, number>();
    for (const r of rows) if (pick(r)) m.set(r.userId, (m.get(r.userId) ?? 0) + 1);
    return m;
  };
  const awards: Award[] = [];
  const early = best(tally((r) => new Date(r.completedAt).getHours() < 8), 2);
  if (early) awards.push({ key: 'earlyBird', ...early });
  const bounty = best(tally((r) => !!r.onDemand), 2);
  if (bounty) awards.push({ key: 'bountyHunter', ...bounty });
  const roomsPerPerson = new Map<number, Set<number>>();
  for (const r of rows) {
    if (!roomsPerPerson.has(r.userId)) roomsPerPerson.set(r.userId, new Set());
    roomsPerPerson.get(r.userId)!.add(r.roomId);
  }
  const rounder = best(new Map([...roomsPerPerson].map(([id, s]) => [id, s.size])), 3);
  if (rounder) awards.push({ key: 'allRounder', ...rounder });

  // Room champions: most chores done in each shared room (rooms with the most activity first). Rooms
  // that belong to someone (e.g. someone's own quest room) are left out: their owner would always win.
  const byRoom = new Map<number, { name: string; total: number; counts: Map<number, number> }>();
  for (const r of rows) {
    if (r.roomOwner != null) continue;
    if (!byRoom.has(r.roomId)) byRoom.set(r.roomId, { name: r.roomName, total: 0, counts: new Map() });
    const room = byRoom.get(r.roomId)!;
    room.total++;
    room.counts.set(r.userId, (room.counts.get(r.userId) ?? 0) + 1);
  }
  for (const [roomId, room] of [...byRoom].sort((a, b) => b[1].total - a[1].total || a[1].name.localeCompare(b[1].name))) {
    const champ = best(room.counts, 2);
    if (champ) awards.push({ key: 'room', roomId, roomName: room.name, ...champ });
  }
  return awards;
}

/** Past weekly winners (by coins): the last `limit` weeks for the shelf, and wins per person over all time. */
function trophyShelf(ids: Set<number>, now: Date, limit = 8) {
  const thisMonday = startOfLocalWeek(now).toISOString();
  const rows = (db.prepare(
    `SELECT date(completedAt, 'localtime', 'weekday 0', '-6 days') AS week, userId, SUM(coinsEarned) AS coins
     FROM task_completions WHERE status = 'approved' AND completedAt < ? GROUP BY week, userId`
  ).all(thisMonday) as Array<{ week: string; userId: number; coins: number }>).filter((r) => ids.has(r.userId));
  const weeks = new Map<string, Array<{ userId: number; coins: number }>>();
  for (const r of rows) {
    if (!weeks.has(r.week)) weeks.set(r.week, []);
    weeks.get(r.week)!.push(r);
  }
  const winners: Array<{ weekStart: string; userIds: number[]; coins: number }> = [];
  const wins: Record<number, number> = {};
  for (const [week, list] of [...weeks].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    const top = Math.max(...list.map((l) => l.coins));
    if (top <= 0) continue;
    const userIds = list.filter((l) => l.coins === top).map((l) => l.userId).sort((a, b) => a - b);
    for (const id of userIds) wins[id] = (wins[id] ?? 0) + 1;
    winners.push({ weekStart: week, userIds, coins: top });
  }
  return { weeks: winners.slice(0, limit), wins };
}

function getSetting(key: string): string | null {
  return (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;
}

/** The family team goal: everyone's coins this week toward one shared target and prize. */
export function familyGoal(now: Date = new Date()) {
  const target = Number(getSetting('familyGoalCoins')) || 0;
  if (target <= 0) return null;
  const ids = new Set(participants().map((p) => p.id));
  const week = { start: startOfLocalWeek(now), end: now };
  let total = 0;
  for (const [id, v] of coinsIn(week)) if (ids.has(id)) total += v.coins;
  return { target, prize: getSetting('familyGoalPrize') || '', total, reached: total >= target };
}

export function buildBoard(period: BoardPeriod, mode: BoardMode, now: Date = new Date()) {
  const ranges = boardRanges(period, now);
  const people = participants();
  const ids = new Set(people.map((p) => p.id));
  const current = coinsIn(ranges.current);
  const compare = coinsIn(ranges.compare);
  const previous = coinsIn(ranges.previous);
  const targets = goalTargets(ranges.current);

  const rows = people.map((p) => {
    const points = current.get(p.id)?.coins ?? 0;
    const before = compare.get(p.id)?.coins ?? 0;
    const goalTarget = targets.get(p.id) ?? null;
    const goalPct = goalTarget ? Math.round((points / goalTarget) * 100) : null;
    const score = mode === 'coins' ? points : mode === 'goal' ? goalPct : points - before;
    return {
      ...p,
      points,
      chores: current.get(p.id)?.chores ?? 0,
      comparePoints: before,
      improvement: points - before,
      goalTarget,
      goalPct,
      score,
      previousPoints: previous.get(p.id)?.coins ?? 0,
    };
  });
  const ranks = rankBy(rows);
  const prevRanks = rankBy(rows.map((r) => ({ id: r.id, score: r.previousPoints as number | null })));
  const prevRankById = new Map([...prevRanks].map(([r, rank]) => [r.id, rank]));
  const anyBefore = rows.some((r) => r.previousPoints > 0);
  const result = rows
    .map((r) => {
      const rank = ranks.get(r)!;
      const prevRank = anyBefore ? prevRankById.get(r.id)! : null;
      return { ...r, rank, prevRank, movement: prevRank === null ? 0 : prevRank - rank };
    })
    .sort((a, b) => a.rank - b.rank || a.displayName.localeCompare(b.displayName));

  return {
    period,
    mode,
    range: { startAt: ranges.current.start.toISOString(), endAt: ranges.current.end.toISOString() },
    people: result,
    awards: awardsFor(ranges.current, ids),
    familyGoal: familyGoal(now),
    trophies: trophyShelf(ids, now),
  };
}
