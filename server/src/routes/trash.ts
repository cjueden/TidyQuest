import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { purgeOldTrash, restoreFromTrash, TrashError, TRASH_DAYS } from '../utils/trash';

// Deleted tasks and rewards (admins): list, restore, delete forever. Items expire after 30 days.
const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  purgeOldTrash();
  const rows = db.prepare(
    `SELECT t.id, t.kind, t.itemId, t.title, t.roomId, t.roomName, t.snapshot, t.deletedAt, u.displayName AS deletedByName,
            (SELECT 1 FROM rooms r WHERE r.id = t.roomId) AS roomExists
     FROM trash t LEFT JOIN users u ON u.id = t.deletedBy
     ORDER BY t.deletedAt DESC, t.id DESC`
  ).all() as any[];
  // Summaries only; the snapshots can be large
  const items = rows.map(({ snapshot, roomExists, ...row }) => {
    const s = JSON.parse(snapshot);
    return {
      ...row,
      // SQLite's datetime('now') is UTC without a zone; send ISO so clients show local time
      deletedAt: `${String(row.deletedAt).replace(' ', 'T')}Z`,
      roomExists: row.kind === 'task' ? !!roomExists : undefined,
      historyCount: row.kind === 'task' ? (s.completions?.length ?? 0) : (s.redemptions?.length ?? 0),
    };
  });
  res.json({ items, keepDays: TRASH_DAYS });
});

router.post('/:id/restore', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const roomId = req.body?.roomId != null ? Number(req.body.roomId) : undefined;
  try {
    res.json(restoreFromTrash(Number(req.params.id), { roomId }));
  } catch (e) {
    if (e instanceof TrashError) return res.status(e.status).json({ error: e.code, message: e.message, ...e.extra });
    throw e;
  }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const result = db.prepare('DELETE FROM trash WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

export default router;
