import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { tr } from '../utils/i18n';
import { createTask } from './tasks';

/**
 * "+ To-do" on Home (parents): add a one-time chore without opening a room. It goes into the room
 * picked, or the family's "To-dos" room (made the first time, then reused even if renamed).
 */
const router = Router();
router.use(authMiddleware);

function todoRoomId(language: string): number {
  const saved = Number((db.prepare("SELECT value FROM app_settings WHERE key = 'todoRoomId'").get() as { value: string } | undefined)?.value);
  if (saved && db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(saved)) return saved;
  const id = Number(db.prepare("INSERT INTO rooms (name, roomType, color, accentColor) VALUES (?, 'other', '#E0F2FE', '#0284C7')")
    .run(tr(language, 'todos.roomName')).lastInsertRowid);
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('todoRoomId', ?)").run(String(id));
  return id;
}

router.post('/', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : '';
  if (!name) return res.status(400).json({ error: 'name is required' });
  const lang = (db.prepare('SELECT language FROM users WHERE id = ?').get(req.userId) as { language: string | null } | undefined)?.language ?? 'en';
  const roomId = req.body?.roomId ? Number(req.body.roomId) : todoRoomId(lang);
  const result = createTask(roomId, {
    name,
    notes: req.body?.notes,
    effort: 1,
    frequencyDays: 7,
    oneTime: true,
    doBy: req.body?.doBy ?? null,
    customCoins: req.body?.customCoins,
    assignedUserIds: Array.isArray(req.body?.assignedUserIds) ? req.body.assignedUserIds : [],
    reminderTime: req.body?.reminderTime ?? null,
  });
  if (result.status === 201) {
    // Exactly the people chosen: a to-do filed in someone's room doesn't also go to the room's owner
    const keep = (Array.isArray(req.body?.assignedUserIds) ? req.body.assignedUserIds : []).map(Number);
    if (keep.length) {
      db.prepare(`DELETE FROM task_assignees WHERE taskId = ? AND userId NOT IN (${keep.map(() => '?').join(',')})`).run(result.body.id, ...keep);
    }
  }
  res.status(result.status).json(result.body);
});

export default router;
