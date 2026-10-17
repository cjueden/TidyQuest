import db from '../database';
import { notifyPeople } from './notify';
import { tr } from './i18n';

/** The cheers anyone can give on someone else's finished chore */
export const CHEER_EMOJI = ['👏', '🎉', '💪', '⭐'] as const;

export interface CheerSummary {
  /** Each emoji given, with who gave it */
  counts: Array<{ emoji: string; count: number; names: string[] }>;
  /** The viewer's own cheer, if any */
  mine: string | null;
}

/** Cheers on these completions, for one viewer. */
export function cheersFor(completionIds: number[], viewerId: number): Map<number, CheerSummary> {
  const out = new Map<number, CheerSummary>();
  if (completionIds.length === 0) return out;
  const rows = db.prepare(`
    SELECT ch.completionId, ch.emoji, ch.fromUserId, u.displayName
    FROM cheers ch JOIN users u ON u.id = ch.fromUserId
    WHERE ch.completionId IN (${completionIds.map(() => '?').join(',')})
    ORDER BY ch.id
  `).all(...completionIds) as Array<{ completionId: number; emoji: string; fromUserId: number; displayName: string }>;
  for (const r of rows) {
    const s = out.get(r.completionId) ?? { counts: [], mine: null };
    const c = s.counts.find((x) => x.emoji === r.emoji);
    if (c) { c.count++; c.names.push(r.displayName); } else s.counts.push({ emoji: r.emoji, count: 1, names: [r.displayName] });
    if (r.fromUserId === viewerId) s.mine = r.emoji;
    out.set(r.completionId, s);
  }
  // Always 👏 🎉 💪 ⭐ order
  for (const s of out.values()) s.counts.sort((a, b) => CHEER_EMOJI.indexOf(a.emoji as never) - CHEER_EMOJI.indexOf(b.emoji as never));
  return out;
}

/**
 * Give, change or take back a cheer (the same emoji again takes it back). Returns an error code or the
 * completion's cheers. The person who did the chore hears about a new cheer once (privately).
 */
export function toggleCheer(completionId: number, fromUserId: number, emoji: string): { error: string } | { cheers: CheerSummary } {
  if (!(CHEER_EMOJI as readonly string[]).includes(emoji)) return { error: 'invalid_emoji' };
  const completion = db.prepare(`
    SELECT c.id, c.userId, c.status, t.name AS taskName FROM task_completions c JOIN tasks t ON t.id = c.taskId WHERE c.id = ?
  `).get(completionId) as { id: number; userId: number; status: string; taskName: string } | undefined;
  if (!completion || completion.status !== 'approved') return { error: 'not_found' };
  if (completion.userId === fromUserId) return { error: 'own_chore' };

  const existing = db.prepare('SELECT emoji FROM cheers WHERE completionId = ? AND fromUserId = ?').get(completionId, fromUserId) as { emoji: string } | undefined;
  if (existing?.emoji === emoji) {
    db.prepare('DELETE FROM cheers WHERE completionId = ? AND fromUserId = ?').run(completionId, fromUserId);
  } else if (existing) {
    db.prepare('UPDATE cheers SET emoji = ? WHERE completionId = ? AND fromUserId = ?').run(emoji, completionId, fromUserId);
  } else {
    db.prepare('INSERT INTO cheers (completionId, fromUserId, emoji) VALUES (?, ?, ?)').run(completionId, fromUserId, emoji);
    const from = (db.prepare('SELECT displayName FROM users WHERE id = ?').get(fromUserId) as { displayName: string }).displayName;
    void notifyPeople([completion.userId], 'cheer', (lang) => tr(lang, 'notify.cheer', { name: from, task: completion.taskName, emoji }),
      { dedupeKey: `cheer:${completionId}:${fromUserId}` });
  }
  return { cheers: cheersFor([completionId], fromUserId).get(completionId) ?? { counts: [], mine: null } };
}
