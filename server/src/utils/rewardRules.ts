import db from '../database';
import { localDateStr } from './dateHelpers';

/**
 * Per-reward rules added by this fork: who can see a reward and what it costs them, how often it
 * can be redeemed, when it's on offer (date window, weekly rotation) and shared saving pots.
 * Dates and periods use the server's local time (TZ), like the rest of the app.
 */

export const LIMIT_PERIODS = ['ever', 'day', 'week', 'month'] as const;
export const LIMIT_SCOPES = ['person', 'everyone'] as const;
export type LimitPeriod = typeof LIMIT_PERIODS[number];
export type LimitScope = typeof LIMIT_SCOPES[number];

export interface RewardRules {
  id: number;
  title: string;
  costCoins: number;
  isActive: number;
  limitCount: number | null;
  limitPeriod: LimitPeriod;
  limitScope: LimitScope;
  availableFrom: string | null;
  availableUntil: string | null;
  isRotating: number;
  isShared: number;
}

export interface Availability {
  limit: number;
  period: LimitPeriod;
  scope: LimitScope;
  used: number;
  remaining: number;
  /** When the next period starts (null for "ever") */
  resetsAt: string | null;
}

const RULE_COLUMNS = 'id, title, costCoins, isActive, limitCount, limitPeriod, limitScope, availableFrom, availableUntil, isRotating, isShared';
export const DEFAULT_ROTATING_PER_WEEK = 3;

export function getRules(rewardId: number): RewardRules | undefined {
  return db.prepare(`SELECT ${RULE_COLUMNS} FROM rewards WHERE id = ?`).get(rewardId) as RewardRules | undefined;
}

function allRules(): Map<number, RewardRules> {
  const rows = db.prepare(`SELECT ${RULE_COLUMNS} FROM rewards`).all() as RewardRules[];
  return new Map(rows.map((r) => [r.id, r]));
}

/** Start of the current day / week (Monday) / month, local time; null for "ever". */
export function periodStart(period: LimitPeriod, now = new Date()): Date | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'day') return today;
  if (period === 'week') return new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

function periodEnd(period: LimitPeriod, now = new Date()): Date | null {
  const start = periodStart(period, now);
  if (!start) return null;
  if (period === 'day') return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  if (period === 'week') return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return new Date(start.getFullYear(), start.getMonth() + 1, 1);
}

/** Requested and approved redemptions count toward a limit; cancelled and rejected ones don't. */
function usedCount(rule: RewardRules, userId: number, now: Date): number {
  const where = ['rewardId = ?', "status IN ('requested', 'approved')"];
  const params: (string | number)[] = [rule.id];
  // A shared reward's redemptions belong to the whole family
  if (rule.limitScope === 'person' && !rule.isShared) { where.push('userId = ?'); params.push(userId); }
  const start = periodStart(rule.limitPeriod, now);
  if (start) { where.push('datetime(redeemedAt) >= datetime(?)'); params.push(start.toISOString()); }
  const row = db.prepare(`SELECT COUNT(*) AS n FROM reward_redemptions WHERE ${where.join(' AND ')}`).get(...params) as { n: number };
  return row.n;
}

export function availabilityFor(rule: RewardRules, userId: number, now = new Date()): Availability | null {
  if (!rule.limitCount || rule.limitCount < 1) return null;
  const used = usedCount(rule, userId, now);
  return {
    limit: rule.limitCount,
    period: rule.limitPeriod,
    scope: rule.isShared ? 'everyone' : rule.limitScope,
    used,
    remaining: Math.max(0, rule.limitCount - used),
    resetsAt: periodEnd(rule.limitPeriod, now)?.toISOString() ?? null,
  };
}

/** Inside the reward's optional date window (YYYY-MM-DD, both ends inclusive). */
export function inWindow(rule: Pick<RewardRules, 'availableFrom' | 'availableUntil'>, today = localDateStr()): boolean {
  if (rule.availableFrom && today < rule.availableFrom) return false;
  if (rule.availableUntil && today > rule.availableUntil) return false;
  return true;
}

/** ISO 8601 week-numbering year and week of a local date. */
export function isoWeek(now = new Date()): { year: number; week: number } {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7) };
}

/** 32-bit FNV-1a with a final mix, so similar inputs spread out. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function getRotatingPerWeek(): number {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'rotatingRewardsPerWeek'").get() as { value?: string } | undefined;
  const n = row?.value !== undefined ? parseInt(row.value, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_ROTATING_PER_WEEK;
}

/**
 * The rotating rewards on offer this calendar week: each active, in-window rotating reward gets a
 * score seeded by the ISO year+week and its id, and the lowest scores win. The same week always
 * gives the same picks (no cron needed), and adding a reward only reshuffles a week if it wins.
 */
export function rotatingThisWeek(now = new Date()): Set<number> {
  const { year, week } = isoWeek(now);
  const today = localDateStr(now);
  const pool = (db.prepare(`SELECT ${RULE_COLUMNS} FROM rewards WHERE isActive = 1 AND isRotating = 1`).all() as RewardRules[])
    .filter((r) => inWindow(r, today))
    .map((r) => ({ id: r.id, score: hash32(`${year}-W${week}:${r.id}`) }))
    .sort((a, b) => a.score - b.score || a.id - b.id);
  return new Set(pool.slice(0, getRotatingPerWeek()).map((r) => r.id));
}

function visibilityMap(): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  for (const row of db.prepare('SELECT rewardId, userId FROM reward_visibility').all() as { rewardId: number; userId: number }[]) {
    if (!map.has(row.rewardId)) map.set(row.rewardId, new Set());
    map.get(row.rewardId)!.add(row.userId);
  }
  return map;
}

/** No visibility rows means everyone can see the reward. */
export function canSee(rewardId: number, userId: number): boolean {
  const rows = db.prepare('SELECT userId FROM reward_visibility WHERE rewardId = ?').all(rewardId) as { userId: number }[];
  return rows.length === 0 || rows.some((r) => r.userId === userId);
}

/** What this person pays: their own price when one is set, otherwise the reward's price. Shared rewards have one price. */
export function priceFor(rule: Pick<RewardRules, 'id' | 'costCoins' | 'isShared'>, userId: number): number {
  if (rule.isShared) return rule.costCoins;
  const row = db.prepare('SELECT costCoins FROM reward_prices WHERE rewardId = ? AND userId = ?').get(rule.id, userId) as { costCoins: number } | undefined;
  return row?.costCoins ?? rule.costCoins;
}

/** Why this person can't redeem (or chip in to) this reward right now, or null when they can. */
export function unavailableReason(rule: RewardRules, userId: number, now = new Date()): { status: number; error: string } | null {
  if (!rule.isActive || !canSee(rule.id, userId) || !inWindow(rule, localDateStr(now))) return { status: 404, error: 'Reward not available' };
  if (rule.isRotating && !rotatingThisWeek(now).has(rule.id)) return { status: 404, error: 'Reward not available' };
  const availability = availabilityFor(rule, userId, now);
  if (availability && availability.remaining <= 0) return { status: 409, error: 'limit_reached' };
  return null;
}

/** The open pot of a shared reward: coins chipped in that haven't become a request yet. */
export function potFor(rewardId: number, target: number) {
  const contributors = db.prepare(`
    SELECT c.userId, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl, SUM(c.amount) AS amount
    FROM reward_contributions c
    JOIN users u ON u.id = c.userId
    WHERE c.rewardId = ? AND c.redemptionId IS NULL
    GROUP BY c.userId
    ORDER BY amount DESC, MIN(c.id) ASC
  `).all(rewardId) as Array<{ userId: number; displayName: string; amount: number }>;
  const saved = contributors.reduce((s, c) => s + c.amount, 0);
  const awaitingApproval = !!db.prepare(`
    SELECT 1 FROM reward_redemptions rr
    WHERE rr.rewardId = ? AND rr.status = 'requested' AND EXISTS (SELECT 1 FROM reward_contributions c WHERE c.redemptionId = rr.id)
  `).get(rewardId);
  return { saved, target, remaining: Math.max(0, target - saved), contributors, awaitingApproval };
}

/**
 * When a shared reward's pot holds its price, turn it into a redemption request (for the last
 * person who chipped in) for a parent to approve. Call inside a transaction. Returns the new
 * redemption id, or null when the pot isn't full.
 */
export function completePotIfFull(rewardId: number): number | null {
  const reward = db.prepare('SELECT costCoins, isShared FROM rewards WHERE id = ?').get(rewardId) as { costCoins: number; isShared: number } | undefined;
  if (!reward?.isShared) return null;
  const open = db.prepare('SELECT userId, amount FROM reward_contributions WHERE rewardId = ? AND redemptionId IS NULL ORDER BY id ASC').all(rewardId) as { userId: number; amount: number }[];
  const saved = open.reduce((s, c) => s + c.amount, 0);
  if (open.length === 0 || saved < reward.costCoins) return null;
  const redemptionId = Number(db.prepare(
    "INSERT INTO reward_redemptions (rewardId, userId, costCoins, status) VALUES (?, ?, ?, 'requested')"
  ).run(rewardId, open[open.length - 1].userId, saved).lastInsertRowid);
  db.prepare('UPDATE reward_contributions SET redemptionId = ? WHERE rewardId = ? AND redemptionId IS NULL').run(redemptionId, rewardId);
  return redemptionId;
}

export function isSharedRedemption(redemptionId: number): boolean {
  return !!db.prepare('SELECT 1 FROM reward_contributions WHERE redemptionId = ? LIMIT 1').get(redemptionId);
}

/** Give every contributor to a shared redemption back exactly what they put in. Returns false if it wasn't shared. */
export function refundContributions(redemptionId: number): boolean {
  const rows = db.prepare('SELECT userId, SUM(amount) AS amount FROM reward_contributions WHERE redemptionId = ? GROUP BY userId').all(redemptionId) as { userId: number; amount: number }[];
  for (const r of rows) db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(r.amount, r.userId);
  return rows.length > 0;
}

/** Refund and clear a shared reward's open pot (the reward is deleted or no longer shared). */
export function refundOpenPot(rewardId: number) {
  const rows = db.prepare('SELECT userId, SUM(amount) AS amount FROM reward_contributions WHERE rewardId = ? AND redemptionId IS NULL GROUP BY userId').all(rewardId) as { userId: number; amount: number }[];
  for (const r of rows) db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(r.amount, r.userId);
  db.prepare('DELETE FROM reward_contributions WHERE rewardId = ? AND redemptionId IS NULL').run(rewardId);
}

/**
 * The kids' catalog for one viewer: hides rewards they can't see, that are outside their date
 * window or not in this week's rotation, and one-time ("ever") rewards that are used up. Applies
 * the viewer's price and adds availability (limits) and the pot for shared rewards.
 */
export function catalogFor<T extends { id: number; costCoins: number }>(userId: number, rewards: T[], now = new Date()) {
  const rules = allRules();
  const visibility = visibilityMap();
  const prices = new Map((db.prepare('SELECT rewardId, costCoins FROM reward_prices WHERE userId = ?').all(userId) as { rewardId: number; costCoins: number }[])
    .map((p) => [p.rewardId, p.costCoins]));
  const rotating = rotatingThisWeek(now);
  const today = localDateStr(now);
  const out: Array<T & Record<string, unknown>> = [];
  for (const r of rewards) {
    const rule = rules.get(r.id);
    if (!rule) continue;
    const viewers = visibility.get(r.id);
    if (viewers && !viewers.has(userId)) continue;
    if (!inWindow(rule, today)) continue;
    if (rule.isRotating && !rotating.has(r.id)) continue;
    const availability = availabilityFor(rule, userId, now);
    if (availability && availability.remaining <= 0 && rule.limitPeriod === 'ever') continue;
    const costCoins = rule.isShared ? r.costCoins : (prices.get(r.id) ?? r.costCoins);
    out.push({
      ...r,
      costCoins,
      regularCostCoins: r.costCoins,
      isShared: !!rule.isShared,
      isRotating: !!rule.isRotating,
      availableUntil: rule.availableUntil,
      availability,
      pot: rule.isShared ? potFor(r.id, r.costCoins) : null,
    });
  }
  return out;
}

/** Rules for the admin catalog: visibility, prices, limit, window, rotation, shared pot. */
export function adminRulesFor(rewardId: number) {
  const rule = getRules(rewardId);
  if (!rule) return null;
  const visibleTo = (db.prepare('SELECT userId FROM reward_visibility WHERE rewardId = ? ORDER BY userId').all(rewardId) as { userId: number }[]).map((r) => r.userId);
  const prices: Record<number, number> = {};
  for (const p of db.prepare('SELECT userId, costCoins FROM reward_prices WHERE rewardId = ?').all(rewardId) as { userId: number; costCoins: number }[]) {
    prices[p.userId] = p.costCoins;
  }
  return {
    visibleTo,
    prices,
    limitCount: rule.limitCount,
    limitPeriod: rule.limitPeriod,
    limitScope: rule.limitScope,
    availableFrom: rule.availableFrom,
    availableUntil: rule.availableUntil,
    isRotating: !!rule.isRotating,
    isShared: !!rule.isShared,
    pot: rule.isShared ? potFor(rewardId, rule.costCoins) : null,
  };
}
