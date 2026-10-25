import db from '../database';
import { dateStr } from './clock';
import { familyGoal } from './board';
import { isFeatureOn } from './features';

/**
 * The house mascot (round 3): one shared creature on Home. It grows with the family's coins, its mood
 * follows house health (it never dies or punishes; it asks for help with the messiest room), and it
 * reacts to a Rescue Mission, birthdays and a won family goal. The drawings live in the client.
 */
export const CREATURES = ['dog', 'cat', 'dragon', 'robot', 'fox', 'bunny', 'panda', 'axolotl'] as const;
const DEFAULT = { creature: 'dog', name: 'Dusty', bedtimeFrom: '21:00', bedtimeTo: '07:00' };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Family coins (all time) at which it grows: egg → baby → kid → grown → legendary */
export const STAGES = [
  { stage: 'egg', from: 0 },
  { stage: 'baby', from: 500 },
  { stage: 'kid', from: 2000 },
  { stage: 'grown', from: 5000 },
  { stage: 'legendary', from: 10000 },
] as const;

export function mascotSettings(): { creature: string; name: string; bedtimeFrom: string; bedtimeTo: string } {
  try {
    const raw = (db.prepare("SELECT value FROM app_settings WHERE key = 'mascot'").get() as { value: string } | undefined)?.value;
    const v = raw ? JSON.parse(raw) : {};
    return {
      creature: (CREATURES as readonly string[]).includes(v.creature) ? v.creature : DEFAULT.creature,
      name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 20) : DEFAULT.name,
      // Family bedtime ('HH:MM', by each device's clock): it sleeps from bedtimeFrom to bedtimeTo
      bedtimeFrom: HHMM.test(v.bedtimeFrom) ? v.bedtimeFrom : DEFAULT.bedtimeFrom,
      bedtimeTo: HHMM.test(v.bedtimeTo) ? v.bedtimeTo : DEFAULT.bedtimeTo,
    };
  } catch { return DEFAULT; }
}

export function saveMascot(input: { creature?: unknown; name?: unknown; bedtimeFrom?: unknown; bedtimeTo?: unknown }): string | null {
  const next = mascotSettings();
  if (input.creature !== undefined) {
    if (!(CREATURES as readonly string[]).includes(String(input.creature))) return 'invalid_creature';
    if (String(input.creature) !== next.creature) Object.assign(next, switchMascot(String(input.creature)));
  }
  if (input.name !== undefined) {
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 20) return 'invalid_name';
    next.name = name;
  }
  for (const key of ['bedtimeFrom', 'bedtimeTo'] as const) {
    if (input[key] === undefined) continue;
    if (!HHMM.test(String(input[key]))) return 'invalid_bedtime';
    next[key] = String(input[key]);
  }
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mascot', ?)").run(JSON.stringify(next));
  return null;
}

/** Everyone's chore coins, all time */
export const familyCoinsTotal = () => (db.prepare("SELECT COALESCE(SUM(coinsEarned), 0) AS n FROM task_completions WHERE status = 'approved'").get() as { n: number }).n;

/**
 * Swapping mascots: each creature the family has had keeps its own growth, name and outfit. The active one
 * grows with the family coins earned while it's active (mascotOffset = the family total when it took over,
 * minus what it had already); the others rest in 'mascotPets'. A creature the family hasn't had starts as an
 * egg. Before any swap the offset is 0, so the first mascot has every family coin ever earned.
 */
const DEFAULT_NAMES: Record<string, string> = { dog: 'Dusty', cat: 'Whiskers', dragon: 'Sparky', robot: 'Bolt', fox: 'Rusty', bunny: 'Clover', panda: 'Bamboo', axolotl: 'Axel' };
type Pet = { name: string; progress: number; outfit: Outfit };
const setting = (key: string) => (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
const setSetting = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);

/** The resting mascots, by creature */
export function mascotPets(): Record<string, Pet> {
  try { return JSON.parse(setting('mascotPets') ?? '{}'); } catch { return {}; }
}
/** How far the active mascot has grown: family coins since it took over, plus what it already had */
export const mascotProgress = () => Math.max(0, familyCoinsTotal() - (Number(setting('mascotOffset')) || 0));
export const stageIndexFor = (coins: number) => STAGES.reduce((i, s, n) => (coins >= s.from ? n : i), 0);

function switchMascot(to: string): { creature: string; name: string } {
  const current = mascotSettings();
  const pets = mascotPets();
  pets[current.creature] = { name: current.name, progress: mascotProgress(), outfit: mascotOutfit() };
  const returning = pets[to];
  delete pets[to];
  setSetting('mascotOffset', String(familyCoinsTotal() - (returning?.progress ?? 0)));
  setSetting('mascotPets', JSON.stringify(pets));
  saveOutfit(returning?.outfit ?? {});
  return { creature: to, name: returning?.name ?? DEFAULT_NAMES[to] ?? DEFAULT.name };
}

/** Every creature for the Settings picker: the active one, the resting ones (name, stage) and the rest (new eggs) */
export function mascotRoster() {
  const current = mascotSettings();
  const pets = mascotPets();
  return CREATURES.map((creature) => {
    if (creature === current.creature) return { creature, status: 'active', name: current.name, stage: STAGES[stageIndexFor(mascotProgress())].stage };
    const pet = pets[creature];
    return pet ? { creature, status: 'resting', name: pet.name, stage: STAGES[stageIndexFor(pet.progress)].stage } : { creature, status: 'new', name: DEFAULT_NAMES[creature], stage: 'egg' };
  });
}

export function moodFor(houseHealth: number): 'happy' | 'fine' | 'messy' | 'sad' {
  return houseHealth >= 80 ? 'happy' : houseHealth >= 50 ? 'fine' : houseHealth >= 25 ? 'messy' : 'sad';
}

/** Everything Home needs to draw the mascot */
export function mascotFor(opts: { houseHealth: number; rooms: Array<{ id: number; name: string; health: number }>; rescueDone: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  // This mascot's own growth (see switchMascot)
  const familyCoins = mascotProgress();
  const idx = stageIndexFor(familyCoins);
  const mood = moodFor(opts.houseHealth);
  const messiest = [...opts.rooms].sort((a, b) => a.health - b.health)[0];
  // Birthdays are stored 'MM-DD'
  const today = dateStr(now).slice(5);
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
    tummy: tummy(now),
    // The shop and the shared outfit (Settings → Features → Mascot shop)
    shop: isFeatureOn('mascotShop') ? SHOP : null,
    outfit: isFeatureOn('mascotShop') ? mascotOutfit() : {},
  };
}

/**
 * The tummy (0–100): each chore done fills 5% (a team-up counts once) and it drains from full to empty over
 * 2 days. Worked out from the last week of chores, so nothing needs storing; going back a week means any
 * starting guess has long since emptied or filled up.
 */
export const TUMMY_PER_CHORE = 5;
const DRAIN_PER_MS = 100 / (48 * 3600000);
export function tummy(now: Date = new Date()): number {
  const since = new Date(now.getTime() - 7 * 24 * 3600000).toISOString();
  const rows = db.prepare("SELECT completedAt, teamupId FROM task_completions WHERE status = 'approved' AND completedAt >= ? ORDER BY completedAt")
    .all(since) as Array<{ completedAt: string; teamupId: number | null }>;
  const teams = new Set<number>();
  let level = 0;
  let at = Date.parse(since);
  for (const r of rows) {
    if (r.teamupId != null) { if (teams.has(r.teamupId)) continue; teams.add(r.teamupId); }
    const t = Math.min(Date.parse(r.completedAt), now.getTime());
    level = Math.min(100, Math.max(0, level - (t - at) * DRAIN_PER_MS) + TUMMY_PER_CHORE);
    at = t;
  }
  return Math.round(Math.max(0, level - (now.getTime() - at) * DRAIN_PER_MS));
}

/** The accessory shop: 1–5 coins each, one item per spot. The crown stays a free Legendary reward. */
export const SHOP: Array<{ id: string; slot: 'head' | 'face' | 'neck' | 'back'; price: number }> = [
  { id: 'bow', slot: 'head', price: 1 }, { id: 'beanie', slot: 'head', price: 2 }, { id: 'flowerCrown', slot: 'head', price: 3 },
  { id: 'headphones', slot: 'head', price: 3 }, { id: 'cowboyHat', slot: 'head', price: 4 }, { id: 'pirateHat', slot: 'head', price: 4 },
  { id: 'wizardHat', slot: 'head', price: 5 },
  { id: 'glasses', slot: 'face', price: 2 }, { id: 'sunglasses', slot: 'face', price: 3 }, { id: 'heroMask', slot: 'face', price: 4 },
  { id: 'bandana', slot: 'neck', price: 1 }, { id: 'bowTie', slot: 'neck', price: 2 }, { id: 'necklace', slot: 'neck', price: 3 },
  { id: 'balloon', slot: 'back', price: 1 }, { id: 'cape', slot: 'back', price: 5 }, { id: 'wings', slot: 'back', price: 5 },
];
export type Outfit = Partial<Record<'head' | 'face' | 'neck' | 'back', { id: string; by: number; byName: string; at: string }>>;

export function mascotOutfit(): Outfit {
  try {
    const raw = (db.prepare("SELECT value FROM app_settings WHERE key = 'mascotOutfit'").get() as { value: string } | undefined)?.value;
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
const saveOutfit = (o: Outfit) => db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mascotOutfit', ?)").run(JSON.stringify(o));

/** Buy an accessory: it goes on right away for everyone, replacing what was in that spot (there's no closet). */
export function buyAccessory(userId: number, itemId: string): { error: string } | { outfit: Outfit; coins: number } {
  if (!isFeatureOn('mascot') || !isFeatureOn('mascotShop')) return { error: 'feature_off' };
  const item = SHOP.find((i) => i.id === itemId);
  if (!item) return { error: 'unknown_item' };
  // Nothing to wear (or to peek at) until it hatches
  if (mascotProgress() < STAGES[1].from) return { error: 'not_hatched' };
  const me = db.prepare('SELECT coins, displayName FROM users WHERE id = ?').get(userId) as { coins: number; displayName: string } | undefined;
  if (!me) return { error: 'not_found' };
  if (me.coins < item.price) return { error: 'not_enough_coins' };
  const outfit = mascotOutfit();
  db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(item.price, userId);
    db.prepare('INSERT INTO mascot_purchases (userId, itemId, price) VALUES (?, ?, ?)').run(userId, item.id, item.price);
    outfit[item.slot] = { id: item.id, by: userId, byName: me.displayName, at: new Date().toISOString() };
    saveOutfit(outfit);
  })();
  return { outfit, coins: me.coins - item.price };
}

/** Take an item off (free): only whoever bought it, or a parent */
export function takeOffAccessory(userId: number, slot: string): { error: string } | { outfit: Outfit } {
  const outfit = mascotOutfit();
  const worn = outfit[slot as keyof Outfit];
  if (!worn) return { error: 'not_found' };
  const role = (db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined)?.role;
  if (worn.by !== userId && role !== 'admin') return { error: 'not_yours' };
  delete outfit[slot as keyof Outfit];
  saveOutfit(outfit);
  return { outfit };
}
