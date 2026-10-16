import db from '../database';
import { familyGoal } from './board';

/**
 * The house mascot (round 3): one shared creature on Home. It grows with the family's coins, its mood
 * follows house health (it never dies or punishes; it asks for help with the messiest room), and it
 * reacts to a Rescue Mission, birthdays and a won family goal. The drawings live in the client.
 */
export const CREATURES = ['dog', 'cat', 'dragon', 'robot', 'fox', 'bunny', 'panda', 'axolotl'] as const;
const DEFAULT = { creature: 'dog', name: 'Dusty' };
/** Family coins (all time) at which it grows: egg → baby → kid → grown → legendary */
export const STAGES = [
  { stage: 'egg', from: 0 },
  { stage: 'baby', from: 500 },
  { stage: 'kid', from: 2000 },
  { stage: 'grown', from: 5000 },
  { stage: 'legendary', from: 10000 },
] as const;

export function mascotSettings(): { creature: string; name: string } {
  try {
    const raw = (db.prepare("SELECT value FROM app_settings WHERE key = 'mascot'").get() as { value: string } | undefined)?.value;
    const v = raw ? JSON.parse(raw) : {};
    return {
      creature: (CREATURES as readonly string[]).includes(v.creature) ? v.creature : DEFAULT.creature,
      name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 20) : DEFAULT.name,
    };
  } catch { return DEFAULT; }
}

export function saveMascot(input: { creature?: unknown; name?: unknown }): string | null {
  const next = mascotSettings();
  if (input.creature !== undefined) {
    if (!(CREATURES as readonly string[]).includes(String(input.creature))) return 'invalid_creature';
    next.creature = String(input.creature);
  }
  if (input.name !== undefined) {
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 20) return 'invalid_name';
    next.name = name;
  }
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mascot', ?)").run(JSON.stringify(next));
  return null;
}

export function moodFor(houseHealth: number): 'happy' | 'fine' | 'messy' | 'sad' {
  return houseHealth >= 80 ? 'happy' : houseHealth >= 50 ? 'fine' : houseHealth >= 25 ? 'messy' : 'sad';
}

/** Everything Home needs to draw the mascot */
export function mascotFor(opts: { houseHealth: number; rooms: Array<{ id: number; name: string; health: number }>; rescueDone: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const familyCoins = (db.prepare("SELECT COALESCE(SUM(coinsEarned), 0) AS n FROM task_completions WHERE status = 'approved'").get() as { n: number }).n;
  const idx = STAGES.reduce((i, s, n) => (familyCoins >= s.from ? n : i), 0);
  const mood = moodFor(opts.houseHealth);
  const messiest = [...opts.rooms].sort((a, b) => a.health - b.health)[0];
  // Birthdays are stored 'MM-DD'
  const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const birthday = (db.prepare('SELECT displayName FROM users WHERE birthday = ?').get(today) as { displayName: string } | undefined)?.displayName ?? null;
  const goalWon = !!familyGoal(now)?.reached;
  return {
    ...mascotSettings(),
    stage: STAGES[idx].stage,
    familyCoins,
    nextStage: STAGES[idx + 1] ? { stage: STAGES[idx + 1].stage, at: STAGES[idx + 1].from } : null,
    mood,
    houseHealth: opts.houseHealth,
    // Only asks for help when things are getting messy
    messiestRoom: mood === 'messy' || mood === 'sad' ? (messiest ? { id: messiest.id, name: messiest.name } : null) : null,
    event: birthday ? 'birthday' : goalWon ? 'teamGoal' : opts.rescueDone ? 'rescue' : null,
    birthdayName: birthday,
  };
}
