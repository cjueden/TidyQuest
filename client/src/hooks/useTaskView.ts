import { useState } from 'react';

export type TaskFilter = 'all' | 'mine';

/**
 * The All / Mine choice for task lists. A parent can set it per person (users.taskView):
 *   'all'      — the person chooses; the choice is remembered on this device
 *   'mine'     — starts on Mine every time, can switch for a moment
 *   'mineOnly' — always Mine, no switch (Kid mode also implies this)
 */
export function useTaskView(user: { taskView?: string | null; kidMode?: boolean | number | null } | null | undefined, storageKey = 'tq-task-filter') {
  const locked = user?.taskView === 'mineOnly' || !!user?.kidMode;
  const startsOnMine = locked || user?.taskView === 'mine';
  const [filter, setFilterState] = useState<TaskFilter>(() => {
    if (startsOnMine) return 'mine';
    try { return (localStorage.getItem(storageKey) as TaskFilter) || 'all'; } catch { return 'all'; }
  });
  const setFilter = (f: TaskFilter) => {
    if (locked) return;
    setFilterState(f);
    if (!startsOnMine) {
      try { localStorage.setItem(storageKey, f); } catch { /* storage unavailable */ }
    }
  };
  return { filter: locked ? 'mine' as TaskFilter : filter, setFilter, locked };
}
