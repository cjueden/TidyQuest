import type { CoinCategory, InsightsBars, InsightsCoins, InsightsGrain, InsightsHeatmap, InsightsPeriod, InsightsRange, InsightsSkipped } from '../../hooks/useApi';
import { localeFor } from '../../utils/locale';

export type Measure = 'chores' | 'coins' | 'effort';
export type StackBy = 'person' | 'room' | 'chore';

export interface Series { key: string; label: string; color: string }
export interface Stacked { series: Series[]; values: number[][]; totals: number[] }

/** Rows hold [.., chores, coins, effort] starting at this column. */
const MEASURE_COL: Record<Measure, number> = { chores: 0, coins: 1, effort: 2 };
const SLOTS = 8;
const slotColor = (i: number) => `var(--viz-${i + 1})`;

export interface Names { task: (id: number) => string; room: (id: number) => string }

/**
 * Stack a period's rows by person, room or chore. Past 8 rooms or chores, the rest fold into a gray
 * "Other". Colors follow the entity: people keep their own color; rooms and chores take palette slots in
 * room order (rooms by their place in the family's list when there are 8 or fewer), never by rank.
 */
export function stackBars(data: InsightsBars, stack: StackBy, measure: Measure, personId: number | null, names: Names, otherLabel: string): Stacked {
  const col = 3 + MEASURE_COL[measure];
  const rows = data.rows.filter((r) => personId == null || r[1] === personId);
  const roomOf = new Map(data.tasks.map((t) => [t.id, t.roomId]));
  const roomOrder = new Map(data.rooms.map((r, i) => [r.id, i]));
  const keyOf = (r: InsightsBars['rows'][number]) =>
    stack === 'person' ? r[1] : stack === 'room' ? (roomOf.get(r[2]) ?? 0) : r[2];

  const totalsByKey = new Map<number, number>();
  for (const r of rows) totalsByKey.set(keyOf(r), (totalsByKey.get(keyOf(r)) ?? 0) + r[col]);
  const present = [...totalsByKey.entries()].filter(([, v]) => v > 0).map(([k]) => k);

  let series: Series[];
  let index: (key: number) => number;
  if (stack === 'person') {
    const people = data.people.filter((p) => present.includes(p.id));
    series = people.map((p) => ({ key: `p${p.id}`, label: p.name, color: p.color }));
    const at = new Map(people.map((p, i) => [p.id, i]));
    index = (k) => at.get(k) ?? -1;
  } else {
    const order = (k: number) => stack === 'room'
      ? roomOrder.get(k) ?? 999
      : (roomOrder.get(roomOf.get(k) ?? 0) ?? 999) * 100000 + k;
    const ranked = [...present].sort((a, b) => (totalsByKey.get(b)! - totalsByKey.get(a)!) || order(a) - order(b));
    const fold = ranked.length > SLOTS;
    const kept = (fold ? ranked.slice(0, SLOTS) : ranked).sort((a, b) => order(a) - order(b));
    const stable = stack === 'room' && data.rooms.length <= SLOTS;
    series = kept.map((k, i) => ({
      key: `${stack[0]}${k}`,
      label: stack === 'room' ? names.room(k) : names.task(k),
      color: slotColor(stable ? roomOrder.get(k) ?? i : i),
    }));
    if (fold) series.push({ key: 'other', label: otherLabel, color: 'var(--viz-other)' });
    const at = new Map(kept.map((k, i) => [k, i]));
    index = (k) => at.get(k) ?? (fold ? kept.length : -1);
  }

  const values = data.buckets.map(() => series.map(() => 0));
  for (const r of rows) {
    const i = index(keyOf(r));
    if (i >= 0 && values[r[0]]) values[r[0]][i] += r[col];
  }
  return { series, values, totals: values.map((v) => v.reduce((a, b) => a + b, 0)) };
}

/** Each person's total this period and last, for the chosen measure (ignores the person filter). */
export function shares(data: InsightsBars, measure: Measure) {
  const col = MEASURE_COL[measure];
  const now = new Map<number, number>();
  for (const r of data.rows) now.set(r[1], (now.get(r[1]) ?? 0) + r[3 + col]);
  const before = new Map(data.previous.map((p) => [p[0], p[1 + col]]));
  const total = [...now.values()].reduce((a, b) => a + b, 0);
  return data.people
    .map((p) => ({ person: p, value: now.get(p.id) ?? 0, previous: before.get(p.id) ?? 0 }))
    .filter((s) => s.value > 0 || s.previous > 0)
    .map((s) => ({ ...s, share: total > 0 ? s.value / total : 0 }))
    .sort((a, b) => b.value - a.value || a.person.id - b.person.id);
}

/** 7 × 6 grid of weekly averages (Monday first). */
export function heatGrid(data: InsightsHeatmap, measure: Measure, personId: number | null): number[][] {
  const col = 3 + MEASURE_COL[measure];
  const grid = Array.from({ length: 7 }, () => Array(6).fill(0) as number[]);
  for (const r of data.rows) {
    if (personId != null && r[2] !== personId) continue;
    grid[r[0]][r[1]] += r[col];
  }
  return grid.map((row) => row.map((v) => v / data.weeks));
}

/** Labels for each bar: a short one for the axis and a full one for the readout. weekOf: "Week of {date}". */
export function bucketLabels(grain: InsightsGrain, buckets: string[], language: string, weekOf: string) {
  const locale = localeFor(language);
  const dates = buckets.map((b) => new Date(b));
  const years = new Set(dates.map((d) => d.getFullYear()));
  const yearNote = years.size > 1 || !years.has(new Date().getFullYear());
  const months = new Set(dates.map((d) => `${d.getFullYear()}-${d.getMonth()}`));
  const multiDay = dates.length > 0 && dates[0].toDateString() !== dates[dates.length - 1].toDateString();
  const time = (d: Date) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const dayName = (d: Date) => d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', ...(yearNote ? { year: 'numeric' } : {}) });
  return dates.map((d) => {
    if (grain === 'hour') {
      const range = `${time(d)}–${time(new Date(d.getTime() + 3600000))}`;
      return { axis: d.toLocaleTimeString(locale, { hour: 'numeric' }), full: multiDay ? `${dayName(d)} · ${range}` : range };
    }
    if (grain === 'month') {
      return {
        axis: d.toLocaleDateString(locale, years.size > 1 ? { month: 'short', year: '2-digit' } : { month: 'short' }),
        full: d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      };
    }
    if (grain === 'week') {
      return { axis: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }), full: weekOf.replace('{date}', dayName(d)) };
    }
    return {
      axis: dates.length <= 7 ? d.toLocaleDateString(locale, { weekday: 'short' })
        : months.size === 1 ? String(d.getDate()) : d.toLocaleDateString(locale, { day: 'numeric', month: 'numeric' }),
      full: dayName(d),
    };
  });
}

/** The window's name for the ◀ ▶ header (with the year when it isn't this year). */
export function periodLabel(period: InsightsRange, startIso: string, endIso: string, language: string): string {
  const locale = localeFor(language);
  const start = new Date(startIso);
  const last = new Date(new Date(endIso).getTime() - 1);
  const thisYear = new Date().getFullYear();
  const withYear = start.getFullYear() !== thisYear || last.getFullYear() !== thisYear;
  if (period === 'day') return start.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) });
  if (period === 'month') return start.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  if (period === 'year') return String(start.getFullYear());
  if (start.toDateString() === last.toDateString()) return start.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const fmt = (d: Date, year: boolean) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
  return `${fmt(start, start.getFullYear() !== last.getFullYear())} – ${fmt(last, withYear)}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A local day as 'YYYY-MM-DD' */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'YYYY-MM-DD' at local noon (DST can't move it to another day) */
export const fromYmd = (s: string) => new Date(`${s}T12:00:00`);
export const addDays = (s: string, n: number) => { const d = fromYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
/** Days from `from` to `to`, both counted */
export const daysIncl = (from: string, to: string) => Math.round((fromYmd(to).getTime() - fromYmd(from).getTime()) / 86400000) + 1;

/** The picked day moved by whole periods (a month keeps its day where it can). */
export function shiftDay(period: InsightsPeriod, day: string, steps: number): string {
  const d = fromYmd(day);
  if (period === 'day') d.setDate(d.getDate() + steps);
  else if (period === 'week') d.setDate(d.getDate() + 7 * steps);
  else if (period === 'month') {
    const keep = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + steps);
    d.setDate(Math.min(keep, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else d.setFullYear(d.getFullYear() + steps);
  return ymd(d);
}

/** The last day of the period holding `day` (Sunday, the month's last day, 31 Dec). */
export function lastDayOf(period: InsightsPeriod, day: string): string {
  const d = fromYmd(day);
  if (period === 'week') d.setDate(d.getDate() + (7 - d.getDay()) % 7);
  else if (period === 'month') d.setDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  else if (period === 'year') { d.setMonth(11); d.setDate(31); }
  return ymd(d);
}

/** Clean axis ticks from 0 up to at least `max`. */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 3;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function formatValue(v: number, language: string, decimals = 0): string {
  return v.toLocaleString(localeFor(language), { maximumFractionDigits: decimals, notation: v >= 10000 ? 'compact' : 'standard' });
}

export type ListBy = 'chore' | 'room';
export interface LateItem { key: string; name: string; room: string | null; done: number; late: number; avgDays: number; worst: number }
export interface UndoneItem { key: string; name: string; room: string | null; days: number; worst: number }
export interface WaitItem { key: string; name: string; room: string | null; count: number; avgHours: number; longest: number; now: number | null }

/**
 * The three skipped lists, by chore or rolled up by room. With a person picked: chores they did late,
 * and chores assigned to them (or to nobody in particular) for "left overdue" and the open pools.
 */
/** What an open-pool row shows and is ranked by: the average wait, or how long it's been waiting if never done. */
export const waitValue = (i: WaitItem) => (i.count ? i.avgHours : i.now ?? 0);

export function skippedLists(data: InsightsSkipped, by: ListBy, personId: number | null, names: Names) {
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const theirs = (taskId: number) => {
    const t = tasks.get(taskId);
    return !!t && (personId == null || t.assignees.length === 0 || t.assignees.includes(personId));
  };
  const keyOf = (taskId: number) => (by === 'room' ? `r${tasks.get(taskId)?.roomId ?? 0}` : `t${taskId}`);
  const label = (taskId: number) => {
    const t = tasks.get(taskId)!;
    return by === 'room'
      ? { name: names.room(t.roomId), room: null }
      : { name: names.task(t.id), room: names.room(t.roomId) };
  };

  const late = new Map<string, LateItem & { sum: number }>();
  for (const [taskId, userId, done, lateN, sum, worst] of data.late) {
    if (!tasks.has(taskId) || (personId != null && userId !== personId)) continue;
    const k = keyOf(taskId);
    const it = late.get(k) ?? { key: k, ...label(taskId), done: 0, late: 0, avgDays: 0, worst: 0, sum: 0 };
    it.done += done; it.late += lateN; it.sum += sum; it.worst = Math.max(it.worst, worst);
    late.set(k, it);
  }
  const undone = new Map<string, UndoneItem>();
  for (const [taskId, days, worst] of data.undone) {
    if (!theirs(taskId)) continue;
    const k = keyOf(taskId);
    const it = undone.get(k) ?? { key: k, ...label(taskId), days: 0, worst: 0 };
    it.days += days; it.worst = Math.max(it.worst, worst);
    undone.set(k, it);
  }
  const waits = new Map<string, WaitItem & { sum: number }>();
  const waitItem = (taskId: number) => {
    const k = keyOf(taskId);
    const it = waits.get(k) ?? { key: k, ...label(taskId), count: 0, avgHours: 0, longest: 0, now: null, sum: 0 };
    waits.set(k, it);
    return it;
  };
  for (const [taskId, count, sum, longest] of data.waits) {
    if (!theirs(taskId)) continue;
    const it = waitItem(taskId);
    it.count += count; it.sum += sum; it.longest = Math.max(it.longest, longest);
  }
  for (const [taskId, hours] of data.waitingNow) {
    if (!theirs(taskId)) continue;
    const it = waitItem(taskId);
    it.now = Math.max(it.now ?? 0, hours);
  }

  return {
    late: [...late.values()].filter((i) => i.late > 0)
      .map(({ sum, ...i }) => ({ ...i, avgDays: sum / i.late }))
      .sort((a, b) => b.late - a.late || b.avgDays - a.avgDays || a.name.localeCompare(b.name)),
    undone: [...undone.values()].sort((a, b) => b.days - a.days || b.worst - a.worst || a.name.localeCompare(b.name)),
    waits: [...waits.values()]
      .map(({ sum, ...i }) => ({ ...i, avgHours: i.count ? sum / i.count : 0 }))
      .sort((a, b) => waitValue(b) - waitValue(a) || a.name.localeCompare(b.name)),
  };
}

/** Coins in sit above the line, coins out below. Palette slots in this order keep stacked neighbours distinct. */
export const COINS_IN: CoinCategory[] = ['chores', 'bonus'];
export const COINS_OUT: CoinCategory[] = ['rewards', 'chipins', 'mascot', 'shields', 'adjust'];
export const coinColor = (c: CoinCategory) => `var(--viz-${[...COINS_IN, ...COINS_OUT].indexOf(c) + 1})`;

export interface CoinWeeks {
  inCats: CoinCategory[]; outCats: CoinCategory[];
  /** [week][category index] */
  up: number[][]; down: number[][];
  earned: number[]; spent: number[]; choreCoins: number[];
  /** The weekly goal (one person only), or null */
  goals: Array<number | null>;
  /** End-of-week balance, worked back from today's */
  balance: number[];
}

/** One person's weeks (or everyone's added up, without goals). */
export function coinWeeks(data: InsightsCoins, personId: number | null): CoinWeeks {
  const n = data.starts.length;
  const flows = data.flows.filter((f) => personId == null || f[1] === personId);
  const has = new Set(flows.filter((f) => f[3] > 0).map((f) => f[2]));
  const inCats = COINS_IN.filter((c) => has.has(c));
  const outCats = COINS_OUT.filter((c) => has.has(c));
  const up = Array.from({ length: n }, () => inCats.map(() => 0));
  const down = Array.from({ length: n }, () => outCats.map(() => 0));
  for (const [w, , c, coins] of flows) {
    const i = inCats.indexOf(c);
    if (i >= 0) up[w][i] += coins; else { const j = outCats.indexOf(c); if (j >= 0) down[w][j] += coins; }
  }
  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  const earned = up.map(sum);
  const spent = down.map(sum);
  const ci = inCats.indexOf('chores');
  const goals: Array<number | null> = Array(n).fill(null);
  if (personId != null) for (const [w, u, g] of data.goals) if (u === personId) goals[w] = g;
  const balance = Array(n).fill(0) as number[];
  const who = (id: number) => personId == null || id === personId;
  let b = data.people.filter((p) => who(p.id)).reduce((a, p) => a + p.balance, 0)
    - data.afterNet.filter(([id]) => who(id)).reduce((a, [, net]) => a + net, 0);
  for (let w = n - 1; w >= 0; w--) {
    balance[w] = Math.max(0, b);
    b -= earned[w] - spent[w];
  }
  return { inCats, outCats, up, down, earned, spent, choreCoins: up.map((v) => (ci >= 0 ? v[ci] : 0)), goals, balance };
}

/** Rewards bought most (times, coins) and the active ones never bought in the window. */
export function rewardStats(data: InsightsCoins, personId: number | null) {
  const rows = data.bought.filter((b) => personId == null || b[1] === personId);
  const by = new Map<number, { ids: Set<number>; coins: number }>();
  for (const [rewardId, , redemptionId, coins] of rows) {
    const it = by.get(rewardId) ?? { ids: new Set<number>(), coins: 0 };
    it.ids.add(redemptionId); it.coins += coins;
    by.set(rewardId, it);
  }
  const title = new Map(data.rewards.map((r) => [r.id, r.title]));
  const most = [...by.entries()]
    .map(([id, v]) => ({ key: `w${id}`, name: title.get(id) ?? '?', times: v.ids.size, coins: v.coins }))
    .sort((a, b) => b.times - a.times || b.coins - a.coins || a.name.localeCompare(b.name));
  const never = data.rewards.filter((r) => r.isActive && !by.has(r.id)).map((r) => r.title);
  return { most, never };
}
