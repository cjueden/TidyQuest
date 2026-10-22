import db from '../database';
import { tr } from './i18n';
import { flushNotificationQueue, notificationsOn, notifyPeople } from './notify';
import { taskAudience } from './notifyMessages';
import { isSeasonalNow, nextDueAt } from './schedule';
import { localDateStr } from './dateHelpers';
import { buildBoard } from './board';
import { weekStartDay } from './periods';
import { todaysMission } from './rescue';

/**
 * The timed notifications, checked every minute: queued messages after quiet hours, the morning
 * "today's chores" for kids, the evening nudge, the Sunday recap for parents, and task reminders.
 * Each goes out once (a dedupe key per person and day), within a window after its time, so a restart
 * neither repeats nor sends a 7 am summary at 3 pm.
 */

const WINDOW_MIN = 90;
export const SCHEDULE_DEFAULTS = { morningTime: '07:00', eveningTime: '19:00', recapDay: '0', recapTime: '18:00' };

const setting = (key: keyof typeof SCHEDULE_DEFAULTS) =>
  (db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || SCHEDULE_DEFAULTS[key];
const minutes = (hm: string) => { const m = /^(\d\d):(\d\d)$/.exec(hm); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
const nowMinutes = (now: Date) => now.getHours() * 60 + now.getMinutes();
/** Within [time + offset, time + offset + window) today */
const inWindow = (now: Date, hm: string, offset = 0, window = WINDOW_MIN) => {
  const start = minutes(hm) + offset;
  return start >= 0 && nowMinutes(now) >= start && nowMinutes(now) < start + window;
};
const endOfDay = (d: Date, plusDays = 0) => { const out = new Date(d); out.setDate(out.getDate() + plusDays); out.setHours(23, 59, 59, 999); return out; };

interface TaskRow { id: number; name: string; roomId: number; onDemand: number; isSeasonal: number; frequencyDays: number; lastCompletedAt: string | null;
  scheduleWeekdays: number | null; seasonStartMonth: number | null; seasonEndMonth: number | null; assignmentMode: string | null;
  rotationPeriod: string | null; rotationCurrentUserId: number | null; reminderTime: string | null; reminderDayBefore: number }

const scheduledTasks = (now: Date) => (db.prepare('SELECT * FROM tasks WHERE onDemand = 0 AND archivedAt IS NULL AND deletedAt IS NULL AND pausedAt IS NULL').all() as TaskRow[]).filter((t) => !isSeasonalNow(t, now));
/** Not done and due by the end of `by` */
const dueBy = (t: TaskRow, by: Date, now: Date) => (nextDueAt(t, now)?.getTime() ?? now.getTime()) <= by.getTime();

/** A person's own chores still due today (not ones open to anyone). */
export function choresDueFor(userId: number, now: Date = new Date()): string[] {
  return scheduledTasks(now)
    .filter((t) => { const a = taskAudience(t); return Array.isArray(a) && a.includes(userId); })
    .filter((t) => dueBy(t, endOfDay(now), now))
    .map((t) => t.name);
}

function list(lang: string, names: string[]) {
  const shown = names.slice(0, 6).join(', ');
  return names.length > 6 ? `${shown} ${tr(lang, 'notify.moreItems', { n: names.length - 6 })}` : shown;
}

const kids = () => db.prepare("SELECT id, displayName, currentStreak, lastActiveDate FROM users WHERE role != 'admin'").all() as Array<{ id: number; displayName: string; currentStreak: number; lastActiveDate: string | null }>;

async function morningSummaries(now: Date) {
  if (!notificationsOn('summary') || !inWindow(now, setting('morningTime'))) return;
  const day = localDateStr(now);
  for (const kid of kids()) {
    const chores = choresDueFor(kid.id, now);
    if (chores.length === 0) continue;
    await notifyPeople([kid.id], 'summary', (lang) => tr(lang, 'notify.morning', { name: kid.displayName, list: list(lang, chores) }), { now, dedupeKey: `morning:${day}` });
  }
}

/** The day's Rescue Mission, at the morning time, to the people who can do it. */
async function rescueAnnouncement(now: Date) {
  if (!notificationsOn('rescue') || !inWindow(now, setting('morningTime'))) return;
  const mission = todaysMission(now);
  if (!mission || mission.completedBy || !mission.taskId) return;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(mission.taskId) as TaskRow | undefined;
  if (!task) return;
  const m = String(Math.round(mission.multiplier * 100) / 100);
  await notifyPeople(taskAudience(task), 'rescue', (lang) => tr(lang, 'notify.rescue', { task: task.name, multiplier: m }), { now, dedupeKey: `rescue:${mission.day}` });
}

async function eveningNudges(now: Date) {
  if (!notificationsOn('nudge') || !inWindow(now, setting('eveningTime'))) return;
  const day = localDateStr(now);
  for (const kid of kids()) {
    const chores = choresDueFor(kid.id, now);
    const streakAtRisk = kid.currentStreak >= 2 && kid.lastActiveDate !== day;
    // This week's goal, if it's close (a quarter or less to go)
    const goal = db.prepare(
      "SELECT goalCoins, startAt, endAt FROM user_goals WHERE userId = ? AND status = 'active' AND startAt <= ? AND endAt >= ? ORDER BY startAt DESC LIMIT 1"
    ).get(kid.id, now.toISOString(), now.toISOString()) as { goalCoins: number; startAt: string; endAt: string } | undefined;
    let toGoal = 0;
    if (goal) {
      const earned = (db.prepare("SELECT COALESCE(SUM(coinsEarned), 0) AS n FROM task_completions WHERE userId = ? AND status = 'approved' AND completedAt >= ? AND completedAt <= ?")
        .get(kid.id, goal.startAt, goal.endAt) as { n: number }).n;
      const left = goal.goalCoins - earned;
      if (left > 0 && left <= goal.goalCoins / 4) toGoal = left;
    }
    if (chores.length === 0 && !streakAtRisk && !toGoal) continue;
    await notifyPeople([kid.id], 'nudge', (lang) => [
      chores.length ? tr(lang, 'notify.evening', { list: list(lang, chores) }) : '',
      streakAtRisk ? tr(lang, 'notify.streakRisk', { n: kid.currentStreak }) : '',
      toGoal ? tr(lang, 'notify.goalClose', { n: toGoal }) : '',
    ].filter(Boolean).join('\n'), { now, dedupeKey: `evening:${day}` });
  }
}

async function weeklyRecap(now: Date) {
  if (!notificationsOn('summary') || String(now.getDay()) !== setting('recapDay') || !inWindow(now, setting('recapTime'))) return;
  // On the week's first day (Sunday by default for Sunday-first families) this week has barely begun: recap the one that ended
  const lastWeek = now.getDay() === weekStartDay();
  const board = buildBoard(lastWeek ? 'lastWeek' : 'week', 'coins', now);
  if (board.people.length === 0) return;
  const top = board.people.filter((p) => p.rank === 1 && p.points > 0).map((p) => p.displayName);
  await notifyPeople('parents', 'summary', (lang) => [
    tr(lang, lastWeek ? 'notify.recapLastWeek' : 'notify.recap', { lines: board.people.map((p) => tr(lang, 'notify.recapLine', { name: p.displayName, coins: p.points, chores: p.chores })).join('; ') }),
    top.length ? tr(lang, 'notify.recapWinner', { name: top.join(' & ') }) : '',
  ].filter(Boolean).join('\n'), { now, dedupeKey: `recap:${localDateStr(now)}` });
}

/**
 * Task reminders: at the task's reminder time on its due day (or the evening before), again two
 * hours later if it's still not done, and two hours after that a parent hears about it.
 */
async function taskReminders(now: Date) {
  if (!notificationsOn('reminder')) return;
  for (const t of scheduledTasks(now).filter((x) => x.reminderTime)) {
    const target = endOfDay(now, t.reminderDayBefore ? 1 : 0);
    const day = localDateStr(target);
    for (const stage of [1, 2, 3] as const) {
      if (!inWindow(now, t.reminderTime!, (stage - 1) * 120, 60)) continue;
      if (!dueBy(t, target, now)) continue;
      const audience = taskAudience(t);
      const key = `reminder:${t.id}:${day}:${stage}`;
      if (stage < 3) {
        const msg = stage === 2 ? 'notify.reminderAgain' : t.reminderDayBefore ? 'notify.reminderTomorrow' : 'notify.reminder';
        await notifyPeople(audience, 'reminder', (lang) => tr(lang, msg, { task: t.name }), { now, dedupeKey: key });
      } else {
        const names = Array.isArray(audience)
          ? (db.prepare(`SELECT displayName FROM users WHERE id IN (${audience.map(() => '?').join(',')})`).all(...audience) as Array<{ displayName: string }>).map((u) => u.displayName).join(', ')
          : '';
        await notifyPeople('parents', 'reminder', (lang) => tr(lang, 'notify.reminderParents', { task: t.name }) + (names ? ` (${names})` : ''), { now, dedupeKey: key });
      }
    }
  }
}

let running = false;
export async function runScheduledNotifications(now: Date = new Date()): Promise<void> {
  if (running) return; // a slow send mustn't overlap the next minute's check
  running = true;
  try {
    await flushNotificationQueue(now);
    await morningSummaries(now);
    await rescueAnnouncement(now);
    await eveningNudges(now);
    await weeklyRecap(now);
    await taskReminders(now);
  } finally {
    running = false;
  }
}
