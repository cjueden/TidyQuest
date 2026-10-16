import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { achievementsFor, builtinBadgeBonus } from '../utils/achievementStats';
import { customBadgeKey, listCustomBadges, readCustomBadgeInput, saveCustomBadge } from '../utils/badges';

const router = Router();
router.use(authMiddleware);

function getUserStats(userId: number) {
  const user = db.prepare('SELECT id, displayName, role, avatarColor, avatarType, avatarPreset, avatarPhotoUrl FROM users WHERE id = ?').get(userId) as any;
  if (!user) return null;
  const result = achievementsFor(userId);
  if (!result) return null;
  return { ...user, achievements: result.achievements, level: result.level, nextBadge: result.nextBadge };
}

router.get('/', (req: AuthRequest, res: Response) => {
  const me = getUserStats(req.userId!);
  if (!me) return res.status(404).json({ error: 'User not found' });

  const family = me.role === 'admin'
    ? (db.prepare("SELECT id FROM users WHERE role IN ('child', 'member') OR (role = 'admin' AND isParticipant = 1) ORDER BY displayName").all() as Array<{ id: number }>)
      .map((u) => getUserStats(u.id))
      .filter(Boolean)
    : [];

  res.json({ me, family });
});

// ---------- Parent-made badges and the built-in badge bonus (Settings → Badges) ----------

router.get('/custom', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const earnedCount = db.prepare('SELECT COUNT(*) AS n FROM user_achievement_notifications WHERE achievementId = ?');
  res.json({
    badges: listCustomBadges().map((b) => ({ ...b, earnedBy: (earnedCount.get(customBadgeKey(b.id)) as { n: number }).n })),
    builtinBonusCoins: builtinBadgeBonus(),
  });
});

router.post('/custom', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const input = readCustomBadgeInput(req.body);
  if ('error' in input) return res.status(400).json({ error: input.error });
  const id = saveCustomBadge(input.values, undefined, req.userId);
  res.status(201).json(listCustomBadges().find((b) => b.id === id));
});

router.put('/custom/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM custom_badges WHERE id = ?').get(id)) return res.status(404).json({ error: 'not_found' });
  const input = readCustomBadgeInput(req.body);
  if ('error' in input) return res.status(400).json({ error: input.error });
  saveCustomBadge(input.values, id);
  res.json(listCustomBadges().find((b) => b.id === id));
});

// Deleting a badge also removes it from everyone who earned it (coins already paid stay)
router.delete('/custom/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const id = Number(req.params.id);
  const removed = db.transaction(() => {
    db.prepare('DELETE FROM user_achievement_notifications WHERE achievementId = ?').run(customBadgeKey(id));
    return db.prepare('DELETE FROM custom_badges WHERE id = ?').run(id).changes;
  })();
  if (!removed) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

router.put('/config', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const bonus = Math.round(Number(req.body?.builtinBonusCoins));
  if (!(bonus >= 0 && bonus <= 10000)) return res.status(400).json({ error: 'invalid_bonus' });
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('badgeBonusCoins', ?)").run(String(bonus));
  res.json({ builtinBonusCoins: bonus });
});

export default router;
