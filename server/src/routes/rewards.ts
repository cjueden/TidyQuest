import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { isNotificationTypeEnabled, sendNotification } from '../utils/notifications';
import { ensureAdmin } from '../utils/adminHelpers';
import {
  LIMIT_PERIODS, LIMIT_SCOPES, adminRulesFor, catalogFor, completePotIfFull, getRotatingPerWeek, getRules,
  isSharedRedemption, potFor, priceFor, refundContributions, refundOpenPot, rotatingThisWeek, unavailableReason,
} from '../utils/rewardRules';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  const rewards = db.prepare(
    'SELECT id, title, description, costCoins, isActive, isPreset, createdBy, createdAt FROM rewards WHERE isActive = 1 ORDER BY costCoins ASC, id ASC'
  ).all();
  const mine = db.prepare(
    `SELECT rr.id, rr.rewardId, rr.userId, rr.costCoins, rr.redeemedAt, rr.status, r.title,
            EXISTS (SELECT 1 FROM reward_contributions c WHERE c.redemptionId = rr.id) AS isShared
     FROM reward_redemptions rr
     JOIN rewards r ON rr.rewardId = r.id
     WHERE rr.userId = ?
     ORDER BY rr.redeemedAt DESC
     LIMIT 20`
  ).all(req.userId);
  // Only what this person may see right now, at their price, with limits and shared pots
  res.json({ rewards: catalogFor(req.userId!, rewards as Array<{ id: number; costCoins: number }>), mine });
});

router.get('/admin', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const rewards = db.prepare(
    'SELECT id, title, description, costCoins, isActive, isPreset, createdBy, createdAt FROM rewards ORDER BY isActive DESC, costCoins ASC, id ASC'
  ).all();
  const redemptions = db.prepare(
    `SELECT rr.id, rr.rewardId, rr.userId, rr.costCoins, rr.redeemedAt, rr.status, r.title, u.displayName
     FROM reward_redemptions rr
     JOIN rewards r ON rr.rewardId = r.id
     JOIN users u ON rr.userId = u.id
     ORDER BY rr.redeemedAt DESC
     LIMIT 50`
  ).all();
  res.json({
    rewards: (rewards as Array<{ id: number }>).map((r) => ({ ...r, ...adminRulesFor(r.id) })),
    redemptions,
    rotatingPerWeek: getRotatingPerWeek(),
    rotatingThisWeek: [...rotatingThisWeek()],
  });
});

// How many rotating rewards are on offer each week
router.put('/rotation-config', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const n = Number((req.body as { rotatingPerWeek?: unknown }).rotatingPerWeek);
  if (!Number.isInteger(n) || n < 0 || n > 50) return res.status(400).json({ error: 'rotatingPerWeek must be a whole number from 0 to 50' });
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updatedAt) VALUES ('rotatingRewardsPerWeek', ?, datetime('now'))").run(String(n));
  res.json({ rotatingPerWeek: n, rotatingThisWeek: [...rotatingThisWeek()] });
});

const isDay = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());

/**
 * Admin: a reward's rules. Every field is optional; only the ones sent change.
 * visibleTo: user ids (empty = everyone) · prices: { userId: coins | null } · limit: { count, period, scope } | null
 * availableFrom / availableUntil: 'YYYY-MM-DD' | null · isRotating · isShared
 */
router.put('/:id/rules', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const id = parseInt(req.params.id as string, 10);
  const rule = getRules(id);
  if (!rule) return res.status(404).json({ error: 'Reward not found' });
  const body = (req.body || {}) as {
    visibleTo?: unknown; prices?: unknown; limit?: unknown;
    availableFrom?: unknown; availableUntil?: unknown; isRotating?: unknown; isShared?: unknown;
  };
  const userIds = new Set((db.prepare('SELECT id FROM users').all() as { id: number }[]).map((u) => u.id));

  let visibleTo: number[] | undefined;
  if (body.visibleTo !== undefined) {
    if (!Array.isArray(body.visibleTo) || !body.visibleTo.every((u) => Number.isInteger(u) && userIds.has(u as number))) {
      return res.status(400).json({ error: 'visibleTo must be a list of family member ids' });
    }
    visibleTo = [...new Set(body.visibleTo as number[])];
  }

  let prices: Array<[number, number | null]> | undefined;
  if (body.prices !== undefined) {
    if (!body.prices || typeof body.prices !== 'object' || Array.isArray(body.prices)) return res.status(400).json({ error: 'prices must be an object of userId: coins' });
    prices = [];
    for (const [key, value] of Object.entries(body.prices as Record<string, unknown>)) {
      const userId = Number(key);
      if (!userIds.has(userId)) return res.status(400).json({ error: 'prices must be for family members' });
      if (value === null || value === '') { prices.push([userId, null]); continue; }
      const cost = Number(value);
      if (!Number.isInteger(cost) || cost <= 0) return res.status(400).json({ error: 'prices must be whole numbers above 0' });
      prices.push([userId, cost]);
    }
  }

  let limit: { count: number | null; period: string; scope: string } | undefined;
  if (body.limit !== undefined) {
    if (body.limit === null) {
      limit = { count: null, period: 'ever', scope: 'person' };
    } else {
      const l = body.limit as { count?: unknown; period?: unknown; scope?: unknown };
      const count = Number(l.count);
      if (!Number.isInteger(count) || count < 1 || count > 1000) return res.status(400).json({ error: 'limit.count must be a whole number from 1 to 1000' });
      if (!LIMIT_PERIODS.includes(l.period as never)) return res.status(400).json({ error: 'limit.period must be ever, day, week or month' });
      if (!LIMIT_SCOPES.includes(l.scope as never)) return res.status(400).json({ error: 'limit.scope must be person or everyone' });
      limit = { count, period: l.period as string, scope: l.scope as string };
    }
  }

  for (const key of ['availableFrom', 'availableUntil'] as const) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '' && !isDay(body[key])) {
      return res.status(400).json({ error: `${key} must be a date (YYYY-MM-DD)` });
    }
  }
  const pick = (v: unknown, current: string | null) => (v === undefined ? current : (v || null) as string | null);
  const availableFrom = pick(body.availableFrom, rule.availableFrom);
  const availableUntil = pick(body.availableUntil, rule.availableUntil);
  if (availableFrom && availableUntil && availableFrom > availableUntil) {
    return res.status(400).json({ error: 'availableFrom must be on or before availableUntil' });
  }
  for (const key of ['isRotating', 'isShared'] as const) {
    if (body[key] !== undefined && typeof body[key] !== 'boolean') return res.status(400).json({ error: `${key} must be a boolean` });
  }
  const isShared = body.isShared === undefined ? !!rule.isShared : body.isShared as boolean;
  const isRotating = body.isRotating === undefined ? !!rule.isRotating : body.isRotating as boolean;

  db.transaction(() => {
    if (visibleTo) {
      db.prepare('DELETE FROM reward_visibility WHERE rewardId = ?').run(id);
      for (const userId of visibleTo) db.prepare('INSERT INTO reward_visibility (rewardId, userId) VALUES (?, ?)').run(id, userId);
    }
    for (const [userId, cost] of prices || []) {
      if (cost === null) db.prepare('DELETE FROM reward_prices WHERE rewardId = ? AND userId = ?').run(id, userId);
      else db.prepare('INSERT OR REPLACE INTO reward_prices (rewardId, userId, costCoins) VALUES (?, ?, ?)').run(id, userId, cost);
    }
    if (limit) {
      db.prepare('UPDATE rewards SET limitCount = ?, limitPeriod = ?, limitScope = ? WHERE id = ?').run(limit.count, limit.period, limit.scope, id);
    }
    // No longer shared: everyone gets back what's in the open pot
    if (rule.isShared && !isShared) refundOpenPot(id);
    db.prepare('UPDATE rewards SET availableFrom = ?, availableUntil = ?, isRotating = ?, isShared = ? WHERE id = ?')
      .run(availableFrom, availableUntil, isRotating ? 1 : 0, isShared ? 1 : 0, id);
  })();
  res.json({ id, ...adminRulesFor(id) });
});

// Chip coins into a shared reward's pot; a full pot becomes a request for a parent to approve
router.post('/:id/contribute', (req: AuthRequest, res: Response) => {
  const gamifRow = db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  if (gamifRow && gamifRow.value === '0') return res.status(403).json({ error: 'Gamification is disabled' });

  const id = parseInt(req.params.id as string, 10);
  const rule = getRules(id);
  if (!rule || !rule.isActive) return res.status(404).json({ error: 'Reward not available' });
  if (!rule.isShared) return res.status(400).json({ error: 'not_shared' });
  const blocked = unavailableReason(rule, req.userId!);
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });

  const amount = Number((req.body as { amount?: unknown })?.amount);
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be a whole number above 0' });
  const pot = potFor(id, rule.costCoins);
  if (amount > pot.remaining) return res.status(400).json({ error: 'more_than_needed', remaining: pot.remaining });
  const me = db.prepare('SELECT id, coins, displayName FROM users WHERE id = ?').get(req.userId) as { id: number; coins: number; displayName: string } | undefined;
  if (!me) return res.status(404).json({ error: 'User not found' });
  if (me.coins < amount) return res.status(400).json({ error: 'Not enough coins' });

  const redemptionId = db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(amount, me.id);
    db.prepare('INSERT INTO reward_contributions (rewardId, userId, amount, createdAt) VALUES (?, ?, ?, ?)')
      .run(id, me.id, amount, new Date().toISOString());
    return completePotIfFull(id);
  })();

  if (redemptionId && isNotificationTypeEnabled('rewardRequest')) {
    void sendNotification(`🎁 Saved up: the family pot for "${rule.title}" is full (${rule.costCoins} coins). It's waiting for your approval.`);
  }
  const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(me.id) as { coins: number };
  const redemption = redemptionId
    ? db.prepare('SELECT id, rewardId, userId, costCoins, redeemedAt, status FROM reward_redemptions WHERE id = ?').get(redemptionId)
    : null;
  res.json({ coins: user.coins, pot: potFor(id, rule.costCoins), redemption });
});

router.put('/redemptions/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const id = parseInt(req.params.id as string, 10);
  const { status } = req.body as { status?: 'requested' | 'approved' | 'rejected' | 'cancelled' };
  if (!status || !['requested', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const row = db.prepare('SELECT id, userId, costCoins, status FROM reward_redemptions WHERE id = ?').get(id) as any;
  if (!row) return res.status(404).json({ error: 'Redemption not found' });
  db.transaction(() => {
    db.prepare('UPDATE reward_redemptions SET status = ? WHERE id = ?').run(status, id);
    // Refund coins exactly once when moving from requested -> rejected
    if (status === 'rejected' && row.status === 'requested') {
      // A shared pot goes back to everyone who chipped in
      if (!refundContributions(id)) db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(row.costCoins, row.userId);
    }
  })();
  const updated = db.prepare(
    `SELECT rr.id, rr.rewardId, rr.userId, rr.costCoins, rr.redeemedAt, rr.status, r.title, u.displayName
     FROM reward_redemptions rr
     JOIN rewards r ON rr.rewardId = r.id
     JOIN users u ON rr.userId = u.id
     WHERE rr.id = ?`
  ).get(id);
  res.json(updated);
});

router.post('/redemptions/:id/cancel', (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const row = db.prepare('SELECT id, userId, costCoins, status FROM reward_redemptions WHERE id = ?').get(id) as any;
  if (!row) return res.status(404).json({ error: 'Redemption not found' });
  if (row.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  if (row.status !== 'requested') return res.status(400).json({ error: 'Only requested rewards can be cancelled' });
  if (isSharedRedemption(id)) return res.status(400).json({ error: 'A shared reward can only be turned down by a parent' });

  db.transaction(() => {
    db.prepare("UPDATE reward_redemptions SET status = 'cancelled' WHERE id = ?").run(id);
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(row.costCoins, row.userId);
  })();

  const updated = db.prepare(
    `SELECT rr.id, rr.rewardId, rr.userId, rr.costCoins, rr.redeemedAt, rr.status, r.title
     FROM reward_redemptions rr
     JOIN rewards r ON rr.rewardId = r.id
     WHERE rr.id = ?`
  ).get(id);
  const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(req.userId) as any;
  res.json({ redemption: updated, coins: user?.coins ?? 0 });
});

router.post('/', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const { title, description, costCoins } = req.body as { title?: string; description?: string; costCoins?: number };
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return res.status(400).json({ error: 'title is required' });
  const cost = Math.round(Number(costCoins));
  if (!Number.isFinite(cost) || cost <= 0) return res.status(400).json({ error: 'costCoins must be > 0' });

  const result = db.prepare(
    'INSERT INTO rewards (title, description, costCoins, isActive, isPreset, createdBy) VALUES (?, ?, ?, 1, 0, ?)'
  ).run(cleanTitle, description?.trim() || null, cost, req.userId);
  const created = db.prepare(
    'SELECT id, title, description, costCoins, isActive, isPreset, createdBy, createdAt FROM rewards WHERE id = ?'
  ).get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const id = parseInt(req.params.id as string, 10);
  const reward = db.prepare('SELECT id FROM rewards WHERE id = ?').get(id) as any;
  if (!reward) return res.status(404).json({ error: 'Reward not found' });

  const { title, description, costCoins, isActive } = req.body as { title?: string; description?: string; costCoins?: number; isActive?: boolean };
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return res.status(400).json({ error: 'title is required' });
  const cost = Math.round(Number(costCoins));
  if (!Number.isFinite(cost) || cost <= 0) return res.status(400).json({ error: 'costCoins must be > 0' });

  db.prepare('UPDATE rewards SET title = ?, description = ?, costCoins = ?, isActive = ? WHERE id = ?')
    .run(cleanTitle, description?.trim() || null, cost, isActive === false ? 0 : 1, id);
  // A lower price can fill a shared reward's pot
  db.transaction(() => completePotIfFull(id))();

  const updated = db.prepare(
    'SELECT id, title, description, costCoins, isActive, isPreset, createdBy, createdAt FROM rewards WHERE id = ?'
  ).get(id);
  res.json(updated);
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const id = parseInt(req.params.id as string, 10);
  const reward = db.prepare('SELECT id FROM rewards WHERE id = ?').get(id) as any;
  if (!reward) return res.status(404).json({ error: 'Reward not found' });
  db.transaction(() => {
    refundOpenPot(id);
    db.prepare('DELETE FROM rewards WHERE id = ?').run(id);
  })();
  res.json({ success: true });
});

router.post('/:id/redeem', (req: AuthRequest, res: Response) => {
  const gamifRow = db.prepare("SELECT value FROM app_settings WHERE key = 'gamificationEnabled'").get() as { value: string } | undefined;
  if (gamifRow && gamifRow.value === '0') {
    return res.status(403).json({ error: 'Gamification is disabled' });
  }

  const id = parseInt(req.params.id as string, 10);
  const reward = db.prepare('SELECT id, title, costCoins, isActive FROM rewards WHERE id = ?').get(id) as any;
  if (!reward || !reward.isActive) return res.status(404).json({ error: 'Reward not available' });
  const rule = getRules(id)!;
  if (rule.isShared) return res.status(400).json({ error: 'shared_reward' });
  const blocked = unavailableReason(rule, req.userId!);
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });
  // What this person pays (their own price, when one is set)
  reward.costCoins = priceFor(rule, req.userId!);
  const me = db.prepare('SELECT id, coins, displayName FROM users WHERE id = ?').get(req.userId) as any;
  if (!me) return res.status(404).json({ error: 'User not found' });
  if (me.coins < reward.costCoins) return res.status(400).json({ error: 'Not enough coins' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(reward.costCoins, req.userId);
    const redemption = db.prepare(
      "INSERT INTO reward_redemptions (rewardId, userId, costCoins, status) VALUES (?, ?, ?, 'requested')"
    ).run(id, req.userId, reward.costCoins);
    return redemption.lastInsertRowid;
  });
  const redemptionId = tx();
  const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(req.userId) as any;
  const redemption = db.prepare(
    'SELECT id, rewardId, userId, costCoins, redeemedAt, status FROM reward_redemptions WHERE id = ?'
  ).get(redemptionId);

  if (isNotificationTypeEnabled('rewardRequest')) {
    void sendNotification(
      `🎁 Reward request: ${me.displayName} requested "${reward.title}" (${reward.costCoins} coins).`
    );
  }
  res.json({ redemption, coins: user.coins });
});

export default router;
