import { createContext, useContext } from 'react';

// Shared parts of the chore timer (components/shared/ChoreTimer.tsx has the provider and the UI).

export interface TimerChore { id: number; name: string; iconKey?: string | null; timerMinutes?: number | null }

export interface TimerState {
  taskId: number;
  name: string;
  iconKey?: string | null;
  /** The whole length so far, for the ring (+5 min adds to it) */
  totalMs: number;
  /** Running: when it reaches zero. Paused or finished: null */
  endsAt: number | null;
  /** Paused: the time left */
  leftMs: number;
  /** When time ran out */
  finishedAt: number | null;
}

export interface TimerControls {
  state: TimerState | null;
  start: (task: TimerChore) => void;
  open: () => void;
  /** Kids wait for the timer before Done on a timer chore */
  mustWait: (task: { id: number; timerMinutes?: number | null }) => boolean;
}

export const MINUTE = 60_000;
export const ControlsContext = createContext<TimerControls | null>(null);
export const ClockContext = createContext(0);

export function timeLeft(s: TimerState, now: number) {
  return s.endsAt !== null ? Math.max(0, s.endsAt - now) : s.leftMs;
}

/** 9:05, or 1:02:05 past an hour */
export function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** The timer's controls; null outside ChoreTimerProvider */
export function useChoreTimer() {
  return useContext(ControlsContext);
}

/** The current time, ticking 4× a second while a timer runs */
export function useTimerClock() {
  return useContext(ClockContext);
}
