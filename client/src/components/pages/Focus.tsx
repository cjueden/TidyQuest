import { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useChoreTimer } from '../../hooks/useChoreTimer';
import { taskCoins } from '../../utils/tasks';
import { TaskIcon } from '../icons/TaskIcons';
import { CoinIcon } from '../icons/UIIcons';
import { TimerStartButton } from '../shared/ChoreTimer';
import { choreSteps, loadSkips, orderLine, saveSkips } from '../../utils/focus';

/**
 * One thing at a time (NEW-2): today's line from the server (utils/focus.ts), one chore at a time,
 * big, with its steps as tick boxes. "Skip for now" moves a chore to the back of today's line (kept
 * on this device for the day).
 */

export interface FocusChore {
  id: number;
  name: string;
  translationKey?: string;
  iconKey?: string;
  effort: number;
  customCoins?: number | null;
  roomId: number;
  roomName: string;
  roomColor: string;
  roomAccent: string;
  timerMinutes?: number | null;
  /** JSON array of strings, or null */
  steps?: string | null;
  effectiveAssignedUserIds?: number[];
}

export interface FocusData {
  mode: 'button' | 'home';
  line: FocusChore[];
  done: number;
  openPerDay: number;
}

export function Focus({ focus, userId, language, coinsByEffort, gamificationEnabled, mission, roomName, onComplete, onSeeAll, onLeave, leaveLabel }: {
  focus: FocusData;
  userId: number;
  language?: string;
  coinsByEffort?: Record<number, number>;
  gamificationEnabled: boolean;
  /** Today's Rescue Mission (its chore pays multiplier × coins) */
  mission?: { taskId: number | null; multiplier: number } | null;
  roomName: (name: string, roomId: number) => string;
  /** Resolves true when the chore was recorded */
  onComplete: (taskId: number) => Promise<boolean>;
  onSeeAll: () => void;
  onLeave: () => void;
  leaveLabel: string;
}) {
  const { t, taskName } = useTranslation(language || 'en');
  const timer = useChoreTimer();
  const [skips, setSkips] = useState<number[]>(() => loadSkips(userId));
  // Done was tapped: hide it right away (the line reloads after the server records it)
  const [doneIds, setDoneIds] = useState<number[]>([]);
  const [ticked, setTicked] = useState<Record<number, number[]>>({});

  const line = orderLine(focus.line.filter((c) => !doneIds.includes(c.id)), skips);
  const current = line[0] ?? null;
  const total = focus.done + doneIds.filter((id) => focus.line.some((c) => c.id === id)).length + line.length;
  const doneCount = total - line.length;

  const skip = (id: number) => {
    const next = [...skips.filter((s) => s !== id), id];
    setSkips(next);
    saveSkips(userId, next);
  };
  const done = async (id: number) => {
    setDoneIds((prev) => [...prev, id]);
    const ok = await onComplete(id);
    if (!ok) setDoneIds((prev) => prev.filter((d) => d !== id));
  };
  const toggleStep = (taskId: number, i: number) => setTicked((prev) => {
    const now = prev[taskId] ?? [];
    return { ...prev, [taskId]: now.includes(i) ? now.filter((x) => x !== i) : [...now, i] };
  });

  const progress = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
      {total > 0 && total <= 14 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} style={{
              width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--warm-accent)',
              backgroundColor: i < doneCount ? 'var(--warm-accent)' : 'transparent',
            }} />
          ))}
        </div>
      )}
      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text-muted)' }}>
        {t('focus.progress').replace('{done}', String(doneCount)).replace('{total}', String(total))}
      </span>
    </div>
  );

  if (!current) {
    return (
      <div className="page-enter focus-page">
        {total > 0 && progress}
        <div className="tq-card tq-card-padded" style={{ textAlign: 'center', display: 'grid', gap: 14, padding: '36px 20px' }}>
          <div style={{ fontSize: 64 }} aria-hidden="true">{doneCount > 0 ? '🎉' : '🌤️'}</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--warm-text)' }}>{doneCount > 0 ? t('focus.allDone') : t('focus.nothing')}</div>
          {doneCount > 0 && (
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
              {doneCount === 1 ? t('focus.allDoneOne') : t('focus.allDoneText').replace('{n}', String(doneCount))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="tq-btn tq-btn-primary" onClick={onSeeAll}>{t('focus.seeAll')}</button>
            <button type="button" className="tq-btn tq-btn-secondary" onClick={onLeave}>{leaveLabel}</button>
          </div>
        </div>
      </div>
    );
  }

  const name = taskName(current.name, current.translationKey);
  const steps = choreSteps(current.steps);
  const isMission = !!mission?.taskId && mission.taskId === current.id;
  const coins = taskCoins(current, coinsByEffort) * (isMission ? mission!.multiplier : 1);
  const mustWait = !!timer?.mustWait(current);
  const next = line.slice(1, 3);
  const big = { padding: '16px 20px', fontSize: 18, borderRadius: 16, flex: '1 1 140px' } as const;

  return (
    <div className="page-enter focus-page">
      {progress}
      <div className="tq-card tq-card-padded" style={{ display: 'grid', gap: 18, padding: '28px 20px', textAlign: 'center' }}>
        <div style={{ width: 96, height: 96, margin: '0 auto', borderRadius: 28, backgroundColor: current.roomColor, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${current.roomAccent}55` }}>
          <TaskIcon iconKey={current.iconKey} size={60} />
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--warm-text)', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{name}</div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: 'var(--warm-text-light)', display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{roomName(current.roomName, current.roomId)}</span>
            {gamificationEnabled && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--warm-accent)', fontWeight: 900, fontSize: 18 }}>
                <CoinIcon />{coins}
              </span>
            )}
            {isMission && <span style={{ fontWeight: 800, fontSize: 12, padding: '3px 10px', borderRadius: 12, backgroundColor: 'var(--warm-accent-light)', color: 'var(--warm-accent)' }}>🚑 {t('rescue.title')} ×{mission!.multiplier}</span>}
          </div>
        </div>
        {steps.length > 0 && (
          <div style={{ display: 'grid', gap: 8, textAlign: 'left', maxWidth: 440, width: '100%', margin: '0 auto' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text-light)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('focus.steps')}</div>
            {steps.map((step, i) => {
              const on = (ticked[current.id] ?? []).includes(i);
              return (
                <label key={i} className="focus-step" style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                  border: `2px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                  backgroundColor: on ? 'var(--warm-accent-light)' : 'var(--warm-bg-subtle)',
                }}>
                  <input type="checkbox" checked={on} onChange={() => toggleStep(current.id, i)} style={{ width: 22, height: 22, accentColor: 'var(--warm-accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--warm-text)', textDecoration: on ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{step}</span>
                </label>
              );
            })}
          </div>
        )}
        {mustWait && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warm-text-muted)' }}>{t('focus.timerFirst')}</div>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {current.timerMinutes ? (
            <TimerStartButton task={{ ...current, name }} language={language} primary={mustWait} className="tq-btn focus-big-btn" />
          ) : null}
          {!mustWait && (
            <button type="button" className="tq-btn tq-btn-primary" style={big} onClick={() => done(current.id)}>✓ {t('roomDetail.done')}</button>
          )}
        </div>
        {line.length > 1 && (
          <button type="button" className="tq-btn tq-btn-secondary" style={{ justifySelf: 'center' }} onClick={() => skip(current.id)}>
            ⏭ {t('focus.skip')}
          </button>
        )}
      </div>
      {next.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: 'var(--warm-text-light)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{t('focus.upNext')}</span>
          {next.map((c) => (
            <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12, border: '1.5px solid var(--warm-border)', color: 'var(--warm-text-muted)', overflowWrap: 'anywhere' }}>
              <TaskIcon iconKey={c.iconKey} size={14} /> {taskName(c.name, c.translationKey)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
