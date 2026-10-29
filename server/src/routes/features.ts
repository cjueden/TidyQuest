import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { FEATURES, HOLIDAYS, featureDefault, getFeatures, holidaysOff, rescueMultiplier } from '../utils/features';
import { mascotRoster, mascotSettings, saveMascot } from '../utils/mascot';
import { TEAM_BONUSES, teamBonus } from '../utils/teamups';
import { shieldPrice } from '../utils/streaks';

/** Settings → Features: switch optional extras on or off for the whole family. */
const router = Router();
router.use(authMiddleware);

const view = () => ({ features: getFeatures(), rescueMultiplier: rescueMultiplier(), holidaysOff: holidaysOff(), mascot: mascotSettings(), mascotRoster: mascotRoster(), teamBonus: teamBonus(), shieldPrice: shieldPrice() });

router.get('/', (_req: AuthRequest, res: Response) => res.json(view()));

router.put('/', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const incoming = req.body?.features;
  if (incoming && typeof incoming === 'object') {
    const next = { ...getFeatures() };
    for (const f of FEATURES) if (typeof incoming[f] === 'boolean') next[f] = incoming[f];
    // Only choices that differ from the default are stored, so new extras start on
    const changed = Object.fromEntries(FEATURES.filter((f) => next[f] !== featureDefault(f)).map((f) => [f, next[f]]));
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('features', ?)").run(JSON.stringify(changed));
  }
  if (req.body?.rescueMultiplier !== undefined) {
    const m = Number(req.body.rescueMultiplier);
    if (!(m >= 1.5 && m <= 5)) return res.status(400).json({ error: 'invalid_multiplier' });
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('rescueMultiplier', ?)").run(String(m));
  }
  // Team-ups: the bonus on top of the split, in percent
  if (req.body?.teamBonus !== undefined) {
    const b = Number(req.body.teamBonus);
    if (!TEAM_BONUSES.includes(b)) return res.status(400).json({ error: 'invalid_team_bonus' });
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('teamBonus', ?)").run(String(b));
  }
  // Streak shields: what one costs in coins
  if (req.body?.shieldPrice !== undefined) {
    const p = Number(req.body.shieldPrice);
    if (!(Number.isInteger(p) && p >= 1 && p <= 500)) return res.status(400).json({ error: 'invalid_shield_price' });
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('shieldPrice', ?)").run(String(p));
  }
  // The house mascot: which creature and its name
  if (req.body?.mascot !== undefined) {
    const error = saveMascot(req.body.mascot ?? {});
    if (error) return res.status(400).json({ error });
  }
  // Seasonal styling: holidays switched off one by one
  const hOff = req.body?.holidaysOff;
  if (hOff !== undefined) {
    if (!Array.isArray(hOff) || hOff.some((h) => !(HOLIDAYS as readonly string[]).includes(h))) return res.status(400).json({ error: 'invalid_holiday' });
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('holidaysOff', ?)").run(JSON.stringify([...new Set(hOff)]));
  }
  res.json(view());
});

export default router;
