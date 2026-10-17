import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { buyAccessory, takeOffAccessory } from '../utils/mascot';

// The house mascot's accessory shop: buy one (it goes on right away) or take one off
const router = Router();
router.use(authMiddleware);

const STATUS: Record<string, number> = { feature_off: 403, unknown_item: 400, not_found: 404, not_enough_coins: 400, not_yours: 403 };
const send = (res: Response, r: { error: string } | object) => ('error' in r ? res.status(STATUS[(r as { error: string }).error] ?? 400).json(r) : res.json(r));

router.post('/buy', (req: AuthRequest, res: Response) => send(res, buyAccessory(req.userId!, String(req.body?.itemId ?? ''))));
router.post('/take-off', (req: AuthRequest, res: Response) => send(res, takeOffAccessory(req.userId!, String(req.body?.slot ?? ''))));

export default router;
