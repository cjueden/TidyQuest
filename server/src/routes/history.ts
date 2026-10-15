import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  const offset = parseInt(req.query.offset as string) || 0;

  // Optional filters: userId, roomId, from/to (ISO timestamps, to is exclusive), q (task name)
  const filterUserId = parseInt(req.query.userId as string) || null;
  const filterRoomId = parseInt(req.query.roomId as string) || null;
  const isIso = (v: unknown) => typeof v === 'string' && !Number.isNaN(new Date(v).getTime());
  const from = isIso(req.query.from) ? new Date(req.query.from as string).toISOString() : null;
  const to = isIso(req.query.to) ? new Date(req.query.to as string).toISOString() : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  // A bounded date range (the calendar asks for a whole month) may fetch more rows at once
  const limit = Math.min(parseInt(req.query.limit as string) || 20, from && to ? 2000 : 100);

  const where: string[] = ["tc.status = 'approved'"];
  const params: (string | number)[] = [];
  if (filterRoomId) { where.push('t.roomId = ?'); params.push(filterRoomId); }
  if (from) { where.push('tc.completedAt >= ?'); params.push(from); }
  if (to) { where.push('tc.completedAt < ?'); params.push(to); }
  if (q) { where.push("t.name LIKE ? ESCAPE '\\'"); params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); }

  const rawHistory = db.prepare(`
    SELECT tc.id, tc.completedAt, tc.coinsEarned, tc.taskId,
           t.name as taskName, t.translationKey, t.roomId, t.assignmentMode,
           r.name as roomName, r.roomType,
           u.id as userId, u.displayName, u.avatarColor, u.avatarType, u.avatarPreset, u.avatarPhotoUrl
    FROM task_completions tc
    JOIN tasks t ON tc.taskId = t.id
    JOIN rooms r ON t.roomId = r.id
    JOIN users u ON tc.userId = u.id
    WHERE ${where.join(' AND ')}
    ORDER BY tc.completedAt DESC
  `).all(...params) as any[];

  // Group shared-mode completions by (taskId, date) into a single entry with all participants
  const grouped: any[] = [];
  const seenSharedKeys = new Set<string>();

  for (const row of rawHistory) {
    if (row.assignmentMode === 'shared') {
      const key = `${row.taskId}:${row.completedAt.slice(0, 10)}`;
      if (seenSharedKeys.has(key)) continue;
      seenSharedKeys.add(key);

      const partners = rawHistory.filter((r: any) =>
        r.taskId === row.taskId &&
        r.completedAt.slice(0, 10) === row.completedAt.slice(0, 10) &&
        r.assignmentMode === 'shared'
      );

      grouped.push({
        ...row,
        coinsEarned: partners.reduce((s: number, p: any) => s + p.coinsEarned, 0),
        participants: partners.map((p: any) => ({
          id: p.userId, displayName: p.displayName, avatarColor: p.avatarColor,
          avatarType: p.avatarType, avatarPreset: p.avatarPreset, avatarPhotoUrl: p.avatarPhotoUrl,
          coinsEarned: p.coinsEarned,
        })),
      });
    } else {
      grouped.push(row);
    }
  }

  // Person filter runs after grouping so a shared completion still shows all its participants
  const filtered = filterUserId
    ? grouped.filter((h) => h.userId === filterUserId || h.participants?.some((p: any) => p.id === filterUserId))
    : grouped;

  const total = filtered.length;
  const history = filtered.slice(offset, offset + limit);

  // The viewer's own completions still waiting for a parent, shown above the list
  const pending = offset === 0
    ? db.prepare(`
      SELECT tc.id, tc.completedAt, tc.coinsEarned, tc.taskId, tc.note, tc.photoUrl,
             t.name AS taskName, t.translationKey, t.roomId, r.name AS roomName, r.roomType
      FROM task_completions tc
      JOIN tasks t ON tc.taskId = t.id
      JOIN rooms r ON t.roomId = r.id
      WHERE tc.status = 'pending' AND tc.userId = ?
      ORDER BY tc.completedAt DESC
      LIMIT 50`).all(req.userId)
    : [];

  res.json({ history, total, limit, offset, pending });
});

export default router;
