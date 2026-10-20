import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { buyShield, giveShield } from '../utils/streaks';

/** Streak shields (utils/streaks.ts): buy one with your own coins, or a parent gives one. */
const router = Router();
router.use(authMiddleware);

const send = (res: Response, result: ReturnType<typeof buyShield>) =>
  'error' in result ? res.status(result.error === 'not_found' ? 404 : 400).json(result) : res.json(result);

router.post('/buy', (req: AuthRequest, res: Response) => send(res, buyShield(req.userId!)));

router.post('/give', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const userId = Number(req.body?.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'invalid_user' });
  send(res, giveShield(req.userId!, userId));
});

export default router;
