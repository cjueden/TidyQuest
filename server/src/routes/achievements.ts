import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { achievementsFor } from '../utils/achievementStats';

const router = Router();
router.use(authMiddleware);

function getUserStats(userId: number) {
  const user = db.prepare('SELECT id, displayName, role, avatarColor, avatarType, avatarPreset, avatarPhotoUrl FROM users WHERE id = ?').get(userId) as any;
  if (!user) return null;
  const result = achievementsFor(userId);
  if (!result) return null;
  return { ...user, achievements: result.achievements };
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

export default router;
