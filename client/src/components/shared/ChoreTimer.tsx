import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { TaskIcon } from '../icons/TaskIcons';
import { ClockContext, ControlsContext, formatClock, MINUTE, timeLeft, useChoreTimer, useTimerClock, type TimerChore, type TimerControls, type TimerState } from '../../hooks/useChoreTimer';

/**
 * Countdown timers on chores (NEW-1). A chore has one when its "Timer (minutes)" setting is on; the
 * name is never read. One timer runs at a time per person on this device: it's kept in localStorage,
 * so it survives a reload, and counts from timestamps, so it's right again when a sleeping phone
 * wakes. Kids (role child) can only tap Done on a timer chore once its timer has ended.
 */

const storageKey = (userId: number) => `tq-timer-${userId}`;

function load(userId: number): TimerState | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const s = raw ? JSON.parse(raw) : null;
    return s && typeof s.taskId === 'number' && typeof s.totalMs === 'number' ? s : null;
  } catch {
    return null;
  }
}

/** Three rising notes. The audio context is made on Start (a tap), which phones need before sound plays. */
function chime(ctx: AudioContext | null) {
  if (!ctx) return;
  void ctx.resume().catch(() => {});
  const t0 = ctx.currentTime + 0.05;
  [660, 880, 1046].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = t0 + i * 0.22;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.65);
  });
}

export function ChoreTimerProvider({ userId, role, language, onComplete, children }: {
  userId: number;
  role: string;
  language?: string;
  onComplete: (taskId: number) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation(language || 'en');
  const [state, setState] = useState<TimerState | null>(() => load(userId));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      if (state) localStorage.setItem(storageKey(userId), JSON.stringify(state));
      else localStorage.removeItem(storageKey(userId));
    } catch { /* private mode: the timer still runs, it just won't survive a reload */ }
  }, [state, userId]);

  // Tick while running; at zero: chime, buzz and show "Time's up"
  const endsAt = state?.endsAt ?? null;
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= endsAt) {
        setState((s) => (s && s.endsAt !== null ? { ...s, endsAt: null, leftMs: 0, finishedAt: n } : s));
        setSheetOpen(true);
        chime(audio.current);
        navigator.vibrate?.([250, 120, 250, 120, 500]);
      }
    }, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  // Keep the screen on while it runs (phones allow this over HTTPS only; otherwise it may sleep)
  const running = endsAt !== null;
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then((l) => {
        if (gone) void l.release(); else lock = l;
      }).catch(() => {});
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, [running]);

  const start = useCallback((task: TimerChore) => {
    const minutes = Number(task.timerMinutes) || 0;
    if (minutes <= 0) return;
    if (state && state.taskId === task.id && !state.finishedAt) { setSheetOpen(true); return; }
    if (state && state.taskId !== task.id && !state.finishedAt
      && !window.confirm(t('timer.replaceConfirm').replace('{name}', state.name))) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => {});
    } catch { /* no sound on this device */ }
    const n = Date.now();
    setNow(n);
    setState({ taskId: task.id, name: task.name, iconKey: task.iconKey, totalMs: minutes * MINUTE, endsAt: n + minutes * MINUTE, leftMs: minutes * MINUTE, finishedAt: null });
    setSheetOpen(true);
  }, [state, t]);

  const mustWait = useCallback((task: { id: number; timerMinutes?: number | null }) =>
    role === 'child' && !!task.timerMinutes && !(state?.taskId === task.id && state.finishedAt), [role, state]);

  const controls = useMemo<TimerControls>(() => ({ state, start, open: () => setSheetOpen(true), mustWait }), [state, start, mustWait]);

  const pause = () => setState((s) => (s && s.endsAt !== null ? { ...s, leftMs: Math.max(0, s.endsAt - Date.now()), endsAt: null } : s));
  const resume = () => {
    const n = Date.now();
    setNow(n);
    setState((s) => (s && s.endsAt === null && !s.finishedAt ? { ...s, endsAt: n + s.leftMs } : s));
  };
  const addFive = () => {
    const n = Date.now();
    setNow(n);
    setState((s) => {
      if (!s) return s;
      if (s.finishedAt) return { ...s, totalMs: 5 * MINUTE, leftMs: 5 * MINUTE, endsAt: n + 5 * MINUTE, finishedAt: null };
      if (s.endsAt !== null) return { ...s, totalMs: s.totalMs + 5 * MINUTE, endsAt: s.endsAt + 5 * MINUTE };
      return { ...s, totalMs: s.totalMs + 5 * MINUTE, leftMs: s.leftMs + 5 * MINUTE };
    });
  };
  const stop = () => {
    if (state && !state.finishedAt && !window.confirm(t('timer.stopConfirm'))) return;
    setState(null);
    setSheetOpen(false);
  };
  const finish = () => {
    if (!state) return;
    const id = state.taskId;
    setState(null);
    setSheetOpen(false);
    onComplete(id);
  };

  return (
    <ControlsContext.Provider value={controls}>
      <ClockContext.Provider value={now}>
        {children}
        {state && sheetOpen && (
          <TimerSheet state={state} now={now} t={t} onHide={() => setSheetOpen(false)}
            onPause={pause} onResume={resume} onAddFive={addFive} onStop={stop} onDone={finish} />
        )}
      </ClockContext.Provider>
    </ControlsContext.Provider>
  );
}

function Ring({ fraction, size, children }: { fraction: number; size: number; children: ReactNode }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--warm-border-subtle)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--warm-accent)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 0.25s linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

function TimerSheet({ state, now, t, onHide, onPause, onResume, onAddFive, onStop, onDone }: {
  state: TimerState; now: number; t: (key: string) => string;
  onHide: () => void; onPause: () => void; onResume: () => void; onAddFive: () => void; onStop: () => void; onDone: () => void;
}) {
  const left = timeLeft(state, now);
  const finished = !!state.finishedAt;
  const paused = !finished && state.endsAt === null;
  const noWakeLock = !('wakeLock' in navigator) || !window.isSecureContext;
  const big = { flex: 1, minWidth: 0, padding: '14px 10px', fontSize: 16 };
  return createPortal(
    <div className="tq-modal-overlay task-edit-overlay" onClick={onHide}>
      <div className="tq-card tq-modal task-edit-sheet tq-card-padded" role="dialog" aria-modal="true" aria-label={state.name}
        onClick={(e) => e.stopPropagation()} style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TaskIcon iconKey={state.iconKey} size={28} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{state.name}</div>
          <button type="button" className="tq-btn tq-btn-sm" onClick={onHide} aria-label={t('timer.hide')} title={t('timer.hide')}>⌄</button>
        </div>
        <Ring fraction={finished ? 0 : Math.min(1, left / Math.max(1, state.totalMs))} size={220}>
          {finished ? (
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--warm-accent)', textAlign: 'center', padding: '0 24px' }}>{t('timer.timesUp')}</div>
          ) : (
            <>
              <div role="timer" aria-live="off" style={{ fontSize: 48, fontWeight: 900, color: 'var(--warm-text)', fontVariantNumeric: 'tabular-nums' }}>{formatClock(left)}</div>
              {paused && <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text-muted)' }}>{t('timer.paused')}</div>}
            </>
          )}
        </Ring>
        {finished ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="tq-btn tq-btn-primary" style={big} onClick={onDone}>✓ {t('roomDetail.done')}</button>
            <button type="button" className="tq-btn tq-btn-secondary" style={big} onClick={onAddFive}>{t('timer.needMore')}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            {paused
              ? <button type="button" className="tq-btn tq-btn-primary" style={big} onClick={onResume}>▶ {t('timer.resume')}</button>
              : <button type="button" className="tq-btn tq-btn-primary" style={big} onClick={onPause}>⏸ {t('timer.pause')}</button>}
            <button type="button" className="tq-btn tq-btn-secondary" style={big} onClick={onAddFive}>+5 {t('timer.min')}</button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-muted)', flex: '1 1 200px' }}>
            {finished ? '' : noWakeLock ? t('timer.mayDim') : t('timer.keepsGoing')}
          </span>
          <button type="button" className="tq-btn tq-btn-sm" onClick={onStop}>■ {t('timer.stop')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The small bar at the top of every page while a timer runs (tap it to open the timer). */
export function ChoreTimerBar({ language }: { language?: string }) {
  const timer = useChoreTimer();
  const now = useTimerClock();
  const { t } = useTranslation(language || 'en');
  if (!timer?.state) return null;
  const s = timer.state;
  const finished = !!s.finishedAt;
  return (
    <button type="button" className="chore-timer-bar" onClick={timer.open} aria-label={`${s.name}: ${finished ? t('timer.timesUp') : formatClock(timeLeft(s, now))}`}>
      <span aria-hidden="true">⏱️</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900 }}>{finished ? t('timer.timesUp') : formatClock(timeLeft(s, now))}</span>
      {!finished && s.endsAt === null && <span style={{ fontWeight: 700, opacity: 0.8 }}>{t('timer.paused')}</span>}
      {/* width 0 + grow: a long name never widens the page */}
      <span style={{ flex: '1 1 0', width: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', fontWeight: 700 }}>{s.name}</span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

/**
 * "▶ 10 min" next to a chore's Done (only on chores with a timer). For kids it stands in for Done
 * until the timer ends. While this chore's timer runs it shows the time left and opens the timer.
 */
export function TimerStartButton({ task, language, primary, className = 'tq-btn tq-btn-sm' }: {
  task: TimerChore; language?: string; primary?: boolean; className?: string;
}) {
  const timer = useChoreTimer();
  const now = useTimerClock();
  const { t } = useTranslation(language || 'en');
  if (!timer || !task.timerMinutes) return null;
  const s = timer.state?.taskId === task.id ? timer.state : null;
  const label = s
    ? (s.finishedAt ? t('timer.timesUp') : `⏱️ ${formatClock(timeLeft(s, now))}`)
    : `▶ ${task.timerMinutes} ${t('timer.min')}`;
  return (
    <button type="button" className={`${className} ${primary ? 'tq-btn-primary' : 'tq-btn-secondary'}`}
      onClick={(e) => { e.stopPropagation(); if (s) timer.open(); else timer.start(task); }}
      title={s ? t('timer.open') : t('timer.startTitle').replace('{n}', String(task.timerMinutes))}
      aria-label={s ? t('timer.open') : t('timer.startTitle').replace('{n}', String(task.timerMinutes))}
      style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {label}
    </button>
  );
}
