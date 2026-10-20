import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import db from '../database';
import { chooseRescue, rerollRescue, skipRescue, todaysMission } from '../utils/rescue';

/** Parents: change today's Rescue Mission (another one, a chosen chore, or none today). */
const router = Router();
router.use(authMiddleware);

router.get('/', (_req: AuthRequest, res: Response) => res.json(todaysMission()));

// Once someone has rescued today's chore it stays as it is (their bonus is paid)
const rescuedAlready = () => !!todaysMission()?.completedBy;

router.post('/reroll', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  if (rescuedAlready()) return res.status(409).json({ error: 'already_rescued' });
  res.json(rerollRescue());
});

router.put('/', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  if (rescuedAlready()) return res.status(409).json({ error: 'already_rescued' });
  const taskId = Number(req.body?.taskId);
  if (!db.prepare('SELECT 1 FROM tasks WHERE id = ? AND archivedAt IS NULL AND deletedAt IS NULL AND pausedAt IS NULL AND onDemand = 0').get(taskId)) return res.status(400).json({ error: 'invalid_task' });
  res.json(chooseRescue(taskId));
});

router.delete('/', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  if (rescuedAlready()) return res.status(409).json({ error: 'already_rescued' });
  skipRescue();
  res.json({ success: true });
});

export default router;
