import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { parseCsv, toCsv, type CsvRecord } from '../utils/csv';
import { createTask, updateTask } from './tasks';

/**
 * Tasks and rewards as spreadsheets (Settings → Data). Export writes every task / reward; import
 * upserts by (room name, task name) / reward title, creates missing rooms and never deletes anything.
 * An import is previewed first (dryRun: true lists what each row would do), then applied the same way.
 */
const router = Router();
router.use(authMiddleware);

export const TASK_COLUMNS = ['room', 'task', 'notes', 'every_days', 'effort', 'coins', 'on_demand', 'show_on_home', 'early', 'assignees', 'icon'];
export const REWARD_COLUMNS = ['title', 'description', 'cost', 'active', 'category'];
const MAX_ROWS = 5000;

// Other header spellings people may use for the same column
const ALIASES: Record<string, string> = {
  name: 'task', task_name: 'task', room_name: 'room',
  frequency: 'every_days', frequency_days: 'every_days', every: 'every_days', days: 'every_days',
  custom_coins: 'coins', anytime: 'on_demand', ondemand: 'on_demand',
  home: 'show_on_home', show_in_dashboard: 'show_on_home', allow_early: 'early', early_completion: 'early',
  assignee: 'assignees', owner: 'assignees', owners: 'assignees', who: 'assignees', icon_key: 'icon',
  reward: 'title', price: 'cost', coins_cost: 'cost', is_active: 'active',
};

type Change = { field: string; from: string; to: string };
type RowError = { code: string; message: string; field?: string; value?: string };
type Action = 'add' | 'update' | 'unchanged' | 'error';

const csvFile = (res: Response, name: string, text: string) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${name}`);
  res.send(text);
};
const yesNo = (v: unknown) => (v ? '1' : '0');
const norm = (s: string) => s.trim().toLowerCase();

function parseBool(raw: string, emptyMeans = false): boolean | null {
  const s = norm(raw);
  if (s === '') return emptyMeans;
  if (['1', 'true', 'yes', 'y', 'x', 'on', '✓', '✔'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off', '-'].includes(s)) return false;
  return null;
}

class RowProblem extends Error {
  constructor(public problem: RowError) { super(problem.message); }
}
const fail = (code: string, message: string, field?: string, value?: string): never => {
  throw new RowProblem({ code, message, field, value });
};

/** Read the header row; returns a column getter per record, or the missing required columns. */
function readTable(csv: unknown, required: string[], known: string[]) {
  if (typeof csv !== 'string' || !csv.trim()) return { error: { status: 400, body: { error: 'empty_file', message: 'The file is empty' } } };
  const records = parseCsv(csv);
  if (records.length < 1) return { error: { status: 400, body: { error: 'empty_file', message: 'The file is empty' } } };
  if (records.length - 1 > MAX_ROWS) return { error: { status: 400, body: { error: 'too_many_rows', message: `At most ${MAX_ROWS} rows` } } };
  const header = records[0].cells.map((h) => {
    const key = h.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ALIASES[key] ?? key;
  });
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return { error: { status: 400, body: { error: 'missing_columns', columns: missing, message: `Missing column(s): ${missing.join(', ')}` } } };
  }
  const has = (col: string) => header.includes(col);
  const cell = (r: CsvRecord, col: string) => (r.cells[header.indexOf(col)] ?? '');
  const unknownColumns = records[0].cells.filter((_h, i) => header[i] && !known.includes(header[i]));
  return { rows: records.slice(1), has, cell, unknownColumns };
}

function summarize<T extends { action: Action }>(rows: T[]) {
  const count = (a: Action) => rows.filter((r) => r.action === a).length;
  return { add: count('add'), update: count('update'), unchanged: count('unchanged'), error: count('error') };
}

// ---------- Tasks ----------

router.get('/tasks', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const rooms = db.prepare('SELECT id, name FROM rooms WHERE deletedAt IS NULL ORDER BY sortOrder, id').all() as { id: number; name: string }[];
  const tasks = db.prepare('SELECT * FROM tasks WHERE archivedAt IS NULL AND deletedAt IS NULL ORDER BY id').all() as any[];
  const usernames = new Map((db.prepare('SELECT id, username FROM users').all() as { id: number; username: string }[]).map((u) => [u.id, u.username]));
  const assignees = new Map<number, string[]>();
  for (const a of db.prepare('SELECT taskId, userId FROM task_assignees ORDER BY userId').all() as { taskId: number; userId: number }[]) {
    if (!assignees.has(a.taskId)) assignees.set(a.taskId, []);
    assignees.get(a.taskId)!.push(usernames.get(a.userId) ?? String(a.userId));
  }
  const rows = rooms.flatMap((room) => tasks.filter((t) => t.roomId === room.id).map((t) => [
    room.name, t.name, t.notes ?? '', t.frequencyDays, t.effort, t.customCoins ?? '',
    yesNo(t.onDemand), yesNo(t.showInDashboard), yesNo(t.allowEarlyCompletion), (assignees.get(t.id) || []).join('+'), t.iconKey ?? '',
  ]));
  csvFile(res, 'tidyquest-tasks.csv', toCsv(TASK_COLUMNS, rows));
});

interface TaskRow { line: number; action: Action; room: string; task: string; newRoom?: boolean; changes: Change[]; error?: RowError }
type TaskOp = { line: number; kind: 'add'; roomKey: string; body: any } | { line: number; kind: 'update'; taskId: number; body: any };

function planTaskImport(csv: unknown) {
  const table = readTable(csv, ['room', 'task'], TASK_COLUMNS);
  if ('error' in table) return { error: table.error };
  const { rows, has, cell, unknownColumns } = table;

  const rooms = db.prepare('SELECT id, name, assignedUserId FROM rooms WHERE deletedAt IS NULL ORDER BY sortOrder, id').all() as { id: number; name: string; assignedUserId: number | null }[];
  const tasks = db.prepare('SELECT * FROM tasks WHERE archivedAt IS NULL AND deletedAt IS NULL').all() as any[];
  const users = db.prepare('SELECT id, username, displayName FROM users').all() as { id: number; username: string; displayName: string }[];
  const usernameById = new Map(users.map((u) => [u.id, u.username]));
  const assigneeIds = new Map<number, number[]>();
  for (const a of db.prepare('SELECT taskId, userId FROM task_assignees').all() as { taskId: number; userId: number }[]) {
    if (!assigneeIds.has(a.taskId)) assigneeIds.set(a.taskId, []);
    assigneeIds.get(a.taskId)!.push(a.userId);
  }
  const findPerson = (raw: string) => users.find((u) => norm(u.username) === norm(raw)) ?? users.find((u) => norm(u.displayName) === norm(raw));
  const people = (ids: number[]) => [...ids].sort((a, b) => a - b).map((id) => usernameById.get(id) ?? String(id)).join('+');

  const seen = new Map<string, number>();
  const roomsToCreate = new Map<string, string>(); // lower-case name -> name as written
  const results: TaskRow[] = [];
  const ops: TaskOp[] = [];

  for (const r of rows) {
    const roomName = cell(r, 'room').trim();
    const taskName = cell(r, 'task').trim();
    const result: TaskRow = { line: r.line, action: 'error', room: roomName, task: taskName, changes: [] };
    results.push(result);
    try {
      if (!roomName) fail('missing_room', 'The room is empty', 'room');
      if (!taskName) fail('missing_task', 'The task name is empty', 'task');
      const key = `${norm(roomName)}\u0000${norm(taskName)}`;
      if (seen.has(key)) fail('duplicate_row', `Same room and task as line ${seen.get(key)}`, 'task', String(seen.get(key)));
      seen.set(key, r.line);

      // Read every given column into the values the task would have
      const v: Record<string, any> = {};
      if (has('notes')) v.notes = cell(r, 'notes').trim();
      if (has('every_days') && cell(r, 'every_days').trim() !== '') {
        const raw = cell(r, 'every_days').trim();
        const n = Number(raw.replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0 || n > 3650) fail('bad_number', `"${raw}" is not a number of days`, 'every_days', raw);
        v.frequencyDays = n;
      }
      if (has('effort') && cell(r, 'effort').trim() !== '') {
        const raw = cell(r, 'effort').trim();
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 5) fail('bad_effort', `Effort must be 1 to 5 (got "${raw}")`, 'effort', raw);
        v.effort = n;
      }
      if (has('coins')) {
        const raw = cell(r, 'coins').trim();
        const n = raw === '' ? 0 : Number(raw);
        if (!Number.isInteger(n) || n < 0) fail('bad_coins', `Coins must be a whole number, or empty for the effort default (got "${raw}")`, 'coins', raw);
        v.customCoins = n > 0 ? n : null;
      }
      for (const [col, field] of [['on_demand', 'onDemand'], ['show_on_home', 'showInDashboard'], ['early', 'allowEarlyCompletion']]) {
        if (!has(col)) continue;
        const b = parseBool(cell(r, col));
        if (b === null) fail('bad_boolean', `"${cell(r, col).trim()}" is not yes or no`, col, cell(r, col).trim());
        v[field] = b;
      }
      if (has('assignees')) {
        const ids: number[] = [];
        for (const part of cell(r, 'assignees').split('+').map((p) => p.trim()).filter(Boolean)) {
          const person = findPerson(part);
          if (!person) fail('unknown_person', `No one here is called "${part}"`, 'assignees', part);
          if (!ids.includes(person!.id)) ids.push(person!.id);
        }
        v.assignedUserIds = ids;
      }
      if (has('icon') && cell(r, 'icon').trim() !== '') v.iconKey = cell(r, 'icon').trim().slice(0, 60);

      const roomMatches = rooms.filter((rm) => norm(rm.name) === norm(roomName));
      if (roomMatches.length > 1) fail('ambiguous', `${roomMatches.length} rooms are called "${roomName}"; rename one first`, 'room', roomName);
      const room = roomMatches[0];
      const existing = room ? tasks.filter((t) => t.roomId === room.id && norm(t.name) === norm(taskName)) : [];
      if (existing.length > 1) fail('ambiguous', `${existing.length} tasks in "${roomName}" are called "${taskName}"; rename one first`, 'task', taskName);

      if (existing.length === 0) {
        if (!room) {
          result.newRoom = true;
          if (!roomsToCreate.has(norm(roomName))) roomsToCreate.set(norm(roomName), roomName);
        }
        result.action = 'add';
        ops.push({ line: r.line, kind: 'add', roomKey: norm(roomName), body: { name: taskName, ...v, notes: v.notes || undefined } });
        continue;
      }

      // Existing task: only what differs is changed
      const t = existing[0];
      const body: Record<string, any> = {};
      const change = (field: string, from: unknown, to: unknown) => result.changes.push({ field, from: String(from ?? ''), to: String(to ?? '') });
      if (v.notes !== undefined && v.notes !== (t.notes ?? '')) { body.notes = v.notes || null; change('notes', t.notes, v.notes); }
      if (v.frequencyDays !== undefined && v.frequencyDays !== Number(t.frequencyDays)) { body.frequencyDays = v.frequencyDays; change('every_days', t.frequencyDays, v.frequencyDays); }
      if (v.effort !== undefined && v.effort !== t.effort) { body.effort = v.effort; change('effort', t.effort, v.effort); }
      if (v.customCoins !== undefined && v.customCoins !== (t.customCoins ?? null)) { body.customCoins = v.customCoins; change('coins', t.customCoins, v.customCoins); }
      for (const [col, field] of [['on_demand', 'onDemand'], ['show_on_home', 'showInDashboard'], ['early', 'allowEarlyCompletion']]) {
        if (v[field] !== undefined && v[field] !== !!t[field]) { body[field] = v[field]; change(col, yesNo(t[field]), yesNo(v[field])); }
      }
      if (v.assignedUserIds !== undefined) {
        const before = people(assigneeIds.get(t.id) || []);
        const after = people(v.assignedUserIds);
        if (before !== after) {
          body.assignedUserIds = v.assignedUserIds;
          // Custom splits belong to the old people; new people share the coins equally instead
          if (t.assignmentMode === 'custom') body.assignmentMode = 'shared';
          change('assignees', before, after);
        }
      }
      if (v.iconKey !== undefined && v.iconKey !== (t.iconKey ?? '')) { body.iconKey = v.iconKey; change('icon', t.iconKey, v.iconKey); }
      result.action = result.changes.length > 0 ? 'update' : 'unchanged';
      if (result.changes.length > 0) ops.push({ line: r.line, kind: 'update', taskId: t.id, body });
    } catch (e) {
      if (!(e instanceof RowProblem)) throw e;
      result.action = 'error';
      result.error = e.problem;
    }
  }
  return { results, ops, roomsToCreate, unknownColumns, rooms };
}

router.post('/tasks/import', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const dryRun = req.body?.dryRun !== false;
  const plan = planTaskImport(req.body?.csv);
  if ('error' in plan && plan.error) return res.status(plan.error.status).json(plan.error.body);
  const { results, ops, roomsToCreate, unknownColumns, rooms } = plan as Exclude<typeof plan, { error: unknown }>;

  if (!dryRun) {
    db.transaction(() => {
      const roomIds = new Map(rooms.map((r) => [norm(r.name), r.id]));
      for (const [key, name] of roomsToCreate) {
        roomIds.set(key, Number(db.prepare("INSERT INTO rooms (name, roomType) VALUES (?, 'other')").run(name).lastInsertRowid));
      }
      for (const op of ops) {
        const result = op.kind === 'add' ? createTask(roomIds.get(op.roomKey)!, op.body) : updateTask(op.taskId, op.body);
        if (result.status >= 300) throw new Error(`Line ${op.line}: ${result.body?.error ?? 'could not be saved'}`);
        // The file says exactly who: a new task in someone's room doesn't also get the owner added
        if (op.kind === 'add' && op.body.assignedUserIds !== undefined) {
          const keep = op.body.assignedUserIds as number[];
          db.prepare(`DELETE FROM task_assignees WHERE taskId = ?${keep.length ? ` AND userId NOT IN (${keep.map(() => '?').join(',')})` : ''}`)
            .run(result.body.id, ...keep);
        }
      }
    })();
  }
  res.json({ dryRun, applied: !dryRun, rows: results, summary: summarize(results), roomsToCreate: [...roomsToCreate.values()], unknownColumns });
});

// ---------- Rewards ----------

router.get('/rewards', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const rewards = db.prepare('SELECT * FROM rewards ORDER BY isActive DESC, costCoins ASC, id ASC').all() as any[];
  csvFile(res, 'tidyquest-rewards.csv', toCsv(REWARD_COLUMNS, rewards.map((r) => [r.title, r.description ?? '', r.costCoins, yesNo(r.isActive), r.category ?? ''])));
});

interface RewardRow { line: number; action: Action; title: string; changes: Change[]; error?: RowError }
type RewardOp = { kind: 'add'; values: any } | { kind: 'update'; id: number; values: Record<string, any> };

router.post('/rewards/import', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const dryRun = req.body?.dryRun !== false;
  const table = readTable(req.body?.csv, ['title'], REWARD_COLUMNS);
  if ('error' in table) return res.status(table.error!.status).json(table.error!.body);
  const { rows, has, cell, unknownColumns } = table;

  const rewards = db.prepare('SELECT * FROM rewards').all() as any[];
  const seen = new Map<string, number>();
  const results: RewardRow[] = [];
  const ops: RewardOp[] = [];
  for (const r of rows) {
    const title = cell(r, 'title').trim();
    const result: RewardRow = { line: r.line, action: 'error', title, changes: [] };
    results.push(result);
    try {
      if (!title) fail('missing_title', 'The title is empty', 'title');
      if (seen.has(norm(title))) fail('duplicate_row', `Same title as line ${seen.get(norm(title))}`, 'title', String(seen.get(norm(title))));
      seen.set(norm(title), r.line);
      const v: Record<string, any> = {};
      if (has('description')) v.description = cell(r, 'description').trim();
      if (has('cost') && cell(r, 'cost').trim() !== '') {
        const raw = cell(r, 'cost').trim();
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1) fail('bad_cost', `Cost must be a whole number of at least 1 (got "${raw}")`, 'cost', raw);
        v.costCoins = n;
      }
      if (has('active')) {
        const b = parseBool(cell(r, 'active'), true);
        if (b === null) fail('bad_boolean', `"${cell(r, 'active').trim()}" is not yes or no`, 'active', cell(r, 'active').trim());
        v.isActive = b ? 1 : 0;
      }
      if (has('category')) v.category = cell(r, 'category').trim().slice(0, 40);

      const existing = rewards.filter((w) => norm(w.title) === norm(title));
      if (existing.length > 1) fail('ambiguous', `${existing.length} rewards are called "${title}"; rename one first`, 'title', title);
      if (existing.length === 0) {
        if (v.costCoins === undefined) fail('bad_cost', 'A new reward needs a cost', 'cost', '');
        result.action = 'add';
        ops.push({ kind: 'add', values: { title, description: v.description || null, costCoins: v.costCoins, isActive: v.isActive ?? 1, category: v.category || null } });
        continue;
      }
      const w = existing[0];
      const values: Record<string, any> = {};
      const change = (field: string, from: unknown, to: unknown) => result.changes.push({ field, from: String(from ?? ''), to: String(to ?? '') });
      if (v.description !== undefined && v.description !== (w.description ?? '')) { values.description = v.description || null; change('description', w.description, v.description); }
      if (v.costCoins !== undefined && v.costCoins !== w.costCoins) { values.costCoins = v.costCoins; change('cost', w.costCoins, v.costCoins); }
      if (v.isActive !== undefined && v.isActive !== (w.isActive ? 1 : 0)) { values.isActive = v.isActive; change('active', yesNo(w.isActive), yesNo(v.isActive)); }
      if (v.category !== undefined && v.category !== (w.category ?? '')) { values.category = v.category || null; change('category', w.category, v.category); }
      result.action = result.changes.length > 0 ? 'update' : 'unchanged';
      if (result.changes.length > 0) ops.push({ kind: 'update', id: w.id, values });
    } catch (e) {
      if (!(e instanceof RowProblem)) throw e;
      result.action = 'error';
      result.error = e.problem;
    }
  }

  if (!dryRun) {
    db.transaction(() => {
      for (const op of ops) {
        if (op.kind === 'add') {
          const a = op.values;
          db.prepare('INSERT INTO rewards (title, description, costCoins, isActive, isPreset, createdBy, category) VALUES (?, ?, ?, ?, 0, ?, ?)')
            .run(a.title, a.description, a.costCoins, a.isActive, req.userId, a.category);
        } else {
          const cols = Object.keys(op.values);
          db.prepare(`UPDATE rewards SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => op.values[c]), op.id);
        }
      }
    })();
  }
  res.json({ dryRun, applied: !dryRun, rows: results, summary: summarize(results), unknownColumns });
});

export default router;
