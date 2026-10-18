import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { isFeatureOn } from '../utils/features';
import { declineTeamup, joinTeamup, leaveTeamup, startTeamup } from '../utils/teamups';

// Team-ups: invite someone to do a chore together, join or decline one, or leave (Done goes through /tasks/:id/complete)
const router = Router();
router.use(authMiddleware);

const STATUS: Record<string, number> = { not_found: 404, not_teamable: 400, not_assigned: 403, invalid_partner: 400, already_teamed: 409, not_invited: 403, declined: 409, team_full: 409 };
const send = (res: Response, result: { error: string } | object) =>
  'error' in result ? res.status(STATUS[(result as { error: string }).error] ?? 400).json(result) : res.json(result);

router.use((_req, res, next) => (isFeatureOn('teamups') ? next() : res.status(403).json({ error: 'feature_off' })));
router.post('/', (req: AuthRequest, res: Response) =>
  send(res, startTeamup(Number(req.body?.taskId), req.userId!, req.body?.partnerId == null ? null : Number(req.body.partnerId))));
router.post('/:id/join', (req: AuthRequest, res: Response) => send(res, joinTeamup(Number(req.params.id), req.userId!)));
router.post('/:id/decline', (req: AuthRequest, res: Response) => send(res, declineTeamup(Number(req.params.id), req.userId!)));
router.post('/:id/leave', (req: AuthRequest, res: Response) => send(res, leaveTeamup(Number(req.params.id), req.userId!)));

export default router;
