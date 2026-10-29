import { currentFamily, isHosted, runInFamily } from './context';
import { familyStatus, openFamily, purgeDeletedFamilies } from './families';
import { mainDb } from './mainDb';
import { endExpiredTrials } from './trials';

// The background jobs (HOSTED.md §6): every 30 seconds, each family's jobs inside its own database, one
// family at a time; self-hosted, once on the only database. In hosted mode, once a day, the ones for
// main.db. A run still going when the next is due means the next is skipped.
export type Job = (now?: Date) => unknown;

/** Families whose jobs run: on a trial or a paid plan. Suspended, expired and deleted ones are skipped. */
const runningFamilies = () =>
  (mainDb().prepare("SELECT id, status, trialEndsAt, plan FROM families WHERE status IN ('trial', 'active') AND deletedAt IS NULL ORDER BY createdAt").all() as { id: string; status: string; trialEndsAt: string | null; plan: string | null }[])
    .filter((f) => familyStatus(f) !== 'expired').map((f) => f.id);

/** Runs job once per running family, inside its database (self-hosted: once). One family's error is logged and the rest go on. */
export async function forEachFamily(job: () => unknown): Promise<void> {
  if (!isHosted()) {
    await job();
    return;
  }
  for (const id of runningFamilies()) {
    try {
      const family = openFamily(id, Date.now(), { activity: false });
      if (!family) throw new Error('its database is missing');
      await runInFamily(family, job);
    } catch (err) {
      console.error(`[jobs] Family ${id} failed:`, err);
    }
  }
}

/** One job, its error logged (with the family) so the other jobs still run. */
async function runJob(job: Job, now?: Date): Promise<void> {
  try {
    await job(now);
  } catch (err) {
    const family = currentFamily()?.familyId;
    console.error(`[jobs] ${job.name || 'A job'} failed${family ? ` for family ${family}` : ''}:`, err);
  }
}

let running = false;
let dailyRunOn = '';

/**
 * One run: each family's jobs (started in order, then awaited together, as before NEW-11), then the daily
 * jobs once a day. Tests pass `now`; the server leaves it out so each job reads the clock itself. Returns
 * false when skipped because the last run is still going.
 */
export async function runJobs(jobs: Job[], now?: Date): Promise<boolean> {
  if (running) return false;
  running = true;
  try {
    await forEachFamily(() => Promise.all(jobs.map((job) => runJob(job, now))));
    if (isHosted()) await dailyJobs(now ?? new Date());
  } finally {
    running = false;
  }
  return true;
}

/** Once a day (UTC), hosted: remove families deleted 30+ days ago, and warn about or delete expired trials. */
async function dailyJobs(now: Date): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  if (day === dailyRunOn) return;
  dailyRunOn = day;
  for (const job of [purgeDeletedFamilies, endExpiredTrials]) await runJob(job, now);
}

/** Tests: forget the last daily run. */
export function resetDailyJobs() { dailyRunOn = ''; }

/** Server start: run the jobs now and every 30 seconds. */
export function startJobs(jobs: Job[]): void {
  void runJobs(jobs);
  setInterval(() => void runJobs(jobs), 30_000);
}
