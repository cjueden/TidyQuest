import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';

const router = Router();
router.use(authMiddleware);

// List all zones with room count
router.get('/', (_req: AuthRequest, res: Response) => {
  const zones = db.prepare('SELECT * FROM zones ORDER BY sortOrder, id').all() as any[];
  const roomCounts = db.prepare(
    'SELECT zoneId, COUNT(*) as count FROM rooms WHERE zoneId IS NOT NULL AND deletedAt IS NULL GROUP BY zoneId'
  ).all() as any[];
  const countMap = new Map(roomCounts.map((r: any) => [r.zoneId, r.count]));
  res.json(zones.map(z => ({ ...z, roomCount: countMap.get(z.id) || 0 })));
});

// Create zone
router.post('/', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const result = db.prepare('INSERT INTO zones (name) VALUES (?)').run(name.trim());
  const zone = db.prepare('SELECT * FROM zones WHERE id = ?').get(result.lastInsertRowid) as any;
  res.status(201).json(zone);
});

// Update zone
router.put('/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const zone = db.prepare('SELECT * FROM zones WHERE id = ?').get(req.params.id) as any;
  if (!zone) return res.status(404).json({ error: 'Zone not found' });
  const { name, sortOrder } = req.body;
  db.prepare('UPDATE zones SET name = COALESCE(?, name), sortOrder = COALESCE(?, sortOrder) WHERE id = ?')
    .run(name ?? null, sortOrder ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM zones WHERE id = ?').get(req.params.id));
});

// Delete zone (rooms become unzoned)
router.delete('/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const zone = db.prepare('SELECT * FROM zones WHERE id = ?').get(req.params.id) as any;
  if (!zone) return res.status(404).json({ error: 'Zone not found' });
  db.prepare('UPDATE rooms SET zoneId = NULL WHERE zoneId = ?').run(req.params.id);
  db.prepare('DELETE FROM zones WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
