import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { canUse, unlocksFor } from '../utils/unlocks';

// Unlockables: what you've unlocked by levelling up, and what you've picked (frame, celebration, title)
const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => res.json(unlocksFor(req.userId!)));

router.put('/', (req: AuthRequest, res: Response) => {
  const fields = [['frame', 'avatarFrame'], ['celebration', 'celebration'], ['title', 'title']] as const;
  for (const [key, column] of fields) {
    const value = req.body?.[key];
    if (value === undefined) continue;
    const id = value === null || value === '' ? null : String(value);
    if (!canUse(req.userId!, key, id)) return res.status(400).json({ error: 'locked', field: key });
    db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(id, req.userId);
  }
  res.json(unlocksFor(req.userId!));
});

export default router;
