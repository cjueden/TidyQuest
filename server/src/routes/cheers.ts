import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { isFeatureOn } from '../utils/features';
import { toggleCheer } from '../utils/cheers';

// Cheers on someone's finished chore (Activity and Home's "Completed today")
const router = Router();
router.use(authMiddleware);

const STATUS: Record<string, number> = { invalid_emoji: 400, not_found: 404, own_chore: 400 };

router.post('/', (req: AuthRequest, res: Response) => {
  if (!isFeatureOn('cheers')) return res.status(403).json({ error: 'feature_off' });
  const result = toggleCheer(Number(req.body?.completionId), req.userId!, String(req.body?.emoji ?? ''));
  if ('error' in result) return res.status(STATUS[result.error]).json(result);
  res.json(result);
});

export default router;
